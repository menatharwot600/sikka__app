-- =====================================================================
-- سكة (Sikka) — إضافة الإيميل لجدول profiles
-- انسخ الملف ده والصقه في: Supabase Dashboard > SQL Editor > New query
-- وبعدين دوس Run. آمن تشغله أكتر من مرة (idempotent).
-- =====================================================================

-- 1) نضيف عمود email لجدول profiles (لو مش موجود أصلاً)
alter table public.profiles add column if not exists email text;

-- 2) نملى الإيميل للحسابات الموجودة حاليًا من auth.users (المصدر الأصلي للإيميل)
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '');

-- ملحوظة: من هنا وبعد ما تحدّث كود AuthScreen.jsx، أي حساب جديد
-- هيتسجل إيميله مباشرة في profiles وقت التسجيل، فمش هتحتاج تعمل
-- الخطوة دي تاني إلا لو حسابات اتعملت قبل ما تنزّل التحديث.
