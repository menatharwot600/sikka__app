# اختبار سيناريوهات التزامن — نظام التفاوض

سكريبت `run.mjs` بيشغّل السيناريوهات الأربعة المذكورة في خطوة 6 من
`PRICING_NEGOTIATION_PLAN.md` فعليًا ضد Supabase مشروعك (مش تخمين نظري).

## قبل التشغيل

### 1. شغّل ملف الإصلاح
لازم تشغّل `wallet-fee-race-fix.sql` على Supabase (نفس طريقة باقي
الملفات: SQL Editor > New query > الصق > Run) **قبل** أي حاجة تانية،
لأنه بيصلّح race condition حقيقي لقيناه في خصم عمولة المحفظة.

### 2. حسابات تجريبية
محتاج 3 حسابات موجودة بالفعل في التطبيق (اعملهم من شاشة التسجيل عادي):
- عميل واحد
- دليفريين (لازم يكونوا موثقين/قادرين ياخدوا أوردرات حسب أي شروط
  عندك على `courier_accept_order`)

### 3. الـ env vars
```bash
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_ANON_KEY="eyJ..."          # anon key العادي، من .env بتاع التطبيق
export TEST_CUSTOMER_EMAIL="customer@test.com"
export TEST_CUSTOMER_PASSWORD="..."
export TEST_COURIER1_EMAIL="courier1@test.com"
export TEST_COURIER1_PASSWORD="..."
export TEST_COURIER2_EMAIL="courier2@test.com"
export TEST_COURIER2_PASSWORD="..."

# اختياري — بس لازم لسيناريو رصيد المحفظة (سيناريو 4)
# من Supabase Dashboard > Settings > API > service_role key
# ⚠️ الـ key ده بيتخطى كل الـ RLS — استخدمه محلي بس، ومتحطوش في git
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
```

### 4. التشغيل
```bash
npm install   # لو لسه ما عملتش
node concurrency-tests/run.mjs
```

## السيناريوهات اللي بيغطيها

| # | السيناريو | المتوقع |
|---|---|---|
| 1 | دليفريان يضغطوا "قبول بالسعر الأصلي" في نفس اللحظة على نفس الأوردر | ينجح واحد بس، التاني ياخد رسالة "اتاخد بالفعل" |
| 2 | دليفري يقبل بالسعر الأصلي في نفس وقت العميل بيقبل عرضه | تنجح عملية واحدة بس |
| 3 | جولات تفاوض متعددة | متغطاة بمراجعة الكود (upsert + قفل الصف) — مفيهاش تضارب أصلًا لأنها مش race حقيقي |
| 4 | رصيد الدليفري يكفي أوردر واحد بس، وهو بيحاول ياخد اتنين في نفس اللحظة | ينجح واحد بس، والرصيد ميعديش بالسالب (محتاج `wallet-fee-race-fix.sql` الأول) |

## ملحوظة مهمة

السكريبت بينشئ أوردرات وهمية فعلية في قاعدة البيانات (وصفها "اختبار
تزامن — سكة"). شغّله على مشروع Supabase تجريبي أو staging، مش على
قاعدة بيانات إنتاج حقيقية فيها عملاء حقيقيين.
