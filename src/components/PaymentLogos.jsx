import React from "react";
import { Smartphone, Zap } from "lucide-react";

// شعارات وسائل الدفع (فودافون كاش / انستاباي) — أيقونة + لون العلامة التجارية
// بيستخدموا currentColor عشان ياخدوا اللون من الخلفية اللي حواليهم في كل مكان بيتحطوا فيه.

export const VODAFONE_CASH_COLOR = "#E60000";
export const VODAFONE_CASH_BG = "#3A1616";
export const INSTAPAY_COLOR = "#8E5CF7";
export const INSTAPAY_BG = "#241A3D";

export function VodafoneCashLogo({ size = 18 }) {
  return <Smartphone size={size} strokeWidth={2.3} />;
}

export function InstaPayLogo({ size = 18 }) {
  return <Zap size={size} strokeWidth={2.3} />;
}

// شارة جاهزة (أيقونة + خلفية بلون العلامة التجارية) — لو عايز تحطها في مكان جديد
// بدون ما تكرر الـ style كل مرة
export function PaymentMethodBadge({ method, size = 18, boxSize = 30, radius = 9 }) {
  const isVodafone = method === "vodafone_cash" || method === "cash";
  const Logo = isVodafone ? VodafoneCashLogo : InstaPayLogo;
  const color = isVodafone ? VODAFONE_CASH_COLOR : INSTAPAY_COLOR;
  const bg = isVodafone ? VODAFONE_CASH_BG : INSTAPAY_BG;
  return (
    <span
      style={{
        width: boxSize,
        height: boxSize,
        borderRadius: radius,
        background: bg,
        color,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Logo size={size} />
    </span>
  );
}
