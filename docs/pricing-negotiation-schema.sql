-- =====================================================================
-- سكة (Sikka) — نظام التفاوض على سعر التوصيل
-- الجزء ده إضافي فوق docs/supabase-schema.sql الأساسي (لازم يكون
-- اتشغل قبل كده). انسخ السكريبت ده كله والصقه في:
-- Supabase Dashboard > SQL Editor > New query، وبعدين دوس Run.
-- آمن تشغله أكتر من مرة (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) عمود السعر على orders
-- مفيش سعر توصيل في الجدول أصلاً دلوقتي، فبنضيفه هنا. لو أوردر جديد
-- اتعمل من غير سعر (لسه شاشة العميل ما اتعدلتش)، بياخد الحد الأدنى
-- تلقائي عشان التطبيق يفضل شغال بين الخطوة دي والخطوة اللي بعدها.
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists price numeric(10,2);

-- ---------------------------------------------------------------------
-- 2) إعدادات الأدمن (صف واحد ثابت id = 1)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  id smallint primary key default 1,
  min_delivery_price numeric(10,2) not null default 10.00,
  commission_amount numeric(10,2) not null default 2.00,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

insert into public.app_settings (id, min_delivery_price, commission_amount)
values (1, 10.00, 2.00)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- أي يوزر مسجل دخول يقدر يقرأ الإعدادات (محتاجها وقت عمل أوردر جديد)
drop policy if exists "app_settings_select_authenticated" on public.app_settings;
create policy "app_settings_select_authenticated"
  on public.app_settings for select
  using (auth.uid() is not null);

-- ملحوظة: مفيش UPDATE policy مباشر — التعديل بس من خلال
-- admin_update_app_settings() تحت دي (security definer + is_admin())

-- ---------------------------------------------------------------------
-- تريجر: أي أوردر جديد من غير سعر ياخد الحد الأدنى تلقائي، ولو السعر
-- أقل من الحد الأدنى يترفض
-- ---------------------------------------------------------------------
create or replace function public.validate_order_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min numeric;
begin
  select min_delivery_price into v_min from public.app_settings where id = 1;
  v_min := coalesce(v_min, 0);

  if new.price is null then
    new.price := v_min;
  elsif new.price < v_min then
    raise exception 'سعر التوصيل لازم يكون % جنيه على الأقل', v_min;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_validate_price on public.orders;
create trigger trg_orders_validate_price
  before insert on public.orders
  for each row execute function public.validate_order_price();

-- ---------------------------------------------------------------------
-- 3) جدول order_offers — عروض الدليفريين على أوردر معيّن
-- قفل فريد (order_id, courier_id) عشان الدليفري لما "يعدّل" عرضه،
-- يتحدّث نفس الصف (upsert) مش يتعمل صف جديد كل مرة.
-- ---------------------------------------------------------------------
create table if not exists public.order_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_id uuid not null references public.profiles(id) on delete cascade,
  offered_price numeric(10,2) not null check (offered_price > 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, courier_id)
);

alter table public.order_offers enable row level security;

-- الدليفري يشوف عروضه هو بس
drop policy if exists "order_offers_select_courier_own" on public.order_offers;
create policy "order_offers_select_courier_own"
  on public.order_offers for select
  using (auth.uid() = courier_id);

-- العميل يشوف كل العروض على أوردراته هو
drop policy if exists "order_offers_select_customer_own_orders" on public.order_offers;
create policy "order_offers_select_customer_own_orders"
  on public.order_offers for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_offers.order_id and o.customer_id = auth.uid()
    )
  );

-- الأدمن يشوف كل العروض
drop policy if exists "order_offers_select_admin_all" on public.order_offers;
create policy "order_offers_select_admin_all"
  on public.order_offers for select
  using (public.is_admin());

-- ملحوظة: مفيش INSERT/UPDATE policy مباشر على order_offers — كل الكتابة
-- بتتم بس من خلال الدوال (security definer) تحت دي، عشان نضمن إن
-- التزامن (أكتر من دليفري/قبول في نفس اللحظة) بيتحكم فيه صح.

create index if not exists idx_order_offers_order on public.order_offers(order_id);
create index if not exists idx_order_offers_courier on public.order_offers(courier_id);
create index if not exists idx_order_offers_status on public.order_offers(status);

drop trigger if exists trg_order_offers_updated_at on public.order_offers;
create trigger trg_order_offers_updated_at
  before update on public.order_offers
  for each row execute function public.set_updated_at();

-- تفعيل الـ Realtime على order_offers (عشان العميل يشوف العروض لايف،
-- والدليفري يعرف لو عرضه اتقبل/اترفض)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_offers'
  ) then
    alter publication supabase_realtime add table public.order_offers;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4) الدليفري يعرض سعر جديد / يعدّل عرضه (يقدر يستخدمها أكتر من مرة)
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

  -- قفل صف الأوردر عشان نتأكد إنه لسه "متاح" وقت العرض
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'الأوردر غير موجود';
  end if;
  if v_order.status <> 'new' then
    raise exception 'الأوردر ده اتقفل بالفعل، مينفعش تعرض عليه';
  end if;

  insert into public.order_offers (order_id, courier_id, offered_price, status, updated_at)
    values (p_order_id, auth.uid(), p_price, 'pending', now())
  on conflict (order_id, courier_id)
  do update set offered_price = excluded.offered_price,
                status = 'pending',
                updated_at = now()
  returning * into v_offer;

  return v_offer;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) الدليفري يقبل بالسعر الأصلي (أول واحد يضغط ياخد الأوردر)
-- ---------------------------------------------------------------------
create or replace function public.courier_accept_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'الأوردر غير موجود';
  end if;
  if v_order.status <> 'new' then
    raise exception 'الأوردر ده اتاخد بالفعل';
  end if;

  update public.orders
    set courier_id = auth.uid(), status = 'claimed'
    where id = p_order_id
    returning * into v_order;

  -- إلغاء أي عروض تانية معلّقة على نفس الأوردر
  update public.order_offers
    set status = 'rejected', updated_at = now()
    where order_id = p_order_id and status = 'pending';

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) العميل يقبل عرض معيّن من دليفري
-- ---------------------------------------------------------------------
create or replace function public.customer_accept_offer(p_offer_id uuid)
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
-- 7) الأدمن يعدّل الحد الأدنى للسعر وقيمة العمولة الثابتة
-- ---------------------------------------------------------------------
create or replace function public.admin_update_app_settings(
  p_min_delivery_price numeric,
  p_commission_amount numeric
)
returns public.app_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.app_settings;
begin
  if not public.is_admin() then
    raise exception 'العملية دي مسموحة للأدمن بس';
  end if;
  if p_min_delivery_price is null or p_min_delivery_price < 0 then
    raise exception 'الحد الأدنى للسعر لازم يكون رقم موجب';
  end if;
  if p_commission_amount is null or p_commission_amount < 0 then
    raise exception 'قيمة العمولة لازم تكون رقم موجب';
  end if;

  update public.app_settings
    set min_delivery_price = p_min_delivery_price,
        commission_amount = p_commission_amount,
        updated_at = now()
    where id = 1
    returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 8) تحديث تريجر خصم العمولة عشان يقرأ القيمة من app_settings بدل
-- الرقم الثابت (2.00) اللي كان مكتوب جوه الكود
-- ---------------------------------------------------------------------
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
    select wallet_balance into v_balance from public.profiles where id = new.courier_id;

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
    update public.profiles set wallet_balance = wallet_balance + v_fee where id = old.courier_id;

    insert into public.wallet_transactions (user_id, type, amount, order_id, note)
      values (old.courier_id, 'refund', v_fee, new.id, 'استرجاع رسوم — إلغاء أوردر');
  end if;

  return new;
end;
$$;

-- =====================================================================
-- 9) نخلي PostgREST يقرأ الجداول والدوال الجديدة فوراً
-- =====================================================================
notify pgrst, 'reload schema';
