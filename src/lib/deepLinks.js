// src/lib/deepLinks.js
//
// بيلتقط رابط استرجاع كلمة السر (وأي رابط تاني هيتضاف بعدين) لو اتفتح
// من جوه تطبيق Capacitor نفسه (مش من متصفح تاني) — يعني اليوزر داس على
// رابط "إعادة تعيين كلمة السر" اللي وصله بالإيميل، وكان عنده التطبيق
// متركب، فبدل ما الرابط يفتح في متصفح خارجي، أندرويد بيبعته للتطبيق.
//
// إحنا مش بنعمل أي منطق جديد لتحديد كلمة السر هنا — بس بنحوّل نفس
// البارامترات (hash / query) اللي جايه في رابط الاسترجاع لنفس أوريجن
// التطبيق (يعني /?...  أو /#...) وبنعمل reload بسيط. وقتها:
//   1) App.jsx بيتعرف عليها كـ "type=recovery" (isPasswordRecoveryLink)
//   2) Supabase JS client (detectSessionInUrl) بيلتقط الـ token ويطلق
//      حدث PASSWORD_RECOVERY اللي App.jsx أصلاً بيسمعله
// يعني منطق App.jsx نفسه من غير أي تعديل فيه — هو بس محتاج البارامترات
// دي تكون موجودة في window.location.
//
// ملحوظة مهمة: عشان ده يشتغل فعليًا لازم:
//   1) المشروع يبقى منشور على دومين حقيقي (Vercel/Netlify مثلاً)
//   2) يتحط ملف assetlinks.json على الدومين ده يثبت ملكية التطبيق
//   3) android:host في android-manifest-additions.xml يتظبط بالدومين الفعلي
// (تفاصيل كاملة في دليل-التركيب.md)

let appModule = null;
async function getAppModule() {
  if (appModule) return appModule;
  try {
    appModule = await import("@capacitor/app");
  } catch {
    appModule = null;
  }
  return appModule;
}

function extractFragment(urlString) {
  try {
    const url = new URL(urlString);
    if (url.hash && url.hash.length > 1) {
      // زي: #access_token=...&type=recovery
      return url.hash;
    }
    if (url.search && url.search.length > 1) {
      // زي: ?token=...&type=recovery
      return url.search;
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * ينده مرة واحدة بس، بدري، من main.jsx — بيسجّل listener لأحداث فتح
 * التطبيق عن طريق رابط خارجي (Deep Link). مبيعملش حاجة على الويب
 * (مش نيتيف) عشان مفيش @capacitor/app هناك أصلاً.
 */
export async function initDeepLinks() {
  const mod = await getAppModule();
  if (!mod) return; // مش جوه Capacitor (يعني ويب عادي) — من غير أي تأثير

  const { App } = mod;

  App.addListener("appUrlOpen", (event) => {
    const fragment = extractFragment(event?.url || "");
    if (!fragment) return;

    // بنودّي نفس بارامترات الرابط لأوريجن التطبيق نفسه، وبنعمل reload
    // كامل عشان يتلقط من الأول (منطق isPasswordRecoveryLink() في
    // App.jsx بيتشيك وقت أول تحميل، وSupabase client بيتشيك وقت
    // إنشائه — الاتنين محتاجين reload نضيف).
    window.location.href = `/${fragment}`;
  });
}
