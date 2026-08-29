-- =====================================================================
-- سكة (Sikka) — إضافة صغيرة فوق pricing-negotiation-schema.sql
-- (لازم يكون اتشغل قبل كده). انسخ السكريبت ده كله والصقه في:
-- Supabase Dashboard > SQL Editor > New query، وبعدين دوس Run.
-- آمن تشغله أكتر من مرة (idempotent).
--
-- ليه محتاجين السكريبت ده: العميل يقدر يشوف صفوف order_offers بتاعة
-- أوردراته هو (فيه policy لده أصلاً)، بس RLS على جدول profiles بتسمح
-- لكل يوزر يشوف بروفايله هو بس — يعني العميل مش هيقدر يجيب اسم/تليفون
-- الدليفري اللي عرض عليه بسؤال مباشر على profiles. بدل ما نفتح صلاحية
-- عريضة على profiles (كل عميل يشوف كل الدليفريز)، بنعمل RPC ضيّق:
-- بيرجّع بس عروض الأوردرات اللي هي فعلاً بتاعة العميل صاحب الجلسة،
-- مع اسم وتليفون الدليفري صاحب كل عرض.
-- =====================================================================

create or replace function public.get_my_pending_offers()
returns table (
  id uuid,
  order_id uuid,
  courier_id uuid,
  offered_price numeric,
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

notify pgrst, 'reload schema';
