import React, { useState } from "react";
import { Lock, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const LOGO_ICON = "/seka-icon.png";

// بتتعرض لما Supabase يبعت اليوزر هنا بعد ما يدوس على رابط "استرجاع كلمة السر"
// اللي وصله على إيميله (App.jsx بيتعرف على اللحظة دي من حدث PASSWORD_RECOVERY)
export default function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!password.trim() || password.length < 6) {
      setError("كلمة السر لازم تكون 6 حروف/أرقام على الأقل");
      return;
    }
    if (password !== confirm) {
      setError("كلمتين السر مش متطابقين");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError("حصل خطأ، جرب تاني أو اطلب رابط جديد");
      return;
    }
    setDone(true);
  };

  return (
    <div
      dir="rtl"
      style={{
        fontFamily: "Cairo, sans-serif",
        background: "radial-gradient(1200px 600px at 85% -10%, #14213a 0%, #0B1526 55%), #0B1526",
        color: "#FFFFFF",
        width: "100%",
        maxWidth: 430,
        margin: "0 auto",
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "60px 24px",
      }}
    >
      <img
        src={LOGO_ICON}
        alt="سكة"
        style={{
          width: 76,
          height: 76,
          borderRadius: 20,
          objectFit: "contain",
          boxShadow: "0 14px 34px -12px rgba(242,183,5,0.4)",
          marginBottom: 24,
        }}
      />

      {done ? (
        <div style={{ textAlign: "center" }}>
          <CheckCircle2 size={40} color="#4CC97C" style={{ marginBottom: 14 }} />
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>
            اتغيّرت كلمة السر بنجاح
          </div>
          <div style={{ fontSize: 13, color: "#93A0B8", marginBottom: 22, lineHeight: 1.7 }}>
            دلوقتي تقدر تدخل بكلمة السر الجديدة
          </div>
          <button
            onClick={onDone}
            style={{
              border: "none",
              borderRadius: 12,
              padding: "13px 26px",
              fontFamily: "Cairo, sans-serif",
              fontWeight: 800,
              fontSize: 14,
              background: "linear-gradient(135deg, #F2B705, #E8A33D)",
              color: "#0B1526",
              cursor: "pointer",
            }}
          >
            تسجيل الدخول
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ width: "100%" }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>
            حدّد كلمة سر جديدة
          </div>
          <div style={{ fontSize: 12.5, color: "#93A0B8", marginBottom: 20, lineHeight: 1.6 }}>
            اكتب كلمة السر الجديدة اللي هتستخدمها من دلوقتي
          </div>

          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#93A0B8",
                marginBottom: 7,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Lock size={14} color="#E8A33D" /> كلمة السر الجديدة
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6 حروف/أرقام على الأقل"
                style={{
                  width: "100%",
                  background: "#16263F",
                  border: "1px solid #22344F",
                  borderRadius: 12,
                  padding: "12px 42px 12px 14px",
                  color: "#FFFFFF",
                  fontFamily: "Cairo, sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                tabIndex={-1}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#93A0B8",
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                }}
              >
                {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#93A0B8",
                marginBottom: 7,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Lock size={14} color="#E8A33D" /> تأكيد كلمة السر
            </div>
            <input
              type={showPass ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="اكتبها تاني"
              style={{
                width: "100%",
                background: "#16263F",
                border: "1px solid #22344F",
                borderRadius: 12,
                padding: "12px 14px",
                color: "#FFFFFF",
                fontFamily: "Cairo, sans-serif",
                fontSize: 14,
                fontWeight: 500,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div
              style={{
                background: "#3A1616",
                border: "1px solid rgba(255,107,107,0.35)",
                color: "#FF6B6B",
                fontSize: 12.5,
                fontWeight: 700,
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 14,
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 12,
              padding: 14,
              fontFamily: "Cairo, sans-serif",
              fontWeight: 800,
              fontSize: 15,
              background: "linear-gradient(135deg, #F2B705, #E8A33D)",
              color: "#0B1526",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: submitting ? "progress" : "pointer",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? <Loader2 size={16} className="spin" /> : null}
            {submitting ? "بنحفظ..." : "احفظ كلمة السر الجديدة"}
          </button>
        </form>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} } .spin { animation: spin 0.9s linear infinite; }`}</style>
    </div>
  );
}
