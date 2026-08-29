import React, { useState, useEffect, useCallback } from "react";
import {
  ChevronRight,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Truck,
  RotateCcw,
  Loader2,
  X,
  CheckCircle2,
  Phone,
  Copy,
  Check,
  Camera,
  Clock,
  XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { pickImage } from "../lib/pickImage";
import { VodafoneCashLogo, InstaPayLogo } from "./PaymentLogos.jsx";

// قيمة افتراضية بس لحد ما نجيب القيمة الحقيقية من app_settings (نفس default الداتابيز)
const DEFAULT_ORDER_FEE = 2;

// وسائل السحب (السحب لسه بيتم بنفس الفكرة القديمة برقم الموبايل)
const PAYMENT_METHODS = [
  { key: "vodafone_cash", label: "فودافون كاش", Logo: VodafoneCashLogo, color: "#E60000", bg: "#3A1616" },
  { key: "instapay", label: "انستاباي", Logo: InstaPayLogo, color: "#8E5CF7", bg: "#241A3D" },
];

const ACCOUNT_META = {
  cash: { Logo: VodafoneCashLogo, color: "#E60000", bg: "#3A1616" },
  instapay: { Logo: InstaPayLogo, color: "#8E5CF7", bg: "#241A3D" },
};

function formatEGP(n) {
  const v = Number(n || 0);
  return v.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "دلوقتي";
  if (diff < 3600) return `من ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `من ${Math.floor(diff / 3600)} س`;
  return `من ${Math.floor(diff / 86400)} يوم`;
}

const TX_META = {
  topup: { icon: ArrowDownToLine, color: "#35D68C", bg: "#0F2E24", sign: "+", label: "شحن محفظة" },
  withdraw: { icon: ArrowUpFromLine, color: "#FF6B6B", bg: "#3A1616", sign: "-", label: "سحب" },
  order_fee: { icon: Truck, color: "#FF6B6B", bg: "#3A1616", sign: "-", label: "رسوم أوردر" },
  refund: { icon: RotateCcw, color: "#F2B705", bg: "#3A2F10", sign: "+", label: "استرجاع رسوم" },
  admin_adjustment: { icon: Wallet, color: "#F2B705", bg: "#3A2F10", sign: "", label: "تعديل من الإدارة" },
  topup_pending: { icon: Clock, color: "#F2B705", bg: "#3A2F10", sign: "", label: "طلب شحن قيد المراجعة" },
  topup_rejected: { icon: XCircle, color: "#FF6B6B", bg: "#3A1616", sign: "", label: "طلب شحن مرفوض" },
};

export default function WalletScreen({ profile, onBack, onBalanceChange }) {
  const [balance, setBalance] = useState(0);
  const [orderFee, setOrderFee] = useState(DEFAULT_ORDER_FEE);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(null); // null | 'topup' | 'withdraw'
  const [step, setStep] = useState("method"); // 'method' | 'amount'
  const [method, setMethod] = useState(null); // 'vodafone_cash' | 'instapay' (withdraw only)
  const [reference, setReference] = useState(""); // رقم الموبايل المرتبط بالمحفظة (withdraw only)
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success'|'error', text }

  // -------- شحن بالتحويل: محافظ الأدمن + إسكرين الإثبات --------
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchAll = useCallback(async () => {
    if (!profile?.id) return;
    const [{ data: p }, { data: t }, { data: reqs }, { data: settings }] = await Promise.all([
      supabase.from("profiles").select("wallet_balance").eq("id", profile.id).single(),
      supabase
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("topup_requests")
        .select("*")
        .eq("user_id", profile.id)
        .neq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase.from("app_settings").select("commission_amount").eq("id", 1).maybeSingle(),
    ]);
    if (p) {
      setBalance(p.wallet_balance || 0);
      onBalanceChange && onBalanceChange(p.wallet_balance || 0);
    }
    if (settings?.commission_amount != null) {
      setOrderFee(Number(settings.commission_amount));
    }
    const reqRows = (reqs || []).map((r) => ({
      id: `req-${r.id}`,
      type: r.status === "pending" ? "topup_pending" : "topup_rejected",
      amount: r.amount,
      created_at: r.created_at,
      note: r.status === "pending" ? null : r.admin_note ? `اتراجع: ${r.admin_note}` : null,
    }));
    const merged = [...(t || []), ...reqRows].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    setTxs(merged);
  }, [profile?.id, onBalanceChange]);

  useEffect(() => {
    setLoading(true);
    fetchAll().then(() => setLoading(false));
  }, [fetchAll]);

  // لو الأدمن غيّر قيمة العمولة والشاشة فاتحة، تتحدّث لايف من غير ما نحتاج refresh يدوي
  useEffect(() => {
    const channel = supabase
      .channel("wallet-app-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, (payload) => {
        const fee = payload?.new?.commission_amount;
        if (fee != null) setOrderFee(Number(fee));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    const { data } = await supabase
      .from("payment_accounts")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    setAccounts(data || []);
    setAccountsLoading(false);
  }, []);

  const openMode = (m) => {
    setMode(m);
    setStep("method");
    setMethod(null);
    setReference("");
    setAmount("");
    setSelectedAccount(null);
    setScreenshotFile(null);
    setScreenshotPreview(null);
    if (m === "topup") fetchAccounts();
  };

  const closeSheet = () => {
    setMode(null);
    setStep("method");
    setMethod(null);
    setReference("");
    setAmount("");
    setSelectedAccount(null);
    setScreenshotFile(null);
    setScreenshotPreview(null);
  };

  const copyValue = async (acc) => {
    try {
      await navigator.clipboard.writeText(acc.value);
      setCopiedId(acc.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // تجاهل لو المتصفح مانعش النسخ
    }
  };

  const goToAmount = () => {
    if (mode === "topup") {
      if (!selectedAccount) {
        setToast({ type: "error", text: "اختار المحفظة اللي هتحوّل عليها" });
        return;
      }
      setStep("amount");
      return;
    }
    if (!method) {
      setToast({ type: "error", text: "اختار وسيلة الدفع الأول" });
      return;
    }
    if (!reference.trim() || reference.trim().length < 8) {
      setToast({ type: "error", text: "اكتب رقم الموبايل المرتبط بالمحفظة صح" });
      return;
    }
    setStep("amount");
  };

  const handlePickScreenshot = async () => {
    // جوه Capacitor (أندرويد حقيقي) → بوب-أب "كاميرا / معرض الصور" حقيقي
    // في المتصفح (PWA) → نفس input الملف القديم بالظبط
    const file = await pickImage({ fileNamePrefix: "topup-proof" });
    if (!file) return; // المستخدم لغى الاختيار
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = () => setScreenshotPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      setToast({ type: "error", text: "اكتب مبلغ صحيح الأول" });
      return;
    }
    if (mode === "withdraw" && val > balance) {
      setToast({ type: "error", text: "الرصيد مش كافي للسحب ده" });
      return;
    }
    if (mode === "topup" && !screenshotFile) {
      setToast({ type: "error", text: "لازم ترفع إسكرين إثبات التحويل" });
      return;
    }

    setBusy(true);

    if (mode === "topup") {
      const ext = (screenshotFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("topup-screenshots")
        .upload(path, screenshotFile, { contentType: screenshotFile.type });

      if (upErr) {
        setBusy(false);
        setToast({ type: "error", text: "فشل رفع الإسكرين، حاول تاني" });
        return;
      }

      const { error } = await supabase.rpc("submit_topup_request", {
        p_payment_account_id: selectedAccount.id,
        p_amount: val,
        p_screenshot_path: path,
      });
      setBusy(false);

      if (error) {
        setToast({ type: "error", text: error.message || "حصل خطأ، حاول تاني" });
        return;
      }
      setToast({ type: "success", text: "تم إرسال طلب الشحن، هيتراجع قريب ✅" });
      closeSheet();
      fetchAll();
      return;
    }

    const { data, error } = await supabase.rpc("submit_withdraw_request", {
      p_amount: val,
      p_method: method,
      p_reference: reference.trim(),
    });
    setBusy(false);

    if (error) {
      setToast({ type: "error", text: error.message || "حصل خطأ، حاول تاني" });
      return;
    }
    setToast({ type: "success", text: "تم إرسال طلب السحب بنجاح" });
    setBalance(data);
    onBalanceChange && onBalanceChange(data);
    closeSheet();
    fetchAll();
  };

  const quickAmounts = mode === "topup" ? [20, 50, 100, 200] : [orderFee * 5, 20, 50, 100];

  return (
    <div className="wallet-root" dir="rtl">
      <style>{`
        .wallet-root {
          --navy: #0B1526; --navy-2: #101E33; --navy-3: #16263F; --navy-line: #22344F;
          --gold: #F2B705; --gold-2: #E8A33D; --white: #FFFFFF; --muted: #93A0B8; --muted-2: #5E6E8C;
          font-family: 'Cairo', sans-serif;
          background: radial-gradient(1200px 600px at 85% -10%, #14213a 0%, var(--navy) 55%), var(--navy);
          color: var(--white);
          width: 100%; max-width: 430px; margin: 0 auto; min-height: 100vh;
          box-sizing: border-box; position: relative; overflow: hidden;
        }
        .wallet-root * { box-sizing: border-box; }

        .wallet-header {
          display: flex; align-items: center; gap: 10px;
          padding: 22px 20px 16px; border-bottom: 1px solid var(--navy-line);
        }
        .wallet-back {
          width: 38px; height: 38px; border-radius: 12px;
          background: var(--navy-2); border: 1px solid var(--navy-line);
          color: var(--muted); display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0;
        }
        .wallet-back:active { transform: scale(0.94); }
        .wallet-title { font-family: 'Changa', sans-serif; font-size: 19px; font-weight: 700; }
        .wallet-sub { font-size: 11.5px; color: var(--muted); font-weight: 600; margin-top: 1px; }

        .wallet-body { padding: 20px 20px 100px; }

        .balance-card {
          background: linear-gradient(135deg, #16263F 0%, #101E33 100%);
          border: 1px solid var(--navy-line); border-radius: 22px;
          padding: 26px 22px; margin-bottom: 20px; position: relative; overflow: hidden;
        }
        .balance-card::before {
          content: ""; position: absolute; inset: -40% -20% auto auto; width: 220px; height: 220px;
          background: radial-gradient(circle, rgba(242,183,5,0.16), transparent 70%);
        }
        .balance-icon-row { display: flex; align-items: center; gap: 8px; color: var(--gold-2); font-size: 13px; font-weight: 700; margin-bottom: 10px; }
        .balance-amount { font-family: 'Changa', sans-serif; font-size: 38px; font-weight: 700; display: flex; align-items: baseline; gap: 8px; }
        .balance-amount span { font-size: 15px; color: var(--muted); font-weight: 600; }
        .balance-note { font-size: 12px; color: var(--muted); margin-top: 8px; line-height: 1.7; }

        .wallet-actions { display: flex; gap: 10px; margin-bottom: 24px; }
        .wallet-action-btn {
          flex: 1; border-radius: 14px; padding: 14px 10px; border: none; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 13.5px;
          transition: transform 0.15s ease;
        }
        .wallet-action-btn:active { transform: scale(0.96); }
        .wallet-action-btn.topup { background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: var(--navy); box-shadow: 0 8px 20px -8px rgba(242,183,5,0.5); }
        .wallet-action-btn.withdraw { background: var(--navy-2); border: 1px solid var(--navy-line); color: var(--white); }

        .fee-note {
          display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted);
          background: var(--navy-2); border: 1px solid var(--navy-line); border-radius: 12px;
          padding: 10px 12px; margin-bottom: 22px; line-height: 1.8;
        }
        .fee-note b { color: var(--gold-2); }

        .section-title { font-size: 13px; font-weight: 800; color: var(--muted); margin-bottom: 12px; }

        .tx-row {
          display: flex; align-items: center; gap: 12px;
          background: var(--navy-2); border: 1px solid var(--navy-line);
          border-radius: 14px; padding: 12px 14px; margin-bottom: 10px;
        }
        .tx-icon { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .tx-info { flex: 1; min-width: 0; }
        .tx-label { font-size: 13.5px; font-weight: 700; }
        .tx-time { font-size: 11px; color: var(--muted-2); margin-top: 2px; }
        .tx-amount { font-family: 'Changa', sans-serif; font-weight: 700; font-size: 14.5px; white-space: nowrap; }

        .empty-tx { text-align: center; color: var(--muted); font-size: 13px; padding: 40px 10px; line-height: 1.8; }

        .loading-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 90px 24px; color: var(--muted); }
        .spin { animation: spin 0.9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* -------- amount sheet -------- */
        .sheet-overlay {
          position: absolute; inset: 0; background: rgba(0,0,0,0.55);
          display: flex; align-items: flex-end; z-index: 30;
          animation: fadeIn 0.2s ease both;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .sheet {
          width: 100%; background: var(--navy-2); border: 1px solid var(--navy-line);
          border-radius: 22px 22px 0 0; padding: 20px 20px 26px;
          animation: slideUp 0.28s cubic-bezier(0.34,1.2,0.64,1) both;
          max-height: 88vh; overflow-y: auto;
        }

        .accounts-loading { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; padding: 16px 4px; }
        .account-list { display: flex; flex-direction: column; gap: 9px; margin-bottom: 12px; }
        .account-card {
          display: flex; align-items: center; gap: 10px;
          background: var(--navy-3); border: 1.5px solid var(--navy-line); border-radius: 14px;
          padding: 11px 12px; cursor: pointer; transition: transform 0.15s ease, border-color 0.15s ease;
        }
        .account-card:active { transform: scale(0.98); }
        .account-icon { width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .account-info { flex: 1; min-width: 0; }
        .account-label { font-size: 13.5px; font-weight: 800; }
        .account-value { font-size: 12px; color: var(--muted); margin-top: 2px; direction: ltr; text-align: right; overflow-wrap: anywhere; }
        .account-copy {
          width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0; cursor: pointer;
          background: var(--navy-2); border: 1px solid var(--navy-line); color: var(--muted);
          display: flex; align-items: center; justify-content: center;
        }

        .screenshot-upload { display: block; margin-bottom: 18px; cursor: pointer; }
        .screenshot-placeholder {
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
          background: var(--navy-3); border: 1.5px dashed var(--navy-line); border-radius: 14px;
          padding: 26px 12px; color: var(--muted); font-size: 12.5px; font-weight: 700;
        }
        .screenshot-preview {
          width: 100%; max-height: 220px; object-fit: contain;
          border-radius: 14px; border: 1.5px solid var(--navy-line); background: #000;
        }
        @keyframes slideUp { from { transform: translateY(30px); opacity: 0.6; } to { transform: translateY(0); opacity: 1; } }
        .sheet-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .sheet-title { font-family: 'Changa', sans-serif; font-size: 17px; font-weight: 700; }
        .sheet-close { width: 32px; height: 32px; border-radius: 10px; background: var(--navy-3); border: 1px solid var(--navy-line); color: var(--muted); display: flex; align-items: center; justify-content: center; cursor: pointer; }

        .amount-input-wrap {
          display: flex; align-items: center; gap: 8px;
          background: var(--navy-3); border: 1px solid var(--navy-line); border-radius: 14px;
          padding: 12px 14px; margin-bottom: 14px;
        }
        .amount-input-wrap input {
          flex: 1; background: transparent; border: none; outline: none; color: var(--white);
          font-family: 'Changa', sans-serif; font-size: 20px; font-weight: 700;
        }
        .amount-input-wrap span { color: var(--muted); font-size: 13px; font-weight: 700; }

        .method-label { font-size: 12.5px; font-weight: 800; color: var(--muted); margin-bottom: 10px; }
        .method-row { display: flex; gap: 10px; margin-bottom: 14px; }
        .method-card {
          flex: 1; display: flex; align-items: center; gap: 9px;
          background: var(--navy-3); border: 1.5px solid var(--navy-line); border-radius: 14px;
          padding: 12px; font-size: 13.5px; font-weight: 700; color: var(--white); cursor: pointer;
          transition: transform 0.15s ease, border-color 0.15s ease;
        }
        .method-card:active { transform: scale(0.97); }
        .method-card.on { background: var(--navy-2); }
        .method-mono {
          width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Changa', sans-serif; font-weight: 700; font-size: 11.5px;
        }
        .method-hint { font-size: 11.5px; color: var(--muted); line-height: 1.7; margin-bottom: 14px; }

        .chosen-method-pill {
          display: flex; align-items: center; gap: 9px;
          background: var(--navy-3); border: 1px solid var(--navy-line); border-radius: 14px;
          padding: 10px 12px; margin-bottom: 14px; cursor: pointer; font-size: 13px; font-weight: 700;
        }
        .chosen-method-pill span:nth-child(2) { flex: 1; color: var(--white); }
        .chosen-method-edit { font-size: 11.5px; color: var(--gold-2); font-weight: 800; }

        .quick-row { display: flex; gap: 8px; margin-bottom: 18px; }
        .quick-chip {
          flex: 1; text-align: center; padding: 9px 4px; border-radius: 10px;
          background: var(--navy-3); border: 1px solid var(--navy-line); color: var(--muted);
          font-size: 12.5px; font-weight: 700; cursor: pointer;
        }
        .quick-chip:active { transform: scale(0.95); }

        .sheet-submit {
          width: 100%; border: none; border-radius: 14px; padding: 14px;
          font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 15px;
          background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: var(--navy);
          display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;
        }
        .sheet-submit:disabled { opacity: 0.6; }

        .wallet-toast {
          position: absolute; left: 20px; right: 20px; bottom: 22px;
          padding: 13px 16px; border-radius: 14px; font-weight: 700; font-size: 13.5px;
          display: flex; align-items: center; gap: 8px; z-index: 40;
          animation: pop 0.35s ease both; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.6);
        }
        .wallet-toast.success { background: #0F2E24; color: #35D68C; border: 1px solid #35D68C; }
        .wallet-toast.error { background: #3A1616; color: #FF6B6B; border: 1px solid #FF6B6B; }
        @keyframes pop { from { opacity: 0; transform: translateY(10px) scale(0.96);} to { opacity: 1; transform: translateY(0) scale(1);} }
      `}</style>

      <div className="wallet-header">
        <button className="wallet-back" onClick={onBack}>
          <ChevronRight size={19} />
        </button>
        <div>
          <div className="wallet-title">المحفظة</div>
          <div className="wallet-sub">رصيدك، الشحن والسحب</div>
        </div>
      </div>

      <div className="wallet-body">
        {loading ? (
          <div className="loading-wrap">
            <Loader2 size={28} className="spin" />
            <div>بنحمّل المحفظة...</div>
          </div>
        ) : (
          <>
            <div className="balance-card">
              <div className="balance-icon-row">
                <Wallet size={16} /> الرصيد الحالي
              </div>
              <div className="balance-amount">
                {formatEGP(balance)} <span>جنيه</span>
              </div>
              <div className="balance-note">
                كل أوردر بتاخده بيتخصم منه <b>{orderFee} جنيه</b> رسوم استخدام تلقائي من المحفظة.
              </div>
            </div>

            <div className="wallet-actions">
              <button className="wallet-action-btn topup" onClick={() => openMode("topup")}>
                <ArrowDownToLine size={19} />
                شحن المحفظة
              </button>
              <button className="wallet-action-btn withdraw" onClick={() => openMode("withdraw")}>
                <ArrowUpFromLine size={19} />
                سحب
              </button>
            </div>

            <div className="fee-note">
              <Truck size={16} color="#F2B705" />
              لازم يكون معاك على الأقل <b>{orderFee} جنيه</b> في المحفظة عشان تقدر تاخد أوردر جديد.
            </div>

            <div className="section-title">آخر الحركات</div>
            {txs.length === 0 ? (
              <div className="empty-tx">لسه معملتش أي حركة في المحفظة.</div>
            ) : (
              txs.map((tx) => {
                const meta = TX_META[tx.type] || TX_META.topup;
                const Icon = meta.icon;
                return (
                  <div className="tx-row" key={tx.id}>
                    <div className="tx-icon" style={{ background: meta.bg, color: meta.color }}>
                      <Icon size={17} />
                    </div>
                    <div className="tx-info">
                      <div className="tx-label">{tx.note || meta.label}</div>
                      <div className="tx-time">{timeAgo(tx.created_at)}</div>
                    </div>
                    <div className="tx-amount" style={{ color: meta.color }}>
                      {meta.sign} {formatEGP(tx.amount)}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {mode && (
        <div className="sheet-overlay" onClick={() => !busy && closeSheet()}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-top">
              <div className="sheet-title">
                {mode === "topup" ? "شحن المحفظة" : "سحب من المحفظة"}
              </div>
              <button className="sheet-close" onClick={() => !busy && closeSheet()}>
                <X size={16} />
              </button>
            </div>

            {mode === "topup" ? (
              step === "method" ? (
                <>
                  <div className="method-label">حوّل على واحدة من المحافظ دي</div>
                  {accountsLoading ? (
                    <div className="accounts-loading">
                      <Loader2 size={20} className="spin" /> بنحمّل المحافظ...
                    </div>
                  ) : accounts.length === 0 ? (
                    <div className="empty-tx">مفيش محافظ متاحة للتحويل دلوقتي، حاول تاني بعدين.</div>
                  ) : (
                    <div className="account-list">
                      {accounts.map((acc) => {
                        const meta = ACCOUNT_META[acc.type] || ACCOUNT_META.cash;
                        const Logo = meta.Logo;
                        const on = selectedAccount?.id === acc.id;
                        return (
                          <div
                            key={acc.id}
                            className={`account-card ${on ? "on" : ""}`}
                            onClick={() => setSelectedAccount(acc)}
                            style={on ? { borderColor: meta.color } : {}}
                          >
                            <span className="account-icon" style={{ background: meta.bg, color: meta.color }}>
                              <Logo size={18} />
                            </span>
                            <div className="account-info">
                              <div className="account-label">{acc.label}</div>
                              <div className="account-value">{acc.value}</div>
                            </div>
                            <button
                              type="button"
                              className="account-copy"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyValue(acc);
                              }}
                            >
                              {copiedId === acc.id ? <Check size={15} color="#35D68C" /> : <Copy size={15} />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="method-hint">
                    حوّل المبلغ على المحفظة اللي اخترتها، وبعدين ارفع إسكرين إثبات التحويل.
                  </div>
                  <button className="sheet-submit" onClick={goToAmount}>
                    متابعة
                  </button>
                </>
              ) : (
                <>
                  <div
                    className="chosen-method-pill"
                    onClick={() => !busy && setStep("method")}
                  >
                    <span
                      className="method-mono"
                      style={{
                        background: (ACCOUNT_META[selectedAccount?.type] || ACCOUNT_META.cash).bg,
                        color: (ACCOUNT_META[selectedAccount?.type] || ACCOUNT_META.cash).color,
                      }}
                    >
                      {(() => {
                        const Logo = (ACCOUNT_META[selectedAccount?.type] || ACCOUNT_META.cash).Logo;
                        return <Logo size={16} />;
                      })()}
                    </span>
                    <span>{selectedAccount?.label} — {selectedAccount?.value}</span>
                    <span className="chosen-method-edit">تغيير</span>
                  </div>
                  <div className="amount-input-wrap">
                    <input
                      type="number"
                      inputMode="decimal"
                      autoFocus
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <span>جنيه</span>
                  </div>
                  <div className="quick-row">
                    {quickAmounts.map((q) => (
                      <div className="quick-chip" key={q} onClick={() => setAmount(String(q))}>
                        {q}
                      </div>
                    ))}
                  </div>

                  <div className="method-label">إسكرين إثبات التحويل</div>
                  <div
                    className="screenshot-upload"
                    role="button"
                    tabIndex={0}
                    onClick={handlePickScreenshot}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handlePickScreenshot();
                      }
                    }}
                  >
                    {screenshotPreview ? (
                      <img src={screenshotPreview} alt="إثبات التحويل" className="screenshot-preview" />
                    ) : (
                      <div className="screenshot-placeholder">
                        <Camera size={22} />
                        دوس لرفع صورة الإسكرين
                      </div>
                    )}
                  </div>

                  <button className="sheet-submit" onClick={submit} disabled={busy}>
                    {busy ? <Loader2 size={17} className="spin" /> : <ArrowDownToLine size={17} />}
                    {busy ? "جاري الإرسال..." : "إرسال طلب الشحن"}
                  </button>
                </>
              )
            ) : step === "method" ? (
              <>
                <div className="method-label">اختار وسيلة الدفع</div>
                <div className="method-row">
                  {PAYMENT_METHODS.map((m) => (
                    <div
                      key={m.key}
                      className={`method-card ${method === m.key ? "on" : ""}`}
                      onClick={() => setMethod(m.key)}
                      style={method === m.key ? { borderColor: m.color } : {}}
                    >
                      <span className="method-mono" style={{ background: m.bg, color: m.color }}>
                        <m.Logo size={16} />
                      </span>
                      {m.label}
                    </div>
                  ))}
                </div>
                <div className="amount-input-wrap">
                  <Phone size={16} color="#5E6E8C" />
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="رقم الموبايل المرتبط بالمحفظة"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    style={{ fontFamily: "Cairo, sans-serif", fontSize: 15, fontWeight: 600 }}
                  />
                </div>
                <div className="method-hint">
                  هنحوّل المبلغ على الرقم ده بعد ما نراجع طلب السحب.
                </div>
                <button className="sheet-submit" onClick={goToAmount}>
                  متابعة
                </button>
              </>
            ) : (
              <>
                <div
                  className="chosen-method-pill"
                  onClick={() => !busy && setStep("method")}
                >
                  <span
                    className="method-mono"
                    style={{
                      background: PAYMENT_METHODS.find((m) => m.key === method)?.bg,
                      color: PAYMENT_METHODS.find((m) => m.key === method)?.color,
                    }}
                  >
                    {(() => {
                      const Logo = PAYMENT_METHODS.find((m) => m.key === method)?.Logo;
                      return Logo ? <Logo size={16} /> : null;
                    })()}
                  </span>
                  <span>
                    {PAYMENT_METHODS.find((m) => m.key === method)?.label} — {reference}
                  </span>
                  <span className="chosen-method-edit">تغيير</span>
                </div>
                <div className="amount-input-wrap">
                  <input
                    type="number"
                    inputMode="decimal"
                    autoFocus
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <span>جنيه</span>
                </div>
                <div className="quick-row">
                  {quickAmounts.map((q) => (
                    <div className="quick-chip" key={q} onClick={() => setAmount(String(q))}>
                      {q}
                    </div>
                  ))}
                </div>
                <button className="sheet-submit" onClick={submit} disabled={busy}>
                  {busy ? <Loader2 size={17} className="spin" /> : <ArrowUpFromLine size={17} />}
                  {busy ? "جاري التنفيذ..." : "تأكيد السحب"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className={`wallet-toast ${toast.type}`}>
          {toast.type === "success" ? <CheckCircle2 size={17} /> : <X size={17} />}
          {toast.text}
        </div>
      )}
    </div>
  );
}
