-- =====================================================================
-- سكة (Sikka) — تفاوض بالسعر في الاتجاهين (مش بس الدليفري)
-- الجزء ده إضافي فوق pricing-negotiation-schema.sql + customer-offers-rpc.sql
-- (لازم يكونوا اتشغّلوا قبل كده). انسخ السكريبت ده كله والصقه في:
-- Supabase Dashboard > SQL Editor > New query، وبعدين دوس Run.
-- آمن تشغله أكتر من مرة (idempotent).
--
-- الفكرة: order_offers فيها عمود جديد last_action_by بيقول آخر واحد
-- عدّل السعر (courier / customer). كده كل طرف يقدر يشوف: "ده عرضي وباستنى
-- رد التاني" أو "التاني رد عليّ بسعر جديد، اقبله أو رد عليه تاني" — من
-- غير حد أقصى لعدد المرات.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) عمود يتتبّع آخر طرف عدّل السعر في كل عرض
-- ---------------------------------------------------------------------
alter table public.order_offers
  add column if not exists last_action_by text
    not null default 'courier'
    check (last_action_by in ('courier', 'customer'));

-- ---------------------------------------------------------------------
-- 2) تحديث submit_or_update_offer عشان يعلّم إن آخر تعديل كان من الدليفري
-- (نفس الدالة القديمة، بس بنضيف last_action_by = 'courier')
-- ---------------------------------------------------------------------
create or replace function public.submit_or_update_offer(
  p_order_id uuid,
  p_price numeric
)
returns public.order_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_offer public.order_offers;
begin
  if p_price is null or p_price <= 0 then
    raise exception 'السعر المقترح لازم يكون رقم أكبر من صفر';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'الأوردر غير موجود';
  end if;
  if v_order.status <> 'new' then
    raise exception 'الأوردر ده اتقفل بالفعل، مينفعش تعرض عليه';
  end if;

  insert into public.order_offers (order_id, courier_id, offered_price, status, last_action_by, updated_at)
    values (p_order_id, auth.uid(), p_price, 'pending', 'courier', now())
  on conflict (order_id, courier_id)
  do update set offered_price = excluded.offered_price,
                status = 'pending',
                last_action_by = 'courier',
                updated_at = now()
  returning * into v_offer;

  return v_offer;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) العميل يرد على عرض دليفري معيّن بسعر تاني (بدل ما يقبل على طول)
-- يقدر يستخدمها أكتر من مرة على نفس العرض، زي بالظبط الدليفري
-- ---------------------------------------------------------------------
create or replace function public.customer_counter_offer(
  p_offer_id uuid,
  p_price numeric
)
returns public.order_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.order_offers;
  v_order public.orders;
begin
  if p_price is null or p_price <= 0 then
    raise exception 'السعر المقترح لازم يكون رقم أكبر من صفر';
  end if;

  select * into v_offer from public.order_offers where id = p_offer_id for update;
  if v_offer is null then
    raise exception 'العرض غير موجود';
  end if;

  select * into v_order from public.orders where id = v_offer.order_id for update;
  if v_order is null then
    raise exception 'الأوردر غير موجود';
  end if;
  if v_order.customer_id <> auth.uid() then
    raise exception 'العملية دي مش ليك';
  end if;
  if v_order.status <> 'new' then
    raise exception 'الأوردر ده اتقفل بالفعل';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'العرض ده مبقاش متاح';
  end if;

  update public.order_offers
    set offered_price = p_price,
        last_action_by = 'customer',
        updated_at = now()
    where id = p_offer_id
    returning * into v_offer;

  return v_offer;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) الدليفري يقبل السعر الحالي لعرضه هو (اللي ممكن يكون العميل رد
-- عليه بسعر تاني) — بيقفل الأوردر بنفس منطق customer_accept_offer
-- ---------------------------------------------------------------------
create or replace function public.courier_accept_offer(p_offer_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.order_offers;
  v_order public.orders;
begin
  select * into v_offer from public.order_offers where id = p_offer_id for update;
  if v_offer is null then
    raise exception 'العرض غير موجود';
  end if;
  if v_offer.courier_id <> auth.uid() then
    raise exception 'العملية دي مش ليك';
  end if;

  select * into v_order from public.orders where id = v_offer.order_id for update;
  if v_order is null then
    raise exception 'الأوردر غير موجود';
  end if;
  if v_order.status <> 'new' then
    raise exception 'الأوردر ده اتقفل بالفعل';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'العرض ده مبقاش متاح';
  end if;

  update public.orders
    set courier_id = v_offer.courier_id,
        status = 'claimed',
        price = v_offer.offered_price
    where id = v_order.id
    returning * into v_order;

  update public.order_offers
    set status = 'accepted', updated_at = now()
    where id = p_offer_id;

  -- رفض أي عروض تانية معلّقة على نفس الأوردر
  update public.order_offers
    set status = 'rejected', updated_at = now()
    where order_id = v_order.id and id <> p_offer_id and status = 'pending';

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) تحديث get_my_pending_offers عشان يرجّع last_action_by كمان
-- (العميل محتاجها يعرف مين آخر واحد عدّل السعر)
-- ---------------------------------------------------------------------
create or replace function public.get_my_pending_offers()
returns table (
  id uuid,
  order_id uuid,
  courier_id uuid,
  offered_price numeric,
  last_action_by text,
  created_at timestamptz,
  courier_name text,
  courier_phone text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      oo.id,
      oo.order_id,
      oo.courier_id,
      oo.offered_price,
      oo.last_action_by,
      oo.created_at,
      p.full_name,
      p.phone
    from public.order_offers oo
    join public.orders o on o.id = oo.order_id
    join public.profiles p on p.id = oo.courier_id
    where o.customer_id = auth.uid()
      and oo.status = 'pending'
    order by oo.order_id, oo.offered_price asc, oo.created_at asc;
end;
$$;

-- =====================================================================
-- 6) نخلي PostgREST يقرأ الأعمدة والدوال الجديدة فوراً
-- =====================================================================
notify pgrst, 'reload schema';
