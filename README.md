<div align="center">

# سكة (Sikka)
### نوصّلها لحد بابك

</div>

---

## الحالة الحالية

المشروع دلوقتي **مش نسخة تصفح/Mock** — كل الشاشات متوصلة فعلياً بـ Supabase (قراءة/كتابة/Realtime حقيقيين):

- ✅ تسجيل دخول / حساب جديد (عميل / دليفري) — `AuthScreen`
- ✅ "نسيت كلمة السر" كامل (طلب رابط استرجاع → `ResetPasswordScreen` → تحديد كلمة سر جديدة)، مع منطق في `App.jsx` بيتعرف على رابط الاسترجاع (`type=recovery`) ويمنع أي تسابق مع التوجيه العادي
- ✅ توثيق بطاقة الدليفري: بيرفع صورة بطاقته وقت التسجيل، وبيفضل واقف على `CourierStatusScreen` ("قيد المراجعة" / "مرفوض") لحد ما الأدمن يقبله — التحويل لشاشة الشغل بيحصل تلقائي (Realtime) بمجرد القبول
- ✅ شاشة العميل: إنشاء أوردر + متابعة الحالة لايف — `CustomerScreen`
- ✅ شاشة الدليفري: قائمة الأوردرات المتاحة + أخد أوردر + تحديث حالته — `CourierScreen`
- ✅ نظام محفظة كامل للدليفري (شحن/سحب/خصم رسوم 2 جنيه لكل أوردر) — `WalletScreen`
- ✅ لوحة تحكم أدمن منفصلة تماماً (`admin.html`) — `AdminScreen` + `UserDetailScreen`، بتابات: الأوردرات، المستخدمين، طلبات الشحن، طلبات السحب، توثيق الدليفرية، المحافظ، الأماكن، وسجل الأدمن
- ✅ PWA كامل — `manifest.webmanifest` + `sw.js` (بيكاش الـ app shell بس؛ طلبات Supabase دايمًا Network-only) + تاجز iOS في `index.html`
- ✅ توجيه تلقائي حسب `role` بعد تسجيل الدخول (مش مجرد مُبدّل شاشات)
- ✅ تحويل لـ APK أندرويد حقيقي عن طريق Capacitor — كاميرا نيتيف حقيقية
  لرفع الصور (`src/lib/pickImage.js`)، Deep Link لرابط استرجاع كلمة السر
  (`src/lib/deepLinks.js`)، وأدوات التوقيع والبناء والتوزيع المباشر.
  التفاصيل والخطوات المتبقية (لازم تتنفذ على جهازك) في `ابدأ-من-هنا.md`
- ⬜ لسه ناقص: النشر (Deployment)، Tests

---

## هيكل المشروع

```
seka-app/
├── index.html                    ← نقطة دخول الأبليكيشن العادية (عميل/دليفري)
├── admin.html                    ← نقطة دخول منفصلة تماماً للوحة الأدمن
├── package.json
├── vite.config.js                ← بندلين منفصلين: main (index.html) + admin (admin.html)
├── .env.example                  ← انسخه لـ .env وحط فيه بيانات Supabase الحقيقية
├── .gitignore
│
├── public/
│   ├── seka-logo.png
│   ├── seka-icon.png
│   ├── seka-icon-192.png
│   ├── seka-icon-512.png
│   ├── manifest.webmanifest       ← بيانات PWA (اسم، أيقونات، ألوان، RTL)
│   └── sw.js                      ← Service Worker (كاش الـ app shell فقط)
│
├── src/
│   ├── main.jsx                   ← نقطة دخول React للأبليكيشن العادية
│   ├── App.jsx                    ← توجيه حسب role + استرجاع كلمة السر + حالة توثيق الدليفري
│   ├── admin-main.jsx             ← نقطة دخول React للوحة الأدمن
│   ├── AdminApp.jsx               ← حراسة الدخول (لازم role='admin') + توجيه
│   ├── components/
│   │   ├── AuthScreen.jsx         ← تسجيل دخول / حساب جديد / نسيت كلمة السر
│   │   ├── ResetPasswordScreen.jsx← تحديد كلمة سر جديدة بعد رابط الاسترجاع
│   │   ├── CustomerScreen.jsx     ← شاشة العميل
│   │   ├── CourierScreen.jsx      ← شاشة الدليفري
│   │   ├── CourierStatusScreen.jsx← حالة توثيق الدليفري (قيد المراجعة/مرفوض)
│   │   ├── WalletScreen.jsx       ← محفظة الدليفري (شحن/سحب)
│   │   ├── AdminScreen.jsx        ← لوحة تحكم الأدمن (كل التابات)
│   │   ├── UserDetailScreen.jsx   ← تفاصيل مستخدم من داخل لوحة الأدمن
│   │   └── PaymentLogos.jsx
│   └── lib/
│       └── supabaseClient.js      ← عميل Supabase (بيقرا من .env)
│
└── docs/
    ├── project-spec.md            ← السبيك العام للمشروع
    ├── login-screen-spec.md       ← سبيك شاشة الدخول
    ├── brand-guide.html           ← دليل الهوية البصرية
    └── supabase-schema.sql        ← كل جداول/دوال/سياسات RLS (idempotent — آمن تشغله أكتر من مرة)
```

---

## تشغيل المشروع محلياً

```bash
npm install
npm run dev
```

هيفتح على `http://localhost:5173` (الأبليكيشن العادية) و `http://localhost:5173/admin.html` (لوحة الأدمن).

قبل ما تشغّل، لازم:
1. تنسخ `.env.example` لـ `.env` وتحط فيه `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY` من مشروعك على Supabase (Settings > API).
2. تشغّل `docs/supabase-schema.sql` كامل في Supabase SQL Editor (آمن تشغله أكتر من مرة لو حصل تحديث).

---

## لوحة تحكم الأدمن

`admin.html` صفحة مستقلة بالكامل عن الأبليكيشن (`index.html`) — بندل JS منفصل، مفيش أي رابط ليها من شاشة العميل/الدليفري، ومفيش فيها تسجيل حساب جديد ولا اختيار دور.

**خطوات التفعيل:**
1. شغّل `docs/supabase-schema.sql` في Supabase SQL Editor (لو لسه ما شغلتوش).
2. سجّل حساب عادي (عميل أو دليفري) من الأبليكيشن العادية بإيميل هتستخدمه كأدمن.
3. في Supabase SQL Editor شغّل (غيّر الإيميل):
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'admin@example.com');
   ```
4. ادخل على `/admin.html` بنفس الإيميل وكلمة السر.

اللوحة بتوريك، كله لايف (Realtime):

- **الأوردرات** — فلترة/بحث/إلغاء/حذف
- **المستخدمين** — كل الحسابات مع أرصدتهم
- **طلبات الشحن** و **طلبات السحب** — مراجعة منفصلة لكل نوع
- **توثيق الدليفرية** — مراجعة صور بطاقات الدليفري الجداد (قبول/رفض) مع عداد للطلبات المعلّقة
- **المحافظ** — نظرة على حسابات المحافظ
- **الأماكن** — إدارة الأماكن/المناطق
- **سجل الأدمن** — تريل لإجراءات الأدمن

---

## اللي لسه ناقص

1. **النشر (Deployment)** — لسه محلي بس، مفيش رفع على Vercel/Netlify.
2. **Tests** — مفيش اختبارات آلية.
3. ملحوظة توثيق: السبيك الأصلي (`docs/project-spec.md`) بيذكر Tailwind CSS كجزء من الـ Tech Stack، لكن الشاشات فعلياً بتستخدم inline styles / `<style>` tags جوه كل component — مفيش Tailwind متثبت أو متستخدم حالياً. لو حابب تفضل الطريقة دي، يفضل تتحدث الـ Tech Stack في السبيك كذلك.

<div align="center">

**سكة** — نوصّلها لحد بابك

</div>
