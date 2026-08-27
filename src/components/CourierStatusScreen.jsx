import React, { useEffect } from "react";
import { Clock3, XCircle, LogOut } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const LOGO_ICON = "/seka-icon.png";

// بتتعرض للدليفري بدل شاشة الشغل العادية طول ما طلب توثيق البطاقة بتاعه
// لسه "قيد المراجعة" أو اتـ"رفض" من الأدمن. لما الأدمن يقبل الطلب،
// الشاشة بتتحول تلقائياً لشاشة الدليفري العادية من غير ما يحتاج يعمل
// أي حاجة (بنستمع لتغييرات realtime على صف التوثيق بتاعه بالظبط).
export default function CourierStatusScreen({ verification, onApproved, onLogout }) {
  const status = verification?.status || "pending";

  useEffect(() => {
    if (!verification?.id) return;
    const channel = supabase
      .channel(`courier-verification-${verification.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "courier_verifications",
          filter: `id=eq.${verification.id}`,
        },
        (payload) => {
          if (payload.new?.status === "approved") {
            onApproved?.();
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [verification?.id, onApproved]);

  const isRejected = status === "rejected";

  return (
    <div
      dir="rtl"
      style={{
        fontFamily: "Cairo, sans-serif",
        background:
          "radial-gradient(1200px 600px at 85% -10%, #14213a 0%, #0B1526 55%), #0B1526",
        color: "#FFFFFF",
        width: "100%",
        maxWidth: 430,
        margin: "0 auto",
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        textAlign: "center",
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
          marginBottom: 26,
        }}
      />

      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isRejected ? "#3A1616" : "#3A2F10",
          marginBottom: 20,
        }}
      >
        {isRejected ? (
          <XCircle size={30} color="#FF6B6B" />
        ) : (
          <Clock3 size={30} color="#F2B705" />
        )}
      </div>

      <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 10 }}>
        {isRejected ? "طلب التسجيل اتـرفض" : "حسابك قيد المراجعة"}
      </div>

      <div
        style={{
          fontSize: 13.5,
          color: "#93A0B8",
          lineHeight: 1.9,
          marginBottom: isRejected && verification?.admin_note ? 14 : 28,
          maxWidth: 320,
        }}
      >
        {isRejected
          ? "للأسف الإدارة رفضت صورة البطاقة اللي رفعتها وقت التسجيل. تقدر تتواصل مع الدعم لمعرفة السبب أو تصحيح البيانات."
          : "بنراجع صورة البطاقة اللي رفعتها وقت التسجيل. هتقدر تبدأ تستقبل طلبات لما الإدارة توافق على حسابك — عادةً بياخد وقت قصير."}
      </div>

      {isRejected && verification?.admin_note && (
        <div
          style={{
            background: "#161F33",
            border: "1px solid #22314F",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 12.5,
            color: "#C7CEDD",
            marginBottom: 28,
            maxWidth: 320,
            lineHeight: 1.8,
          }}
        >
          <span style={{ color: "#93A0B8" }}>ملاحظة الإدارة: </span>
          {verification.admin_note}
        </div>
      )}

      <button
        onClick={onLogout}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid #22314F",
          borderRadius: 12,
          padding: "12px 22px",
          fontFamily: "Cairo, sans-serif",
          fontWeight: 700,
          fontSize: 13.5,
          background: "transparent",
          color: "#93A0B8",
          cursor: "pointer",
        }}
      >
        <LogOut size={16} />
        تسجيل الخروج
      </button>
    </div>
  );
}
