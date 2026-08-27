-- =====================================================================
-- سكة (Sikka) — قاعدة البيانات على Supabase
-- انسخ الملف ده كله والصقه في: Supabase Dashboard > SQL Editor > New query
-- وبعدين دوس Run
-- السكريبت ده آمن تشغله أكتر من مرة (idempotent) — مش هيدي إيرور لو
-- الجداول أو السياسات كانت موجودة بالفعل من مرة قبل كده.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) جدول profiles — بيانات كل يوزر (عميل أو دليفري)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  role text not null check (role in ('customer', 'courier')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- كل يوزر يقدر يشوف بروفايله بس
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- كل يوزر يقدر يعدل بروفايله بس
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- كل يوزر يقدر يعمل بروفايل لنفسه وقت التسجيل
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------
-- 2) جدول orders — الأوردرات
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  courier_id uuid references public.profiles(id) on delete set null,
  description text not null,
  location text not null,
  phone text not null,
  status text not null default 'new'
    check (status in ('new', 'claimed', 'on_the_way', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ترحيل (Migration): لو الجدول كان اتعمل قبل كده بعمود قديم اسمه
-- delivery_location بدل location، نغيّر اسمه هنا تلقائياً بدون ما نفقد بيانات
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'delivery_location'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'location'
  ) then
    alter table public.orders rename column delivery_location to location;
  end if;
end $$;

alter table public.orders enable row level security;

-- تحديث updated_at تلقائياً مع أي تعديل
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3) سياسات الأمان (RLS Policies) على orders
-- ---------------------------------------------------------------------

-- العميل: يشوف أوردراته هو بس
drop policy if exists "orders_select_customer_own" on public.orders;
create policy "orders_select_customer_own"
  on public.orders for select
  using (auth.uid() = customer_id);

-- الدليفري: يشوف كل الأوردرات "الجديدة" + الأوردر اللي هو خده
drop policy if exists "orders_select_courier_visible" on public.orders;
create policy "orders_select_courier_visible"
  on public.orders for select
  using (
    status = 'new'
    or auth.uid() = courier_id
  );

-- العميل: يقدر يعمل أوردر جديد لنفسه بس
drop policy if exists "orders_insert_customer_own" on public.orders;
create policy "orders_insert_customer_own"
  on public.orders for insert
  with check (auth.uid() = customer_id);

-- العميل: يقدر يلغي أوردره هو بس (لو لسه مش تم تسليمه)
drop policy if exists "orders_update_customer_cancel" on public.orders;
create policy "orders_update_customer_cancel"
  on public.orders for update
  using (auth.uid() = customer_id and status != 'delivered')
  with check (auth.uid() = customer_id);

-- الدليفري: ياخد أوردر "جديد" بس (يمنع اتنين دليفري ياخدوا نفس الأوردر
-- في نفس اللحظة — الشرط status = 'new' بيتحقق وقت التنفيذ في الداتابيز نفسها)
drop policy if exists "orders_update_courier_claim" on public.orders;
create policy "orders_update_courier_claim"
  on public.orders for update
  using (status = 'new')
  with check (auth.uid() = courier_id);

-- الدليفري: يقدر يحدّث حالة الأوردر اللي هو خده بس
-- (في الطريق / تم التسليم / إلغاء)
drop policy if exists "orders_update_courier_own" on public.orders;
create policy "orders_update_courier_own"
  on public.orders for update
  using (auth.uid() = courier_id)
  with check (auth.uid() = courier_id);

-- ---------------------------------------------------------------------
-- 4) تفعيل الـ Realtime على جدول orders
-- (ده اللي بيخلي تحديثات الحالة تظهر لايف من غير Refresh)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5) Index لتسريع قراءة الأوردرات المتاحة
-- ---------------------------------------------------------------------
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_orders_courier on public.orders(courier_id);

-- =====================================================================
-- 6) المحفظة (Wallet) — رصيد الدليفري + الشحن/السحب + خصم 2 جنيه لكل أوردر
-- =====================================================================

-- عمود الرصيد على البروفايل
alter table public.profiles
  add column if not exists wallet_balance numeric(10,2) not null default 0;

-- سجل حركات المحفظة
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('topup', 'withdraw', 'order_fee', 'refund')),
  amount numeric(10,2) not null check (amount > 0),
  order_id uuid references public.orders(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;

-- كل يوزر يشوف حركاته هو بس
drop policy if exists "wallet_tx_select_own" on public.wallet_transactions;
create policy "wallet_tx_select_own"
  on public.wallet_transactions for select
  using (auth.uid() = user_id);

-- ملحوظة: مفيش INSERT policy للعميل مباشرة — كل الحركات (شحن/سحب/خصم أوردر/استرجاع)
-- بتتعمل بس من خلال الدوال (functions) اللي تحت دي، وهي شغالة بصلاحية "security definer"
-- عشان محدش يقدر يزوّد رصيده يدوي عن طريق التلاعب في الداتا مباشرة.

create index if not exists idx_wallet_tx_user on public.wallet_transactions(user_id);

-- ---------------------------------------------------------------------
-- شحن المحفظة (Top-up) — الدليفري بيشحن رصيده بنفسه (فودافون كاش / انستاباي)
-- ---------------------------------------------------------------------
drop function if exists public.wallet_topup(numeric);

create or replace function public.wallet_topup(
  p_amount numeric,
  p_method text default null,
  p_reference text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance numeric;
  v_method_label text;
  v_note text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'المبلغ لازم يكون أكبر من صفر';
  end if;

  v_method_label := case p_method
    when 'vodafone_cash' then 'فودافون كاش'
    when 'instapay' then 'انستاباي'
    else null
  end;

  v_note := case
    when v_method_label is not null and p_reference is not null
      then 'شحن عبر ' || v_method_label || ' — ' || p_reference
    when v_method_label is not null
      then 'شحن عبر ' || v_method_label
    else 'شحن محفظة'
  end;

  update public.profiles
    set wallet_balance = wallet_balance + p_amount
    where id = auth.uid()
    returning wallet_balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'المستخدم غير موجود';
  end if;

  insert into public.wallet_transactions (user_id, type, amount, note)
    values (auth.uid(), 'topup', p_amount, v_note);

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- سحب من المحفظة (Withdraw) — فودافون كاش / انستاباي
-- ---------------------------------------------------------------------
drop function if exists public.wallet_withdraw(numeric);

create or replace function public.wallet_withdraw(
  p_amount numeric,
  p_method text default null,
  p_reference text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_new_balance numeric;
  v_method_label text;
  v_note text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'المبلغ لازم يكون أكبر من صفر';
  end if;

  v_method_label := case p_method
    when 'vodafone_cash' then 'فودافون كاش'
    when 'instapay' then 'انستاباي'
    else null
  end;

  v_note := case
    when v_method_label is not null and p_reference is not null
      then 'سحب عبر ' || v_method_label || ' — ' || p_reference
    when v_method_label is not null
      then 'سحب عبر ' || v_method_label
    else 'سحب من المحفظة'
  end;

  select wallet_balance into v_balance from public.profiles where id = auth.uid();

  if v_balance is null then
    raise exception 'المستخدم غير موجود';
  end if;

  if v_balance < p_amount then
    raise exception 'الرصيد مش كافي';
  end if;

  update public.profiles
    set wallet_balance = wallet_balance - p_amount
    where id = auth.uid()
    returning wallet_balance into v_new_balance;

  insert into public.wallet_transactions (user_id, type, amount, note)
    values (auth.uid(), 'withdraw', p_amount, v_note);

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- خصم رسوم الأوردر (2 جنيه) تلقائي لما الدليفري ياخد أوردر،
-- واسترجاعها تلقائي لو لغى الأوردر قبل ما يسلمه
-- ---------------------------------------------------------------------
create or replace function public.handle_order_wallet_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee constant numeric := 2.00;
  v_balance numeric;
begin
  -- حالة 1: الدليفري بياخد أوردر جديد (new -> claimed) => خصم 2 جنيه
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

drop trigger if exists trg_orders_wallet_fee on public.orders;
create trigger trg_orders_wallet_fee
  before update on public.orders
  for each row execute function public.handle_order_wallet_fee();

-- =====================================================================
-- 8) لوحة تحكم الأدمن (Admin Dashboard)
-- =====================================================================

-- نسمح بدور "admin" جنب customer و courier
-- (الأدمن مبيتسجلش من شاشة التسجيل العادية — بيتحول له اليوزر يدوي من هنا)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('customer', 'courier', 'admin'));

-- دالة بتتأكد إن اليوزر الحالي أدمن — security definer عشان
-- تتخطى الـ RLS بتاعة profiles وما تعملش recursion لانهائي
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- الأدمن يشوف كل البروفايلات (عملاء + دليفريز)
drop policy if exists "profiles_select_admin_all" on public.profiles;
create policy "profiles_select_admin_all"
  on public.profiles for select
  using (public.is_admin());

-- الأدمن يقدر يعدّل أي بروفايل (مثلاً يغيّر دور يوزر)
drop policy if exists "profiles_update_admin_all" on public.profiles;
create policy "profiles_update_admin_all"
  on public.profiles for update
  using (public.is_admin());

-- الأدمن يشوف كل الأوردرات (مش بس الجديدة / بتاعته)
drop policy if exists "orders_select_admin_all" on public.orders;
create policy "orders_select_admin_all"
  on public.orders for select
  using (public.is_admin());

-- الأدمن يقدر يعدّل/يلغي أي أوردر
drop policy if exists "orders_update_admin_all" on public.orders;
create policy "orders_update_admin_all"
  on public.orders for update
  using (public.is_admin())
  with check (public.is_admin());

-- الأدمن يقدر يحذف أوردر نهائي (تنظيف بيانات تجريبية مثلاً)
drop policy if exists "orders_delete_admin_all" on public.orders;
create policy "orders_delete_admin_all"
  on public.orders for delete
  using (public.is_admin());

-- تحديث دالة رسوم المحفظة عشان لو الأدمن لغى أوردر كان "مأخوذ"/"في الطريق"
-- (status -> cancelled) يترجع لصاحب الأوردر رسوم الـ 2 جنيه اللي اتخصمت منه
create or replace function public.handle_order_wallet_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee constant numeric := 2.00;
  v_balance numeric;
begin
  -- حالة 1: الدليفري بياخد أوردر جديد (new -> claimed) => خصم 2 جنيه
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

  -- حالة 3: الأدمن بيلغي أوردر معاه دليفري (claimed/on_the_way -> cancelled) => استرجاع الرسوم
  if new.status = 'cancelled'
     and old.status in ('claimed', 'on_the_way') and old.courier_id is not null then
    update public.profiles set wallet_balance = wallet_balance + v_fee where id = old.courier_id;

    insert into public.wallet_transactions (user_id, type, amount, order_id, note)
      values (old.courier_id, 'refund', v_fee, new.id, 'استرجاع رسوم — إلغاء الأوردر من الإدارة');
  end if;

  return new;
end;
$$;

-- =====================================================================
-- 9) تعديل الأدمن لرصيد أي دليفري يدوياً + سجل مراجعة (Audit Log)
-- =====================================================================

-- عمود admin_id: مين الأدمن اللي عمل التعديل (لو الحركة نوعها admin_adjustment)
alter table public.wallet_transactions
  add column if not exists admin_id uuid references public.profiles(id) on delete set null;

-- نضيف نوع حركة جديد admin_adjustment للنوع
alter table public.wallet_transactions drop constraint if exists wallet_transactions_type_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_type_check
  check (type in ('topup', 'withdraw', 'order_fee', 'refund', 'admin_adjustment'));

-- تعديلات الأدمن ممكن تكون سالبة (خصم) أو موجبة (إضافة) وأي قيمة غير الصفر،
-- بينما باقي الأنواع (شحن/سحب/رسوم/استرجاع) لازم تفضل موجبة زي ما هي
alter table public.wallet_transactions drop constraint if exists wallet_transactions_amount_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_amount_check
  check (
    (type = 'admin_adjustment' and amount <> 0)
    or (type <> 'admin_adjustment' and amount > 0)
  );

-- الأدمن يشوف كل حركات المحفظة بتاعة كل اليوزرز (مش بس حركاته هو)
drop policy if exists "wallet_tx_select_admin_all" on public.wallet_transactions;
create policy "wallet_tx_select_admin_all"
  on public.wallet_transactions for select
  using (public.is_admin());

-- الدالة اللي بتعمل التعديل — بتتأكد إن اللي بينفذها أدمن فعلاً جوه
-- الداتابيز نفسها (security definer + is_admin()) مش بس اعتماد على الواجهة،
-- وبترفض تخصم مبلغ هيخلي الرصيد يبقى بالسالب، وبتسجل سبب التعديل إجباري
create or replace function public.admin_adjust_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_note text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_new_balance numeric;
begin
  if not public.is_admin() then
    raise exception 'العملية دي مسموحة للأدمن بس';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'المبلغ لازم يكون مختلف عن صفر';
  end if;

  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'لازم تكتب سبب التعديل';
  end if;

  select wallet_balance into v_balance from public.profiles where id = p_user_id;
  if v_balance is null then
    raise exception 'المستخدم غير موجود';
  end if;

  if v_balance + p_amount < 0 then
    raise exception 'الرصيد الحالي (% ج.م) مش كافي للخصم ده', v_balance;
  end if;

  update public.profiles
    set wallet_balance = wallet_balance + p_amount
    where id = p_user_id
    returning wallet_balance into v_new_balance;

  insert into public.wallet_transactions (user_id, type, amount, note, admin_id)
    values (p_user_id, 'admin_adjustment', p_amount, trim(p_note), auth.uid());

  return v_new_balance;
end;
$$;

-- =====================================================================
-- 10) طلبات شحن المحفظة بالتحويل (كاش / انستاباي) + مراجعة الأدمن
-- =====================================================================

-- ---------------------------------------------------------------------
-- 10.1) محافظ الاستلام اللي الأدمن بيضيفها (رقم كاش / لينك انستاباي)
-- ---------------------------------------------------------------------
create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('cash', 'instapay')),
  label text not null,
  value text not null, -- رقم المحفظة (كاش) أو لينك/معرّف انستاباي
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.payment_accounts enable row level security;

-- أي يوزر مسجل دخول يقدر يشوف المحافظ المفعّلة بس (عشان يحوّل عليها)
drop policy if exists "payment_accounts_select_active" on public.payment_accounts;
create policy "payment_accounts_select_active"
  on public.payment_accounts for select
  using (auth.uid() is not null and (active = true or public.is_admin()));

-- الأدمن بس اللي يضيف / يعدّل / يمسح
drop policy if exists "payment_accounts_admin_all" on public.payment_accounts;
create policy "payment_accounts_admin_all"
  on public.payment_accounts for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 10.2) طلبات شحن المحفظة — الدليفري يحوّل ويرفع إسكرين، والأدمن يراجع
-- ---------------------------------------------------------------------
create table if not exists public.topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  payment_account_id uuid references public.payment_accounts(id) on delete set null,
  amount numeric(10,2) not null check (amount > 0),
  screenshot_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.topup_requests enable row level security;

drop policy if exists "topup_requests_select_own" on public.topup_requests;
create policy "topup_requests_select_own"
  on public.topup_requests for select
  using (auth.uid() = user_id);

drop policy if exists "topup_requests_select_admin_all" on public.topup_requests;
create policy "topup_requests_select_admin_all"
  on public.topup_requests for select
  using (public.is_admin());

-- ملحوظة: مفيش INSERT/UPDATE policy مباشرة — كل حاجة عن طريق الدوال تحت دي بس.
create index if not exists idx_topup_requests_user on public.topup_requests(user_id);
create index if not exists idx_topup_requests_status on public.topup_requests(status);

-- ---------------------------------------------------------------------
-- 10.3) باكت تخزين إسكرينات التحويل (خاص، مش عام)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('topup-screenshots', 'topup-screenshots', false)
  on conflict (id) do nothing;

-- كل يوزر يرفع بس جوه فولدر اسمه بمعرّفه هو (user_id/...)
drop policy if exists "topup_screenshots_insert_own" on storage.objects;
create policy "topup_screenshots_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'topup-screenshots'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- كل يوزر يشوف بس اللي رفعه هو
drop policy if exists "topup_screenshots_select_own" on storage.objects;
create policy "topup_screenshots_select_own"
  on storage.objects for select
  using (
    bucket_id = 'topup-screenshots'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- ---------------------------------------------------------------------
-- 10.4) الدليفري بيبعت طلب الشحن (بعد ما يرفع الإسكرين للتخزين)
-- ---------------------------------------------------------------------
create or replace function public.submit_topup_request(
  p_payment_account_id uuid,
  p_amount numeric,
  p_screenshot_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'المبلغ لازم يكون أكبر من صفر';
  end if;

  if p_screenshot_path is null or length(trim(p_screenshot_path)) = 0 then
    raise exception 'لازم ترفع إسكرين إثبات التحويل';
  end if;

  insert into public.topup_requests (user_id, payment_account_id, amount, screenshot_path)
    values (auth.uid(), p_payment_account_id, p_amount, p_screenshot_path)
    returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 10.5) الأدمن يوافق / يرفض طلب الشحن — الموافقة بتزوّد الرصيد فعلياً
-- ---------------------------------------------------------------------
create or replace function public.admin_review_topup_request(
  p_request_id uuid,
  p_approve boolean,
  p_admin_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_new_balance numeric;
  v_method_label text;
begin
  if not public.is_admin() then
    raise exception 'العملية دي مسموحة للأدمن بس';
  end if;

  select * into v_req from public.topup_requests where id = p_request_id for update;
  if v_req is null then
    raise exception 'الطلب غير موجود';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'الطلب ده اتراجع قبل كده';
  end if;

  if p_approve then
    select label into v_method_label from public.payment_accounts where id = v_req.payment_account_id;

    update public.profiles
      set wallet_balance = wallet_balance + v_req.amount
      where id = v_req.user_id
      returning wallet_balance into v_new_balance;

    insert into public.wallet_transactions (user_id, type, amount, note)
      values (
        v_req.user_id, 'topup', v_req.amount,
        'شحن بالتحويل' || case when v_method_label is not null then ' — ' || v_method_label else '' end
      );

    update public.topup_requests
      set status = 'approved', admin_note = p_admin_note, reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_request_id;
  else
    update public.topup_requests
      set status = 'rejected', admin_note = p_admin_note, reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_request_id;

    select wallet_balance into v_new_balance from public.profiles where id = v_req.user_id;
  end if;

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- عشان تحوّل يوزر عادي لأدمن: سجّل بيه دخول عادي كعميل أو دليفري الأول،
-- بعدين شغّل السطر ده (غيّر الإيميل بإيميله):
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'admin@example.com');
--
-- بعد كده اليوزر ده لو دخل من نفس الرابط هيتوجه تلقائي لصفحة الأدمن.
-- ---------------------------------------------------------------------

-- =====================================================================
-- 11) طلبات سحب المحفظة — تبقى معلّقة لحد ما الأدمن يحوّل الفلوس فعلياً
--     ويأكد التنفيذ (بدل ما كانت بتتخصم وتخلص على طول)
-- =====================================================================

create table if not exists public.withdraw_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  method text not null check (method in ('vodafone_cash', 'instapay')),
  reference text not null, -- رقم الموبايل المرتبط بالمحفظة اللي هيستلم عليه
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.withdraw_requests enable row level security;

drop policy if exists "withdraw_requests_select_own" on public.withdraw_requests;
create policy "withdraw_requests_select_own"
  on public.withdraw_requests for select
  using (auth.uid() = user_id);

drop policy if exists "withdraw_requests_select_admin_all" on public.withdraw_requests;
create policy "withdraw_requests_select_admin_all"
  on public.withdraw_requests for select
  using (public.is_admin());

-- ملحوظة: مفيش INSERT/UPDATE policy مباشرة — كل حاجة عن طريق الدوال تحت دي بس.
create index if not exists idx_withdraw_requests_user on public.withdraw_requests(user_id);
create index if not exists idx_withdraw_requests_status on public.withdraw_requests(status);

-- ---------------------------------------------------------------------
-- 11.1) الدليفري بيطلب السحب — الفلوس بتتخصم من رصيده على طول (محجوزة)
-- عشان محدش يصرفها تاني، ولو الأدمن رفض بترجعله تلقائي
-- ---------------------------------------------------------------------
create or replace function public.submit_withdraw_request(
  p_amount numeric,
  p_method text,
  p_reference text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_new_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'المبلغ لازم يكون أكبر من صفر';
  end if;

  if p_method is null or p_method not in ('vodafone_cash', 'instapay') then
    raise exception 'وسيلة السحب غير صحيحة';
  end if;

  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'لازم تكتب رقم الموبايل المرتبط بالمحفظة';
  end if;

  select wallet_balance into v_balance from public.profiles where id = auth.uid();
  if v_balance is null then
    raise exception 'المستخدم غير موجود';
  end if;
  if v_balance < p_amount then
    raise exception 'الرصيد مش كافي';
  end if;

  update public.profiles
    set wallet_balance = wallet_balance - p_amount
    where id = auth.uid()
    returning wallet_balance into v_new_balance;

  insert into public.wallet_transactions (user_id, type, amount, note)
    values (auth.uid(), 'withdraw', p_amount, 'طلب سحب قيد المراجعة — ' || trim(p_reference));

  insert into public.withdraw_requests (user_id, method, reference, amount)
    values (auth.uid(), p_method, trim(p_reference), p_amount);

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- 11.2) الأدمن يوافق (يعني حوّل الفلوس فعلاً بره التطبيق) أو يرفض
-- (فبيرجع المبلغ المحجوز تاني لرصيد الدليفري)
-- ---------------------------------------------------------------------
create or replace function public.admin_review_withdraw_request(
  p_request_id uuid,
  p_approve boolean,
  p_admin_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_new_balance numeric;
begin
  if not public.is_admin() then
    raise exception 'العملية دي مسموحة للأدمن بس';
  end if;

  select * into v_req from public.withdraw_requests where id = p_request_id for update;
  if v_req is null then
    raise exception 'الطلب غير موجود';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'الطلب ده اتراجع قبل كده';
  end if;

  if p_approve then
    update public.withdraw_requests
      set status = 'approved', admin_note = p_admin_note, reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_request_id;

    select wallet_balance into v_new_balance from public.profiles where id = v_req.user_id;
  else
    update public.profiles
      set wallet_balance = wallet_balance + v_req.amount
      where id = v_req.user_id
      returning wallet_balance into v_new_balance;

    insert into public.wallet_transactions (user_id, type, amount, note)
      values (v_req.user_id, 'refund', v_req.amount, 'استرجاع طلب سحب مرفوض' || case when p_admin_note is not null then ' — ' || p_admin_note else '' end);

    update public.withdraw_requests
      set status = 'rejected', admin_note = p_admin_note, reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_request_id;
  end if;

  return v_new_balance;
end;
$$;

-- =====================================================================
-- 13) الأماكن المتاحة للشغل (Work Locations)
-- الأدمن بيضيف/يوقف الأماكن اللي التطبيق شغال فيها، والعميل بيختار
-- منها بدل ما يكتب المكان بإيده — يقل الأخطاء ويسهّل على الدليفري.
-- =====================================================================

create table if not exists public.work_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.work_locations enable row level security;

-- أي حد (حتى لو لسه مسجلش دخول، عشان يشوفهم في شاشة التسجيل) يشوف الأماكن
-- المفعّلة بس. الأدمن يشوف كل الأماكن حتى لو متوقفة
drop policy if exists "work_locations_select_active" on public.work_locations;
create policy "work_locations_select_active"
  on public.work_locations for select
  using (active = true or public.is_admin());

-- الأدمن بس اللي يضيف / يعدّل / يمسح
drop policy if exists "work_locations_admin_all" on public.work_locations;
create policy "work_locations_admin_all"
  on public.work_locations for all
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_work_locations_active on public.work_locations(active);

-- ---------------------------------------------------------------------
-- عمود area على الأوردرات — المكان اللي العميل اختاره من قائمة الأدمن
-- (عمود location الأصلي فضل زي ما هو لتفاصيل العنوان بالظبط)
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists area text;

-- ---------------------------------------------------------------------
-- عمود area على البروفايل — المكان اللي اليوزر (عميل أو دليفري) اختاره
-- وقت التسجيل، عشان محدش يسجل في منطقة مش متغطاة بالخدمة
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists area text;

-- =====================================================================
-- 14) توثيق هوية الدليفري — رفع صورة البطاقة وقت التسجيل + مراجعة الأدمن
-- ضروري وقت التسجيل كدليفري (شرط من غيره مينفعش يكمل التسجيل)، وبيفضل
-- الطلب "قيد المراجعة" لحد ما الأدمن يقبله أو يرفضه من لوحة التحكم.
-- =====================================================================

create table if not exists public.courier_verifications (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.profiles(id) on delete cascade,
  id_card_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.courier_verifications enable row level security;

-- الدليفري يشوف طلبات التوثيق بتاعته هو بس
drop policy if exists "courier_verifications_select_own" on public.courier_verifications;
create policy "courier_verifications_select_own"
  on public.courier_verifications for select
  using (auth.uid() = courier_id);

-- الأدمن يشوف كل طلبات التوثيق
drop policy if exists "courier_verifications_select_admin_all" on public.courier_verifications;
create policy "courier_verifications_select_admin_all"
  on public.courier_verifications for select
  using (public.is_admin());

-- الدليفري يقدر يبعت طلب توثيق لنفسه بس (وقت التسجيل)
drop policy if exists "courier_verifications_insert_own" on public.courier_verifications;
create policy "courier_verifications_insert_own"
  on public.courier_verifications for insert
  with check (auth.uid() = courier_id);

-- الأدمن بس اللي يقبل/يرفض (عن طريق الدالة تحت دي)
drop policy if exists "courier_verifications_update_admin_all" on public.courier_verifications;
create policy "courier_verifications_update_admin_all"
  on public.courier_verifications for update
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_courier_verifications_courier on public.courier_verifications(courier_id);
create index if not exists idx_courier_verifications_status on public.courier_verifications(status);

-- ---------------------------------------------------------------------
-- باكت تخزين صور بطاقات الدليفري (خاص، مش عام — نفس فكرة إسكرينات الشحن)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('courier-id-cards', 'courier-id-cards', false)
  on conflict (id) do nothing;

-- كل يوزر يرفع بس جوه فولدر باسمه هو (user_id/...)
drop policy if exists "courier_id_cards_insert_own" on storage.objects;
create policy "courier_id_cards_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'courier-id-cards'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- كل يوزر يشوف بس اللي رفعه هو، والأدمن يشوف الكل
drop policy if exists "courier_id_cards_select_own" on storage.objects;
create policy "courier_id_cards_select_own"
  on storage.objects for select
  using (
    bucket_id = 'courier-id-cards'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- ---------------------------------------------------------------------
-- الأدمن يقبل أو يرفض طلب توثيق الدليفري
-- ---------------------------------------------------------------------
create or replace function public.admin_review_courier_verification(
  p_verification_id uuid,
  p_approve boolean,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'العملية دي مسموحة للأدمن بس';
  end if;

  update public.courier_verifications
    set status = case when p_approve then 'approved' else 'rejected' end,
        admin_note = p_admin_note,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_verification_id and status = 'pending';

  if not found then
    raise exception 'الطلب غير موجود أو اتراجع قبل كده';
  end if;
end;
$$;

-- =====================================================================
-- 15) نخلي PostgREST يقرأ الدوال والجداول الجديدة فوراً من غير ما تستنى
-- (Schema cache) لو لسه ظاهرلك خطأ "Could not find the function/table"
-- بعد تشغيل السكريبت، روح Supabase Dashboard > Settings > API
-- واضغط "Reload schema cache"
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
