import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import AuthScreen from "./components/AuthScreen.jsx";
import CustomerScreen from "./components/CustomerScreen.jsx";
import CourierScreen from "./components/CourierScreen.jsx";
import ResetPasswordScreen from "./components/ResetPasswordScreen.jsx";
import CourierStatusScreen from "./components/CourierStatusScreen.jsx";

// بيتأكد لو الرابط اللي فتح بيه اليوزر التطبيق ده رابط "استرجاع كلمة السر"
// (Supabase بيحط type=recovery في الـ hash أو الـ query حسب نوع الرابط).
// بنحسبها من قيمة location مباشرة (مش state) عشان نعرف نقرر عليها فوراً
// من أول render، من غير ما نستنى أي async call.
const isPasswordRecoveryLink = () => {
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  return hash.includes("type=recovery") || search.includes("type=recovery");
};

// نفس منطق التنضيف في AuthScreen.jsx — بيشيل الحروف العربية/يونيكود من
// اسم الملف عشان Supabase Storage مايرفضش المسار وقت الرفع.
function sanitizeFileName(name) {
  const dotIndex = name.lastIndexOf(".");
  const ext =
    dotIndex > -1 ? name.slice(dotIndex + 1).replace(/[^a-zA-Z0-9]/g, "") : "";
  const base = (dotIndex > -1 ? name.slice(0, dotIndex) : name)
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .slice(0, 40);
  const safeBase = base || "id-card";
  return ext ? `${safeBase}.${ext}` : safeBase;
}

export default function App() {
  // لو الرابط رابط استرجاع باسورد، نبدأ على طول بشاشة reset_password
  // بدل ما نستنى أي طلب شبكة — ده اللي بيمنع "الفلاشة" اللي كانت بتحصل
  // لما getSession() و onAuthStateChange يتسابقوا مع بعض على نفس الشاشة.
  // screen: 'loading' | 'auth' | 'customer' | 'courier' | 'courier_status' | 'reset_password'
  const [screen, setScreen] = useState(() =>
    isPasswordRecoveryLink() ? "reset_password" : "loading"
  );
  const [profile, setProfile] = useState(null);
  // آخر طلب توثيق بطاقة للدليفري الحالي (لو دوره courier) — بنستخدمها
  // نحدد نوجهه لشاشة الشغل ولا لشاشة "قيد المراجعة/مرفوض"
  const [courierVerification, setCourierVerification] = useState(null);

  // فلاج ثابت لطول عمر الكومبوننت: لو اتفعّل، معناه إننا جوه فلو استرجاع
  // كلمة السر، وأي منطق توجيه تاني (سواء من getSession الأولي أو من
  // onAuthStateChange) لازم يتجاهل الجلسة المؤقتة دي تماماً لحد ما
  // اليوزر يخلّص تحديد كلمة السر الجديدة (ResetPasswordScreen بيستدعي
  // onDone بعدها، وهو اللي بيقفل الفلاج ده ويرجّع التوجيه العادي).
  const recoveryModeRef = useRef(isPasswordRecoveryLink());

  // رقم تسلسلي لكل استدعاء لـ loadProfileAndRoute. بيتزوّد مع كل استدعاء
  // جديد. بيحل مشكلة الـ race condition اللي بتحصل وقت التسجيل: حدث
  // SIGNED_IN بيطلق فورًا لما signUp() ينجح (قبل ما نعمل صف الـ profile)،
  // فده بيشغّل استدعاء "قديم" لـ loadProfileAndRoute هيلاقي مفيش بروفايل
  // ويرجّع اليوزر لشاشة auth. وبالتوازي معاه، AuthScreen بتنادي نفس
  // الدالة يدويًا بعد ما تخلص عمل صف البروفايل (الاستدعاء "الصح"). المشكلة
  // إن الطلبين async ومفيش ضمان ترتيب اكتمالهم، فلو الاستدعاء القديم خلص
  // بعد الجديد، بيكتب فوق النتيجة الصح ويرجّع اليوزر للوجين من غير أي
  // رسالة خطأ. الحل: كل استدعاء ياخد رقمه وقت ما يبدأ، وأي تحديث للشاشة
  // بيتجاهل لو فيه استدعاء أحدث بدأ بعده.
  const routeRequestIdRef = useRef(0);

  // بيتقفل (true) طول ما AuthScreen في نص عملية تسجيل حساب جديد. بيمنع
  // الاستماع التلقائي (onAuthStateChange) من إنه يوجّه اليوزر أول ما
  // حدث SIGNED_IN يتطلق (فورًا بعد signUp()، قبل ما صف الـ profile
  // (وصف courier_verifications لو دليفري) يتعملوا أصلاً). التوجيه
  // الصحيح بيحصل يدويًا من AuthScreen (onAuthSuccess) بعد ما كل حاجة
  // تتعمل فعليًا. من غير المنع ده، كان ممكن يحصل سباق حتى مع نظام
  // الـ requestId: لو الاستدعاء التلقائي (الغلط) هو الوحيد الشغال وقت
  // ما يخلص (لأن اليدوي لسه ما بدأش، مستني رفع صورة البطاقة مثلاً)،
  // بيرجّع اليوزر لشاشة auth قبل ما نظام الترتيب يعرف إن فيه استدعاء
  // تاني جاي بعده.
  const suppressAutoRouteRef = useRef(false);

  // بيتأكد من حالة توثيق الدليفري (قيد المراجعة / مقبول / مرفوض) قبل ما
  // يفتحله شاشة الشغل. الأدمن (role === admin) والدليفري اللي مفيش له
  // صف توثيق أصلاً (حسابات قديمة اتعملت قبل ميزة التوثيق دي) بيعدوا عادي.
  const routeCourier = async (courierProfile, requestId) => {
    const { data: verification } = await supabase
      .from("courier_verifications")
      .select("*")
      .eq("courier_id", courierProfile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recoveryModeRef.current) return;
    // فيه استدعاء أحدث لـ loadProfileAndRoute بدأ بعد ده — نتجاهل النتيجة
    // القديمة دي عشان مانكتبش فوق التوجيه الصح
    if (requestId !== routeRequestIdRef.current) return;

    if (verification && verification.status !== "approved") {
      setCourierVerification(verification);
      setScreen("courier_status");
      return;
    }

    setCourierVerification(null);
    setScreen("courier");
  };

  // بيجيب صف الـ profile (فيه role العميل/الدليفري) وبيوجّه للشاشة الصح.
  // لو مفيش بروفايل لسه (مثلاً كان محتاج تأكيد إيميل وقت التسجيل)،
  // بيدور على بيانات محفوظة مؤقتاً من AuthScreen ويعمل البروفايل دلوقتي.
  const loadProfileAndRoute = async (user) => {
    if (recoveryModeRef.current) return; // إحنا لسه في شاشة استرجاع الباسورد

    // ياخد رقمه دلوقتي، وقت ما يبدأ — مش وقت ما يخلص — عشان الترتيب
    // يبقى صح لو استدعاء تاني بدأ بعده وخلص قبله (شوف الشرح فوق)
    const requestId = ++routeRequestIdRef.current;

    const userId = user.id;
    // بنجرب نجيب البروفايل، ولو مالقيناهوش نجرب تاني كام مرة بفاصل بسيط
    // (شبكة بطيئة أو أي تأخير مؤقت في ظهور الصف بعد الـ insert). ده
    // مش بديل عن منع السباق فوق — ده بس شبكة أمان لو السبب حاجة تانية
    // (زي RLS بترفض السلكت ساعات وساعات لأ).
    let data = null;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: attemptData, error: attemptError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (recoveryModeRef.current) return; // ممكن يكون اتغيّر أثناء انتظار الطلب
      if (requestId !== routeRequestIdRef.current) return; // استدعاء قديم اتسبق

      if (attemptData && !attemptError) {
        data = attemptData;
        lastError = null;
        break;
      }

      lastError = attemptError;
      // PGRST116 = "مفيش صف مطابق" — دي الحالة المتوقعة لو لسه البروفايل
      // ما اتعملش. أي كود تاني معناه خطأ حقيقي (RLS، شبكة، إلخ) ومستاهل
      // نطبعه في الـ Console عشان نقدر نشخصه لو المشكلة استمرت.
      if (attemptError && attemptError.code !== "PGRST116") {
        console.error("فشل تحميل البروفايل:", attemptError);
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }

    if (recoveryModeRef.current) return;
    if (requestId !== routeRequestIdRef.current) return; // استدعاء قديم اتسبق

    if (data && !lastError) {
      setProfile(data);
      if (data.role === "courier") {
        await routeCourier(data, requestId);
      } else {
        setScreen("customer");
      }
      return;
    }

    // مفيش بروفايل — نجرب نلاقي بيانات التسجيل المحفوظة مؤقتاً بنفس الإيميل
    const email = (user.email || "").toLowerCase();
    const pendingKey = `seka_pending_profile_${email}`;
    const pendingRaw = email ? localStorage.getItem(pendingKey) : null;

    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw);
        // idCardDataUrl/idCardName مش أعمدة في جدول profiles — دي بيانات
        // مؤقتة بس لرفع صورة البطاقة بعد كده، فلازم نفصلها قبل الـ insert
        const { idCardDataUrl, idCardName, ...profileFields } = pending;
        const { data: created, error: createError } = await supabase
          .from("profiles")
          .insert({ id: userId, ...profileFields })
          .select()
          .single();
        if (recoveryModeRef.current) return;
        if (requestId !== routeRequestIdRef.current) return; // استدعاء قديم اتسبق
        if (created && !createError) {
          localStorage.removeItem(pendingKey);

          // لو دليفري كان رفع صورة بطاقة وقت التسجيل ولسه محفوظة مؤقتاً
          // (كان مستني تأكيد الإيميل)، دلوقتي عنده جلسة فعلية فنقدر
          // نرفعها على الباكت الخاص ونفتح طلب التوثيق
          if (created.role === "courier" && idCardDataUrl) {
            try {
              const res = await fetch(idCardDataUrl);
              const blob = await res.blob();
              const path = `${userId}/${Date.now()}-${sanitizeFileName(idCardName || "id-card")}`;
              const { error: uploadError } = await supabase.storage
                .from("courier-id-cards")
                .upload(path, blob, { contentType: blob.type || "image/jpeg" });
              if (!uploadError) {
                await supabase
                  .from("courier_verifications")
                  .insert({ courier_id: userId, id_card_path: path });
              }
            } catch (_) {
              // لو فشل الرفع هنا، مش هنوقف اليوزر — يقدر يتواصل مع الدعم
            }
          }

          setProfile(created);
          if (created.role === "courier") {
            await routeCourier(created, requestId);
          } else {
            setScreen("customer");
          }
          return;
        }
      } catch (_) {
        // تجاهل أي خطأ في قراءة/كتابة البيانات المؤقتة ونكمل على شاشة الدخول
      }
    }

    if (requestId !== routeRequestIdRef.current) return; // استدعاء قديم اتسبق
    setScreen("auth");
  };

  useEffect(() => {
    // 1) هل فيه جلسة شغالة بالفعل (اليوزر مسجل دخول من قبل)؟
    // (لو إحنا جايين من رابط استرجاع باسورد، منسيبش الطلب ده يبدّل الشاشة)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (recoveryModeRef.current) return;
      if (session?.user) {
        loadProfileAndRoute(session.user);
      } else {
        setScreen("auth");
      }
    });

    // 2) الاستماع لأي تغيير في حالة تسجيل الدخول (دخول / خروج) من أي مكان
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // اليوزر دوس على رابط "استرجاع كلمة السر" اللي وصله بالإيميل —
        // نوقّفه هنا على شاشة تحديد كلمة سر جديدة بدل ما نوجهه على طول
        // لشاشة العميل/الدليفري بجلسة مؤقتة لسه ما غيّرش كلمة سره فيها
        if (event === "PASSWORD_RECOVERY") {
          recoveryModeRef.current = true;
          setScreen("reset_password");
          return;
        }
        // لسه في وضع استرجاع الباسورد ولسه ما دُسناش على "تسجيل الدخول"
        // في شاشة النجاح؟ اتجاهل أي حدث تاني (حتى SIGNED_IN) لحد ما نخلص
        if (recoveryModeRef.current) return;

        if (session?.user) {
          // إحنا في نص عملية تسجيل حساب جديد — AuthScreen هي اللي هتوجه
          // يدويًا بعد ما تخلص عمل البروفايل (وطلب التوثيق لو دليفري).
          // لو سبنا الاستدعاء التلقائي ده يشتغل دلوقتي، هيلاقي مفيش
          // بروفايل ويرجّع اليوزر لشاشة auth (شوف الشرح فوق).
          if (suppressAutoRouteRef.current) return;
          loadProfileAndRoute(session.user);
        } else {
          setProfile(null);
          setScreen("auth");
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (screen === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0B1526",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#93A0B8",
          fontFamily: "Cairo, sans-serif",
        }}
      >
        بنجهزلك حسابك...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0B1526" }}>
      {screen === "auth" && (
        <AuthScreen
          onSignupStart={() => {
            suppressAutoRouteRef.current = true;
          }}
          onSignupEnd={() => {
            suppressAutoRouteRef.current = false;
          }}
          onAuthSuccess={({ user }) => user && loadProfileAndRoute(user)}
        />
      )}
      {screen === "reset_password" && (
        <ResetPasswordScreen
          onDone={async () => {
            // خلاص خلّص تحديد كلمة السر الجديدة — نقفل وضع الاسترجاع
            // ونسجّله خروج من الجلسة المؤقتة، عشان يدخل تاني بكلمة السر
            // الجديدة من شاشة تسجيل الدخول العادية (ومن غير ما أي حدث
            // قديم متأخر يحاول يوجهه لحتة تانية بعد كده)
            recoveryModeRef.current = false;
            await supabase.auth.signOut();
            setScreen("auth");
          }}
        />
      )}
      {screen === "customer" && (
        <CustomerScreen profile={profile} onLogout={handleLogout} />
      )}
      {screen === "courier_status" && (
        <CourierStatusScreen
          verification={courierVerification}
          onApproved={() => {
            setCourierVerification(null);
            setScreen("courier");
          }}
          onLogout={handleLogout}
        />
      )}
      {screen === "courier" && (
        <CourierScreen profile={profile} onLogout={handleLogout} />
      )}
    </div>
  );
}
