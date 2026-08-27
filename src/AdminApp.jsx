import React, { useEffect, useState } from "react";
import { Lock, Mail, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import AdminScreen from "./components/AdminScreen.jsx";

const LOGO_ICON = "/seka-icon.png";

// أبليكيشن الأدمن مستقلة تماماً: مفيش تسجيل حساب جديد ومفيش اختيار دور —
// بس تسجيل دخول بإيميل وباسورد لحساب اتعمله role='admin' من قاعدة البيانات
// مباشرة (شوف تعليمات docs/supabase-schema.sql). أي حد يسجل دخول بحساب
// مش أدمن بيتعمله تسجيل خروج فوري ومايشوفش أي بيانات.
export default function AdminApp() {
  const [status, setStatus] = useState("checking"); // checking | denied | login | ready
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const checkAdminSession = async (user) => {
    if (!user) {
      setProfile(null);
      setStatus("login");
      return;
    }
    const { data, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (pErr || !data || data.role !== "admin") {
      // مش أدمن — نسجله خروج فوراً ومنورّيهوش أي داتا
      await supabase.auth.signOut();
      setProfile(null);
      setStatus("denied");
      return;
    }
    setProfile(data);
    setStatus("ready");
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkAdminSession(session?.user || null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      checkAdminSession(session?.user || null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("اكتب الإيميل وكلمة السر");
      return;
    }
    setSubmitting(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);

    if (signInError) {
      setError("الإيميل أو كلمة السر غلط");
      return;
    }
    await checkAdminSession(data.user);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setStatus("login");
  };

  const shellStyle = {
    minHeight: "100vh",
    background: "radial-gradient(1200px 600px at 85% -10%, #14213a 0%, #0B1526 55%), #0B1526",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily: "'Cairo', sans-serif",
  };

  if (status === "checking") {
    return (
      <div style={shellStyle} dir="rtl">
        <FontImport />
        <div style={{ color: "#93A0B8", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Loader2 size={26} className="admin-spin" color="#F2B705" />
          بنتحقق من الحساب...
        </div>
        <style>{`.admin-spin{animation:adminspin .9s linear infinite}@keyframes adminspin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (status === "ready" && profile) {
    return <AdminScreen profile={profile} onLogout={handleLogout} />;
  }

  return (
    <div style={shellStyle} dir="rtl">
      <FontImport />
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#101E33",
          border: "1px solid #22344F",
          borderRadius: 20,
          padding: "28px 24px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 }}>
          <img
            src={LOGO_ICON}
            alt="سكة"
            style={{ width: 52, height: 52, borderRadius: 14, marginBottom: 10, objectFit: "contain" }}
          />
          <div style={{ fontFamily: "'Changa', sans-serif", fontSize: 19, fontWeight: 700, color: "#fff" }}>
            لوحة تحكم سكة
          </div>
          <div style={{ fontSize: 12.5, color: "#93A0B8", marginTop: 3 }}>دخول أدمن فقط</div>
        </div>

        {status === "denied" && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              background: "#3A1616",
              border: "1px solid #FF6B6B",
              color: "#FF6B6B",
              borderRadius: 12,
              padding: "10px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              lineHeight: 1.8,
              marginBottom: 16,
            }}
          >
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            الحساب ده مش عنده صلاحية أدمن، اتسجل خروج تلقائياً.
          </div>
        )}

        <form onSubmit={onSubmit}>
          <FieldWrap icon={<Mail size={16} />}>
            <input
              type="email"
              placeholder="الإيميل"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              autoComplete="username"
            />
          </FieldWrap>
          <FieldWrap icon={<Lock size={16} />} style={{ marginTop: 12 }}>
            <input
              type={showPass ? "text" : "password"}
              placeholder="كلمة السر"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              style={{
                background: "none",
                border: "none",
                color: "#5E6E8C",
                cursor: "pointer",
                display: "flex",
                padding: 0,
              }}
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </FieldWrap>

          {error && (
            <div style={{ color: "#FF6B6B", fontSize: 12.5, fontWeight: 600, marginTop: 10 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              marginTop: 18,
              border: "none",
              borderRadius: 12,
              padding: "13px",
              fontFamily: "'Cairo', sans-serif",
              fontWeight: 800,
              fontSize: 14.5,
              background: "linear-gradient(135deg, #F2B705, #E8A33D)",
              color: "#0B1526",
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {submitting ? <Loader2 size={16} className="admin-spin" /> : null}
            {submitting ? "بيدخل..." : "دخول"}
          </button>
        </form>
      </div>
      <style>{`.admin-spin{animation:adminspin .9s linear infinite}@keyframes adminspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const inputStyle = {
  flex: 1,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "#fff",
  fontFamily: "'Cairo', sans-serif",
  fontSize: 14,
  padding: "12px 0",
};

function FieldWrap({ icon, children, style }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#0B1526",
        border: "1px solid #22344F",
        borderRadius: 12,
        padding: "0 12px",
        ...style,
      }}
    >
      <span style={{ color: "#5E6E8C", display: "flex" }}>{icon}</span>
      {children}
    </div>
  );
}

function FontImport() {
  return (
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Changa:wght@500;600;700;800&family=Cairo:wght@400;500;600;700;900&display=swap');`}</style>
  );
}
