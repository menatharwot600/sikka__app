import React, { useState, useEffect } from "react";
import {
  User,
  Phone,
  Mail,
  Lock,
  Truck,
  Package,
  MapPin,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  CreditCard,
  ShieldCheck,
  Upload,
  X as XIcon,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { pickImage } from "../lib/pickImage";

const LOGO_ICON = "/seka-icon.png";

// بيشيل من اسم الملف أي حروف مش إنجليزية/أرقام (زي حروف عربية) عشان
// Supabase Storage أحياناً بيرفض مسارات فيها يونيكود ويرجع 400 وقت الرفع.
// بيسيب بس الامتداد (الحروف بعد آخر نقطة) والباقي بيتحول لـ "id-card".
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

const ROLES = [
  {
    id: "customer",
    label: "عميل",
    sub: "أطلب وأستنى التوصيل",
    icon: Package,
  },
  {
    id: "courier",
    label: "دليفري",
    sub: "أشوف الأوردرات وأوصّلها",
    icon: Truck,
  },
];

// أقصى حجم لصورة البطاقة (ميجابايت) — عشان لو الإيميل محتاج تأكيد هنخزنها
// مؤقتاً كـ base64 في localStorage لحد ما اليوزر يأكد ويسجل دخول
const MAX_ID_CARD_MB = 5;

// بيحوّل ملف الصورة لـ base64 (data URL) — مستخدمة وقت التسجيل لما تأكيد
// الإيميل يكون مفعّل ومفيش جلسة فورية نرفع بيها الصورة على طول
const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function AuthScreen({ onAuthSuccess, onSignupStart, onSignupEnd } = {}) {
  const [mode, setMode] = useState("login"); // 'login' | 'signup' | 'forgot'
  const [role, setRole] = useState("customer");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fields, setFields] = useState({
    fullName: "",
    phone: "",
    area: "",
    email: "",
    password: "",
  });
  const [idCardFile, setIdCardFile] = useState(null);
  const [idCardPreview, setIdCardPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState(""); // رسالة نجاح (غير الخطأ)
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(true);

  // تحميل الأماكن المتاحة للشغل — عشان محدش يسجل في منطقة مش متغطاة بالخدمة
  useEffect(() => {
    let ignore = false;
    setLocationsLoading(true);
    supabase
      .from("work_locations")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (ignore) return;
        if (!error) setLocations(data || []);
        setLocationsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const setField = (key) => (e) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  const handlePickIdCard = async () => {
    // جوه Capacitor (أندرويد حقيقي) → بوب-أب "كاميرا / معرض الصور" حقيقي
    // في المتصفح (PWA) → نفس input الملف القديم بالظبط
    const file = await pickImage({ fileNamePrefix: "id-card" });
    if (!file) return; // المستخدم لغى الاختيار
    if (!file.type.startsWith("image/")) {
      setErrors((er) => ({ ...er, idCard: "الملف لازم يكون صورة" }));
      return;
    }
    if (file.size > MAX_ID_CARD_MB * 1024 * 1024) {
      setErrors((er) => ({ ...er, idCard: `حجم الصورة لازم يكون أقل من ${MAX_ID_CARD_MB} ميجا` }));
      return;
    }
    setErrors((er) => ({ ...er, idCard: undefined }));
    setIdCardFile(file);
    setIdCardPreview(URL.createObjectURL(file));
  };

  const removeIdCard = () => {
    setIdCardFile(null);
    setIdCardPreview(null);
  };

  const validate = () => {
    const e = {};
    if (mode === "signup" && !fields.fullName.trim())
      e.fullName = "اكتب اسمك الكامل";
    if (mode === "signup" && !fields.phone.trim())
      e.phone = "اكتب رقم تليفونك";
    if (mode === "signup" && !fields.area.trim())
      e.area = "اختار المكان";
    if (mode === "signup" && role === "courier" && !idCardFile)
      e.idCard = "لازم ترفع صورة البطاقة الشخصية عشان نتأكد من هويتك";
    if (!fields.email.trim()) e.email = "اكتب إيميلك";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim()))
      e.email = "الإيميل مش صحيح";
    // في وضع "نسيت كلمة السر" مش محتاجين كلمة سر خالص
    if (mode !== "forgot") {
      if (!fields.password.trim()) e.password = "اكتب كلمة السر";
      else if (fields.password.length < 6)
        e.password = "كلمة السر لازم 6 حروف/أرقام على الأقل";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // بيترجم رسائل Supabase الإنجليزية الشائعة لرسائل عربية مفهومة للمستخدم
  const translateAuthError = (message) => {
    const msg = (message || "").toLowerCase();
    if (msg.includes("invalid login credentials"))
      return "الإيميل أو كلمة السر غلط";
    if (msg.includes("user already registered") || msg.includes("already registered"))
      return "الإيميل ده مسجل قبل كده، جرب تسجل دخول";
    if (msg.includes("email not confirmed"))
      return "لازم تأكد إيميلك الأول من الرسالة اللي وصلتلك";
    if (msg.includes("password") && msg.includes("6"))
      return "كلمة السر لازم تكون 6 حروف/أرقام على الأقل";
    if (msg.includes("rate limit") || msg.includes("too many"))
      return "طلبت كتير على فترة قصيرة، استنى شوية وحاول تاني";
    return "حصل خطأ، حاول تاني";
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    if (!validate()) return;
    setSubmitting(true);

    try {
      if (mode === "forgot") {
        // بيبعت لينك لتغيير كلمة السر على إيميل اليوزر — الرابط بيرجّعه
        // لنفس الأبليكيشن وApp.jsx بيتعرف على حالة "استرجاع الباسورد" ويوريه
        // شاشة تحديد كلمة سر جديدة (شوف App.jsx / ResetPasswordScreen)
        const { error } = await supabase.auth.resetPasswordForEmail(
          fields.email.trim(),
          { redirectTo: window.location.origin }
        );
        if (error) throw error;
        setAuthNotice("اتبعتلك رابط تغيير كلمة السر على إيميلك، افتحه من نفس الجهاز ده");
      } else if (mode === "signup") {
        // نمنع الـ App من التوجيه التلقائي أول ما signUp() يطلق حدث
        // SIGNED_IN — البروفايل (وطلب التوثيق لو دليفري) لسه ما
        // اتعملوش. التوجيه هيحصل يدويًا تحت (onAuthSuccess) بعد ما كل
        // حاجة تخلص فعليًا. بنقفلها تاني في finally تحت مهما كانت
        // النتيجة (نجاح أو فشل) عشان الفلاج ميفضلش عالق.
        if (onSignupStart) onSignupStart();

        // 1) إنشاء حساب في Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email: fields.email.trim(),
          password: fields.password,
        });
        if (error) throw error;

        // 2) بيانات البروفايل اللي هنسجلها (الاسم + التليفون + المكان + الدور)
        const userId = data?.user?.id;
        const profileData = {
          full_name: fields.fullName.trim(),
          phone: fields.phone.trim(),
          area: fields.area.trim(),
          email: fields.email.trim(),
          role,
        };

        if (data?.session && userId) {
          // الجلسة شغالة على طول (تأكيد الإيميل مقفول في المشروع)
          // نقدر نعمل صف البروفايل فوراً
          const { error: profileError } = await supabase
            .from("profiles")
            .insert({ id: userId, ...profileData });
          if (profileError) throw profileError;

          // لو دليفري: نرفع صورة البطاقة على طول ونعمل طلب توثيق "قيد المراجعة"
          if (role === "courier" && idCardFile) {
            const path = `${userId}/${Date.now()}-${sanitizeFileName(idCardFile.name)}`;
            const { error: uploadError } = await supabase.storage
              .from("courier-id-cards")
              .upload(path, idCardFile);
            if (uploadError) {
              throw new Error(
                "التسجيل نجح بس رفع صورة البطاقة فشل: " + uploadError.message
              );
            }
            const { error: verificationError } = await supabase
              .from("courier_verifications")
              .insert({ courier_id: userId, id_card_path: path });
            if (verificationError) {
              throw new Error(
                "التسجيل نجح بس تسجيل طلب التوثيق فشل: " +
                  verificationError.message
              );
            }
          }

          if (onAuthSuccess) onAuthSuccess({ user: data.user, role });
        } else {
          // تأكيد الإيميل مفعّل في المشروع: مفيش جلسة لسه لحد ما يأكد.
          // نحفظ بيانات البروفايل مؤقتاً على الجهاز، وهتتعمل تلقائياً
          // أول ما اليوزر يأكد إيميله ويسجل دخول (شوف App.jsx). لو دليفري
          // وعنده صورة بطاقة، بنحفظها هي كمان مؤقتاً (base64) عشان تتترفع
          // بعد التأكيد لما تبقى عنده جلسة فعلية تسمحله يرفع على الباكت.
          if (fields.email.trim()) {
            const pendingKey = `seka_pending_profile_${fields.email.trim().toLowerCase()}`;
            if (role === "courier" && idCardFile) {
              try {
                const idCardDataUrl = await fileToDataUrl(idCardFile);
                localStorage.setItem(
                  pendingKey,
                  JSON.stringify({
                    ...profileData,
                    idCardDataUrl,
                    idCardName: idCardFile.name,
                  })
                );
              } catch (_) {
                localStorage.setItem(pendingKey, JSON.stringify(profileData));
              }
            } else {
              localStorage.setItem(pendingKey, JSON.stringify(profileData));
            }
          }
          setAuthError("اتبعتلك رابط تأكيد على إيميلك، افتحه وبعدين سجّل دخول");
        }
      } else {
        // تسجيل دخول بحساب موجود
        const { data, error } = await supabase.auth.signInWithPassword({
          email: fields.email.trim(),
          password: fields.password,
        });
        if (error) throw error;
        if (onAuthSuccess) onAuthSuccess({ user: data.user });
      }
    } catch (err) {
      setAuthError(translateAuthError(err?.message));
    } finally {
      if (mode === "signup" && onSignupEnd) onSignupEnd();
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode((m) => (m === "login" ? "signup" : "login"));
    setErrors({});
    setAuthError("");
    setAuthNotice("");
  };

  const goToForgot = () => {
    setMode("forgot");
    setErrors({});
    setAuthError("");
    setAuthNotice("");
  };

  const backToLogin = () => {
    setMode("login");
    setErrors({});
    setAuthError("");
    setAuthNotice("");
  };

  return (
    <div className="seka-auth-root" dir="rtl">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Changa:wght@500;600;700;800&family=Cairo:wght@400;500;600;700;900&display=swap');

        .seka-auth-root {
          --navy: #0B1526;
          --navy-2: #101E33;
          --navy-3: #16263F;
          --navy-line: #22344F;
          --gold: #F2B705;
          --gold-2: #E8A33D;
          --white: #FFFFFF;
          --muted: #93A0B8;
          --muted-2: #5E6E8C;
          --danger: #FF6B6B;
          --danger-bg: #3A1616;

          font-family: 'Cairo', sans-serif;
          background: radial-gradient(1200px 600px at 85% -10%, #14213a 0%, var(--navy) 55%), var(--navy);
          color: var(--white);
          width: 100%;
          max-width: 430px;
          margin: 0 auto;
          min-height: 100vh;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
        }
        .seka-auth-root * { box-sizing: border-box; }

        /* -------- hero -------- */
        .auth-hero {
          display: flex; flex-direction: column; align-items: center;
          padding: 44px 24px 22px; text-align: center;
        }
        .auth-logo {
          width: 84px; height: 84px; border-radius: 22px; object-fit: contain;
          background: var(--navy);
          box-shadow: 0 14px 34px -12px rgba(242,183,5,0.4);
          margin-bottom: 16px;
        }
        .auth-brand-name {
          font-family: 'Changa', sans-serif; font-size: 30px; font-weight: 800;
          letter-spacing: 0.4px;
          background: linear-gradient(135deg, var(--gold), var(--gold-2));
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .auth-tagline { font-size: 13px; color: var(--muted); font-weight: 600; margin-top: 5px; }

        /* -------- role switch -------- */
        .role-row { display: flex; gap: 10px; padding: 4px 20px 0; margin-bottom: 6px; }
        .role-card {
          flex: 1; background: var(--navy-2); border: 1.5px solid var(--navy-line);
          border-radius: 16px; padding: 14px 10px; text-align: center; cursor: pointer;
          transition: all 0.2s ease;
        }
        .role-card svg { color: var(--muted); transition: color 0.2s ease; }
        .role-card.on {
          border-color: var(--gold-2);
          background: linear-gradient(180deg, rgba(242,183,5,0.14), rgba(242,183,5,0.03));
        }
        .role-card.on svg { color: var(--gold); }
        .role-label {
          font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 14px;
          margin-top: 8px; color: var(--white);
        }
        .role-sub { font-size: 11px; color: var(--muted); margin-top: 2px; line-height: 1.5; }

        /* -------- mode tabs -------- */
        .auth-tabs {
          display: flex; gap: 6px; margin: 18px 20px 0;
          background: var(--navy-2); border: 1px solid var(--navy-line);
          border-radius: 14px; padding: 5px;
        }
        .auth-tab {
          flex: 1; text-align: center; padding: 11px 8px; border-radius: 10px;
          font-family: 'Cairo', sans-serif; font-weight: 700; font-size: 13.5px;
          color: var(--muted); background: transparent; border: none; cursor: pointer;
          transition: all 0.25s ease;
        }
        .auth-tab.on {
          background: linear-gradient(135deg, var(--gold), var(--gold-2));
          color: var(--navy);
          box-shadow: 0 6px 16px -6px rgba(242,183,5,0.5);
        }

        /* -------- form -------- */
        .auth-form { padding: 20px 20px 34px; }
        .form-group { margin-bottom: 14px; }
        .form-label {
          font-size: 12px; font-weight: 700; color: var(--muted); margin-bottom: 7px;
          display: flex; align-items: center; gap: 6px;
        }
        .form-label svg { color: var(--gold-2); flex-shrink: 0; }
        .field-wrap { position: relative; }
        .field-input {
          width: 100%; background: var(--navy-3); border: 1px solid var(--navy-line);
          border-radius: 12px; padding: 12px 14px; color: var(--white);
          font-family: 'Cairo', sans-serif; font-size: 14px; font-weight: 500;
          outline: none; transition: border-color 0.2s ease;
        }
        .field-input.has-icon-btn { padding-left: 42px; }
        .field-input::placeholder { color: var(--muted-2); }
        .field-input:focus { border-color: var(--gold-2); }
        .field-input.err { border-color: var(--danger); }
        select.field-input { cursor: pointer; appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2393A0B8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>");
          background-repeat: no-repeat; background-position: left 14px center; padding-left: 34px; }
        select.field-input option { background: var(--navy-3); color: var(--white); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 0.9s linear infinite; }
        .field-err { font-size: 11.5px; color: var(--danger); margin-top: 6px; font-weight: 600; }

        /* -------- id card upload (courier signup) -------- */
        .id-card-note {
          display: flex; align-items: flex-start; gap: 7px;
          background: rgba(242,183,5,0.08); border: 1px solid rgba(242,183,5,0.25);
          border-radius: 10px; padding: 9px 10px; margin-bottom: 10px;
          font-size: 11.5px; line-height: 1.6; color: var(--muted);
        }
        .id-card-note svg { color: var(--gold-2); flex-shrink: 0; margin-top: 1px; }
        .id-card-upload {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 7px; padding: 22px 14px; border-radius: 12px; cursor: pointer;
          background: var(--navy-3); border: 1.5px dashed var(--navy-line);
          color: var(--muted); font-size: 12.5px; font-weight: 600;
          transition: border-color 0.2s ease;
        }
        .id-card-upload svg { color: var(--gold-2); }
        .id-card-upload.err { border-color: var(--danger); }
        .id-card-preview { position: relative; border-radius: 12px; overflow: hidden; border: 1px solid var(--navy-line); }
        .id-card-preview img { display: block; width: 100%; max-height: 190px; object-fit: cover; }
        .id-card-remove {
          position: absolute; bottom: 8px; left: 8px; display: flex; align-items: center; gap: 5px;
          background: rgba(11,21,38,0.85); border: 1px solid rgba(255,255,255,0.15);
          color: var(--white); font-size: 11.5px; font-weight: 700; font-family: 'Cairo', sans-serif;
          border-radius: 8px; padding: 6px 9px; cursor: pointer;
        }
        .auth-alert {
          background: var(--danger-bg); border: 1px solid rgba(255,107,107,0.35);
          color: var(--danger); font-size: 12.5px; font-weight: 700;
          border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; text-align: center;
        }
        .auth-notice {
          background: rgba(76,201,124,0.12); border: 1px solid rgba(76,201,124,0.35);
          color: #4CC97C; font-size: 12.5px; font-weight: 700;
          border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; text-align: center;
        }
        .forgot-link {
          background: none; border: none; color: var(--gold-2); font-weight: 700;
          font-family: 'Cairo', sans-serif; font-size: 12.5px; cursor: pointer;
          padding: 0; margin: -6px 0 14px; display: block;
        }
        .forgot-header { padding: 18px 20px 4px; }
        .forgot-back {
          background: none; border: none; color: var(--muted); font-weight: 700;
          font-family: 'Cairo', sans-serif; font-size: 12.5px; cursor: pointer;
          padding: 0; display: flex; align-items: center; gap: 5px; margin-bottom: 14px;
        }
        .forgot-title {
          font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 17px; color: var(--white);
          margin-bottom: 6px;
        }
        .forgot-sub { font-size: 12.5px; color: var(--muted); line-height: 1.6; }
        .pass-toggle {
          position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: var(--muted); cursor: pointer;
          display: flex; align-items: center; padding: 2px;
        }

        .btn-submit {
          width: 100%; border: none; border-radius: 12px; padding: 14px;
          font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 15px;
          background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: var(--navy);
          display: flex; align-items: center; justify-content: center; gap: 8px;
          cursor: pointer; transition: transform 0.15s ease, opacity 0.15s ease;
          box-shadow: 0 10px 24px -10px rgba(242,183,5,0.55);
          margin-top: 4px;
        }
        .btn-submit:active { transform: scale(0.97); }
        .btn-submit:disabled { opacity: 0.6; cursor: progress; }

        .auth-switch {
          text-align: center; margin-top: 20px; font-size: 13px; color: var(--muted);
        }
        .auth-switch button {
          background: none; border: none; color: var(--gold-2); font-weight: 800;
          cursor: pointer; font-family: 'Cairo', sans-serif; font-size: 13px;
          padding: 0; margin-right: 4px;
        }

        @keyframes rise { from { opacity:0; transform: translateY(8px);} to {opacity:1; transform: translateY(0);} }
        .anim-rise { animation: rise 0.35s ease both; }
      `}</style>

      {/* Hero */}
      <div className="auth-hero">
        <img src={LOGO_ICON} alt="سكة" className="auth-logo" />
        <div className="auth-brand-name">سكة</div>
        <div className="auth-tagline">نوصّلها لحد بابك</div>
      </div>

      {/* Role selection (signup only) */}
      {mode === "signup" && (
        <div className="role-row anim-rise" key="roles">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const on = role === r.id;
            return (
              <div
                key={r.id}
                className={`role-card ${on ? "on" : ""}`}
                onClick={() => {
                  setRole(r.id);
                  if (r.id !== "courier") {
                    setIdCardFile(null);
                    setIdCardPreview(null);
                    setErrors((er) => ({ ...er, idCard: undefined }));
                  }
                }}
              >
                <Icon size={24} />
                <div className="role-label">{r.label}</div>
                <div className="role-sub">{r.sub}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mode tabs (مش ظاهرين وقت استرجاع كلمة السر) */}
      {mode === "forgot" ? (
        <div className="forgot-header anim-rise">
          <button type="button" className="forgot-back" onClick={backToLogin}>
            <ArrowLeft size={15} style={{ transform: "scaleX(-1)" }} /> رجوع لتسجيل الدخول
          </button>
          <div className="forgot-title">استرجاع كلمة السر</div>
          <div className="forgot-sub">اكتب إيميلك وهنبعتلك رابط تحدد بيه كلمة سر جديدة</div>
        </div>
      ) : (
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === "login" ? "on" : ""}`}
            onClick={() => setMode("login")}
          >
            تسجيل دخول
          </button>
          <button
            className={`auth-tab ${mode === "signup" ? "on" : ""}`}
            onClick={() => setMode("signup")}
          >
            حساب جديد
          </button>
        </div>
      )}

      {/* Form */}
      <form className="auth-form anim-rise" key={mode} onSubmit={onSubmit}>
        {mode === "signup" && (
          <div className="form-group">
            <div className="form-label">
              <User size={14} /> الاسم الكامل
            </div>
            <div className="field-wrap">
              <input
                className={`field-input ${errors.fullName ? "err" : ""}`}
                type="text"
                placeholder="اكتب اسمك بالكامل"
                value={fields.fullName}
                onChange={setField("fullName")}
              />
            </div>
            {errors.fullName && <div className="field-err">{errors.fullName}</div>}
          </div>
        )}

        {mode === "signup" && (
          <div className="form-group">
            <div className="form-label">
              <Phone size={14} /> رقم التليفون
            </div>
            <div className="field-wrap">
              <input
                className={`field-input ${errors.phone ? "err" : ""}`}
                type="tel"
                placeholder="01xxxxxxxxx"
                value={fields.phone}
                onChange={setField("phone")}
              />
            </div>
            {errors.phone && <div className="field-err">{errors.phone}</div>}
          </div>
        )}

        {mode === "signup" && (
          <div className="form-group">
            <div className="form-label">
              <MapPin size={14} /> المكان
            </div>
            <div className="field-wrap">
              {locationsLoading ? (
                <div className="field-input" style={{ display: "flex", alignItems: "center", gap: 8, color: "#5E6E8C" }}>
                  <Loader2 size={14} className="spin" /> بنحمّل الأماكن...
                </div>
              ) : locations.length === 0 ? (
                <div className="field-input" style={{ color: "#5E6E8C" }}>
                  لسه مفيش أماكن متاحة، حاول تاني بعدين
                </div>
              ) : (
                <select
                  className={`field-input ${errors.area ? "err" : ""}`}
                  value={fields.area}
                  onChange={setField("area")}
                >
                  <option value="" disabled>
                    اختار المكان
                  </option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.name}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {errors.area && <div className="field-err">{errors.area}</div>}
          </div>
        )}

        {mode === "signup" && role === "courier" && (
          <div className="form-group">
            <div className="form-label">
              <CreditCard size={14} /> صورة البطاقة الشخصية
            </div>

            <div className="id-card-note">
              <ShieldCheck size={15} />
              <span>بنطلب صورة بطاقتك للتأكد من هويتك والحفاظ على أمان العملاء وباقي الدليفريز على المنصة. بياناتك محفوظة بسرية ومتشافش غير من فريق المراجعة.</span>
            </div>

            {idCardPreview ? (
              <div className="id-card-preview">
                <img src={idCardPreview} alt="صورة البطاقة" />
                <button type="button" className="id-card-remove" onClick={removeIdCard}>
                  <XIcon size={13} /> شيل الصورة
                </button>
              </div>
            ) : (
              <div
                className={`id-card-upload ${errors.idCard ? "err" : ""}`}
                role="button"
                tabIndex={0}
                onClick={handlePickIdCard}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handlePickIdCard();
                  }
                }}
              >
                <Upload size={18} />
                <span>ارفع صورة البطاقة (وش البطاقة)</span>
              </div>
            )}
            {errors.idCard && <div className="field-err">{errors.idCard}</div>}
          </div>
        )}

        <div className="form-group">
          <div className="form-label">
            <Mail size={14} /> الإيميل
          </div>
          <div className="field-wrap">
            <input
              className={`field-input ${errors.email ? "err" : ""}`}
              type="email"
              placeholder="example@email.com"
              value={fields.email}
              onChange={setField("email")}
            />
          </div>
          {errors.email && <div className="field-err">{errors.email}</div>}
        </div>

        {mode !== "forgot" && (
          <div className="form-group">
            <div className="form-label">
              <Lock size={14} /> كلمة السر
            </div>
            <div className="field-wrap">
              <input
                className={`field-input has-icon-btn ${errors.password ? "err" : ""}`}
                type={showPass ? "text" : "password"}
                placeholder="6 حروف/أرقام على الأقل"
                value={fields.password}
                onChange={setField("password")}
              />
              <button
                type="button"
                className="pass-toggle"
                onClick={() => setShowPass((s) => !s)}
                tabIndex={-1}
              >
                {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {errors.password && <div className="field-err">{errors.password}</div>}
          </div>
        )}

        {mode === "login" && (
          <button type="button" className="forgot-link" onClick={goToForgot}>
            نسيت كلمة السر؟
          </button>
        )}

        {authError && <div className="auth-alert">{authError}</div>}
        {authNotice && <div className="auth-notice">{authNotice}</div>}

        <button className="btn-submit" type="submit" disabled={submitting}>
          {submitting ? (
            mode === "forgot" ? "بنبعت الرابط..." : "بنسجّلك..."
          ) : mode === "login" ? (
            <>
              <ArrowLeft size={16} /> تسجيل الدخول
            </>
          ) : mode === "forgot" ? (
            <>
              <ArrowLeft size={16} /> ابعت رابط التغيير
            </>
          ) : (
            <>
              <ArrowLeft size={16} /> إنشاء الحساب
            </>
          )}
        </button>

        {mode !== "forgot" && (
          <div className="auth-switch">
            {mode === "login" ? "لسه معملتش حساب؟" : "عندك حساب بالفعل؟"}
            <button type="button" onClick={switchMode}>
              {mode === "login" ? "سجّل دلوقتي" : "سجّل دخول"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
