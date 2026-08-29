-- =====================================================================
-- سكة (Sikka) — إصلاح Race Condition في خصم عمولة المحفظة
-- الجزء ده إضافي فوق pricing-negotiation-schema.sql (لازم يكون
-- اتشغل قبل كده). انسخ السكريبت ده كله والصقه في:
-- Supabase Dashboard > SQL Editor > New query، وبعدين دوس Run.
-- آمن تشغله أكتر من مرة (idempotent).
--
-- المشكلة: لو نفس الدليفري قبِل أوردرين في نفس اللحظة (تاب مفتوح
-- مرتين، أو ضغط بسرعة)، الـ trigger كان بيقرا رصيد المحفظة بـ select
-- عادي (من غير قفل)، فالعمليتين ممكن يقروا نفس الرصيد الأصلي، الاتنين
-- يعدّوا الـ check، ويخصموا العمولة مرتين — الرصيد يعدّي بالسالب.
--
-- الحل: نقفل صف الدليفري في profiles بـ `for update` قبل أي قراءة
-- للرصيد، بنفس الأسلوب المستخدم أصلاً في قفل صفوف orders/order_offers.
-- الأوردر اللي فيه صف orders مقفول بالفعل من الدالة اللي نادت على
-- الـ trigger (courier_accept_order / customer_accept_offer /
-- courier_accept_offer)، فترتيب القفل دايمًا: orders/order_offers
-- الأول وبعدين profiles — نفس الترتيب في كل مسار، فمفيش احتمال deadlock.
-- =====================================================================

create or replace function public.handle_order_wallet_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee numeric;
  v_balance numeric;
begin
  select commission_amount into v_fee from public.app_settings where id = 1;
  v_fee := coalesce(v_fee, 2.00);

  -- حالة 1: الدليفري بياخد أوردر جديد (new -> claimed) => خصم العمولة
  if new.status = 'claimed' and old.status = 'new' and new.courier_id is not null then
    -- نقفل صف الدليفري الأول عشان نمنع أي عملية تانية (أوردر تاني، أو
    -- سحب من المحفظة) تقرا/تعدّل نفس الرصيد في نفس اللحظة
    select wallet_balance into v_balance
      from public.profiles
      where id = new.courier_id
      for update;

    if v_balance is null or v_balance < v_fee then
      raise exception 'رصيد المحفظة مش كافي — لازم تشحن % جنيه على الأقل قبل ما تاخد أوردر', v_fee;
    end if;

    update public.profiles set wallet_balance = wallet_balance - v_fee where id = new.courier_id;

    insert into public.wallet_transactions (user_id, type, amount, order_id, note)
      values (new.courier_id, 'order_fee', v_fee, new.id, 'رسوم أوردر');
  end if;

  -- حالة 2: الدليفري بيلغي الأوردر ويرجعه "متاح" تاني => استرجاع الرسوم
  if new.status = 'new' and new.courier_id is null
     and old.status in ('claimed', 'on_the_way') and old.courier_id is not null then
    -- نفس القفل هنا كمان عشان الاسترجاع ميتصادمش مع خصم متزامن على
    -- نفس الدليفري من أوردر تاني
    perform 1 from public.profiles where id = old.courier_id for update;

    update public.profiles set wallet_balance = wallet_balance + v_fee where id = old.courier_id;

    insert into public.wallet_transactions (user_id, type, amount, order_id, note)
      values (old.courier_id, 'refund', v_fee, new.id, 'استرجاع رسوم — إلغاء أوردر');
  end if;

  return new;
end;
$$;

-- =====================================================================
-- نخلي PostgREST يقرأ الدالة المحدّثة فورًا
-- =====================================================================
notify pgrst, 'reload schema';
