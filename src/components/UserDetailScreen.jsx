import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  User,
  Phone,
  Calendar,
  Wallet,
  PlusCircle,
  MinusCircle,
  Loader2,
  X,
  CheckCircle2,
  Package,
  Truck,
  ShieldCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCcw,
  Settings2,
  MapPin,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

function formatEGP(n) {
  const v = Number(n || 0);
  return v.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ROLE_META = {
  customer: { label: "عميل", color: "#4DA3FF", bg: "#102538", icon: Package },
  courier: { label: "دليفري", color: "#B18CFF", bg: "#241A3D", icon: Truck },
  admin: { label: "أدمن", color: "#F2B705", bg: "#3A2F10", icon: ShieldCheck },
};

const STATUS_META = {
  new: { label: "جديد", color: "#FFC93C", bg: "#3A2F10" },
  claimed: { label: "مأخوذ", color: "#4DA3FF", bg: "#102538" },
  on_the_way: { label: "في الطريق", color: "#B18CFF", bg: "#241A3D" },
  delivered: { label: "تم التسليم", color: "#35D68C", bg: "#0F2E24" },
  cancelled: { label: "ملغي", color: "#FF6B6B", bg: "#3A1616" },
};

const TX_META = {
  topup: { icon: ArrowDownToLine, color: "#35D68C", bg: "#0F2E24", sign: "+", label: "شحن محفظة" },
  withdraw: { icon: ArrowUpFromLine, color: "#FF6B6B", bg: "#3A1616", sign: "-", label: "سحب" },
  order_fee: { icon: Truck, color: "#FF6B6B", bg: "#3A1616", sign: "-", label: "رسوم أوردر" },
  refund: { icon: RotateCcw, color: "#F2B705", bg: "#3A2F10", sign: "+", label: "استرجاع رسوم" },
  admin_adjustment: { icon: Settings2, color: "#F2B705", bg: "#3A2F10", sign: "", label: "تعديل أدمن" },
};

export default function UserDetailScreen({ person, onBack, onChanged }) {
  const [balance, setBalance] = useState(Number(person?.wallet_balance || 0));
  const [txs, setTxs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(null); // null | 'add' | 'deduct'
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const isCourier = person?.role === "courier";
  const roleMeta = ROLE_META[person?.role] || ROLE_META.customer;
  const RoleIcon = roleMeta.icon;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchAll = useCallback(async () => {
    if (!person?.id) return;
    const tasks = [
      supabase
        .from("orders")
        .select(
          "*, customer:profiles!orders_customer_id_fkey(full_name,phone), courier:profiles!orders_courier_id_fkey(full_name,phone)"
        )
        .or(`customer_id.eq.${person.id},courier_id.eq.${person.id}`)
        .order("created_at", { ascending: false }),
    ];
    if (isCourier) {
      tasks.push(
        supabase
          .from("profiles")
          .select("wallet_balance")
          .eq("id", person.id)
          .single(),
        supabase
          .from("wallet_transactions")
          .select("*, admin:profiles!wallet_transactions_admin_id_fkey(full_name)")
          .eq("user_id", person.id)
          .order("created_at", { ascending: false })
          .limit(50)
      );
    }
    const results = await Promise.all(tasks);
    const { data: ordersData } = results[0];
    setOrders(ordersData || []);
    if (isCourier) {
      const { data: p } = results[1];
      const { data: t } = results[2];
      if (p) setBalance(Number(p.wallet_balance || 0));
      setTxs(t || []);
    }
  }, [person?.id, isCourier]);

  useEffect(() => {
    setLoading(true);
    fetchAll().then(() => setLoading(false));
  }, [fetchAll]);

  const openMode = (m) => {
    setMode(m);
    setAmount("");
    setReason("");
  };

  const closeSheet = () => {
    setMode(null);
    setAmount("");
    setReason("");
  };

  const submitAdjust = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      setToast({ type: "error", text: "اكتب مبلغ صحيح الأول" });
      return;
    }
    if (!reason.trim()) {
      setToast({ type: "error", text: "لازم تكتب سبب التعديل" });
      return;
    }
    if (mode === "deduct" && val > balance) {
      setToast({ type: "error", text: "المبلغ ده أكبر من رصيد الدليفري الحالي" });
      return;
    }
    setBusy(true);
    const signedAmount = mode === "add" ? val : -val;
    const { data, error } = await supabase.rpc("admin_adjust_wallet", {
      p_user_id: person.id,
      p_amount: signedAmount,
      p_note: reason.trim(),
    });
    setBusy(false);

    if (error) {
      setToast({ type: "error", text: error.message || "حصل خطأ، حاول تاني" });
      return;
    }
    setToast({
      type: "success",
      text: mode === "add" ? "تم إضافة الرصيد بنجاح" : "تم خصم الرصيد بنجاح",
    });
    setBalance(Number(data));
    closeSheet();
    fetchAll();
    onChanged && onChanged();
  };

  const linkedOrdersLabel = useMemo(() => {
    if (person?.role === "customer") return "الأوردرات اللي طلبها";
    if (person?.role === "courier") return "الأوردرات اللي أخدها";
    return "الأوردرات المرتبطة";
  }, [person?.role]);

  return (
    <div className="ud-root" dir="rtl">
      <style>{`
        .ud-root {
          --navy: #0B1526; --navy-2: #101E33; --navy-3: #16263F; --navy-line: #22344F;
          --gold: #F2B705; --gold-2: #E8A33D; --white: #FFFFFF;
          --muted: #93A0B8; --muted-2: #5E6E8C; --danger: #FF6B6B; --danger-bg: #3A1616;
          font-family: 'Cairo', sans-serif;
          color: var(--white);
          width: 100%;
          box-sizing: border-box;
          position: relative;
        }
        .ud-root * { box-sizing: border-box; }

        .ud-header {
          display: flex; align-items: center; gap: 10px;
          padding: 4px 0 18px;
        }
        .ud-back {
          width: 38px; height: 38px; border-radius: 12px;
          background: var(--navy-2); border: 1px solid var(--navy-line);
          color: var(--muted); display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0;
        }
        .ud-back:active { transform: scale(0.94); }
        .ud-header-title { font-family: 'Changa', sans-serif; font-size: 18px; font-weight: 700; }
        .ud-header-sub { font-size: 11.5px; color: var(--muted); font-weight: 600; margin-top: 1px; }

        .ud-profile-card {
          background: var(--navy-2); border: 1px solid var(--navy-line); border-radius: 18px;
          padding: 18px; margin-bottom: 16px; display: flex; align-items: center; gap: 14px;
        }
        .ud-avatar {
          width: 50px; height: 50px; border-radius: 14px; background: var(--navy-3);
          display: flex; align-items: center; justify-content: center; color: var(--gold-2); flex-shrink: 0;
        }
        .ud-name { font-size: 16px; font-weight: 800; }
        .ud-meta-row { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); margin-top: 5px; }
        .ud-role-badge {
          font-size: 10.5px; font-weight: 800; padding: 4px 9px; border-radius: 999px;
          display: inline-flex; align-items: center; gap: 4px; margin-top: 8px;
        }

        .ud-section-title {
          font-size: 13px; font-weight: 800; color: var(--muted); margin: 22px 0 10px;
          display: flex; align-items: center; gap: 6px;
        }

        .ud-balance-card {
          background: linear-gradient(135deg, #16263F 0%, #101E33 100%);
          border: 1px solid var(--navy-line); border-radius: 18px;
          padding: 20px; margin-bottom: 14px; position: relative; overflow: hidden;
        }
        .ud-balance-icon-row { display: flex; align-items: center; gap: 8px; color: var(--gold-2); font-size: 12.5px; font-weight: 700; margin-bottom: 8px; }
        .ud-balance-amount { font-family: 'Changa', sans-serif; font-size: 30px; font-weight: 700; display: flex; align-items: baseline; gap: 8px; }
        .ud-balance-amount span { font-size: 13px; color: var(--muted); font-weight: 600; }

        .ud-wallet-actions { display: flex; gap: 10px; margin-bottom: 18px; }
        .ud-wallet-btn {
          flex: 1; border-radius: 14px; padding: 12px 10px; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 13px;
        }
        .ud-wallet-btn:active { transform: scale(0.96); }
        .ud-wallet-btn.add { background: linear-gradient(135deg, #35D68C, #17A876); color: #06231A; }
        .ud-wallet-btn.deduct { background: var(--navy-2); border: 1px solid var(--danger); color: var(--danger); }

        .ud-tx-row {
          display: flex; align-items: center; gap: 10px;
          background: var(--navy-2); border: 1px solid var(--navy-line); border-radius: 14px;
          padding: 12px 14px; margin-bottom: 9px;
        }
        .ud-tx-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ud-tx-info { flex: 1; min-width: 0; }
        .ud-tx-label { font-size: 12.5px; font-weight: 700; }
        .ud-tx-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
        .ud-tx-amount { font-weight: 800; font-size: 13px; white-space: nowrap; }

        .ud-order-card {
          background: var(--navy-2); border: 1px solid var(--navy-line); border-radius: 16px;
          padding: 14px; margin-bottom: 10px;
        }
        .ud-order-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
        .ud-order-desc { font-size: 13.5px; font-weight: 700; line-height: 1.6; }
        .ud-badge {
          display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px;
          font-size: 11px; font-weight: 800; white-space: nowrap; flex-shrink: 0;
        }
        .ud-order-meta { font-size: 12px; color: var(--muted); display: flex; flex-direction: column; gap: 5px; }
        .ud-order-meta-row { display: flex; align-items: center; gap: 7px; }
        .ud-order-meta-row svg { flex-shrink: 0; color: var(--gold-2); }
        .ud-order-other {
          margin-top: 8px; font-size: 11.5px; color: var(--muted);
          background: var(--navy-3); border: 1px solid var(--navy-line); border-radius: 10px; padding: 6px 10px; display: inline-block;
        }
        .ud-order-other b { color: var(--white); }

        .ud-empty { text-align: center; color: var(--muted); padding: 30px 20px; font-size: 13px; }
        .ud-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 70px 24px; color: var(--muted); }
        .ud-spin { animation: udspin 0.9s linear infinite; }
        @keyframes udspin { to { transform: rotate(360deg); } }

        .ud-sheet-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 50;
          display: flex; align-items: flex-end; justify-content: center;
        }
        .ud-sheet {
          width: 100%; max-width: 430px; background: var(--navy-2);
          border: 1px solid var(--navy-line); border-radius: 22px 22px 0 0;
          padding: 20px; animation: udslideup 0.25s ease both;
        }
        @keyframes udslideup { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .ud-sheet-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .ud-sheet-title { font-family: 'Changa', sans-serif; font-size: 16.5px; font-weight: 700; }
        .ud-sheet-close {
          width: 32px; height: 32px; border-radius: 10px; background: var(--navy-3); border: 1px solid var(--navy-line);
          color: var(--muted); display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .ud-field-label { font-size: 12px; color: var(--muted); font-weight: 700; margin: 12px 0 6px; }
        .ud-input-wrap {
          display: flex; align-items: center; gap: 8px; background: var(--navy-3);
          border: 1px solid var(--navy-line); border-radius: 12px; padding: 12px 14px;
        }
        .ud-input-wrap input, .ud-input-wrap textarea {
          flex: 1; background: transparent; border: none; outline: none; color: var(--white);
          font-family: 'Cairo', sans-serif; font-size: 14.5px; resize: none;
        }
        .ud-sheet-submit {
          width: 100%; margin-top: 18px; border: none; border-radius: 14px; padding: 14px;
          font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 14.5px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .ud-sheet-submit.add { background: linear-gradient(135deg, #35D68C, #17A876); color: #06231A; }
        .ud-sheet-submit.deduct { background: linear-gradient(135deg, var(--danger), #E64C4C); color: #fff; }
        .ud-sheet-submit:disabled { opacity: 0.6; }

        .ud-toast {
          position: fixed; left: 20px; right: 20px; bottom: 22px; max-width: 400px; margin: 0 auto;
          padding: 13px 16px; border-radius: 14px; font-weight: 700; font-size: 13.5px;
          display: flex; align-items: center; gap: 8px; z-index: 60;
          box-shadow: 0 10px 30px -10px rgba(0,0,0,0.6);
        }
        .ud-toast.success { background: #0F2E24; color: #35D68C; border: 1px solid #35D68C; }
        .ud-toast.error { background: #3A1616; color: #FF6B6B; border: 1px solid #FF6B6B; }
      `}</style>

      <div className="ud-header">
        <button className="ud-back" onClick={onBack}>
          <ChevronRight size={19} />
        </button>
        <div>
          <div className="ud-header-title">تفاصيل المستخدم</div>
          <div className="ud-header-sub">البيانات، المحفظة، والأوردرات</div>
        </div>
      </div>

      {loading ? (
        <div className="ud-loading">
          <Loader2 size={26} className="ud-spin" />
          بنحمّل بيانات المستخدم...
        </div>
      ) : (
        <>
          <div className="ud-profile-card">
            <div className="ud-avatar">
              <User size={22} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="ud-name">{person.full_name}</div>
              <div className="ud-meta-row">
                <Phone size={13} /> {person.phone}
              </div>
              {person.area && (
                <div className="ud-meta-row">
                  <MapPin size={13} /> {person.area}
                </div>
              )}
              <div className="ud-meta-row">
                <Calendar size={13} /> اتسجل {formatDateTime(person.created_at)}
              </div>
              <span className="ud-role-badge" style={{ background: roleMeta.bg, color: roleMeta.color }}>
                <RoleIcon size={12} /> {roleMeta.label}
              </span>
            </div>
          </div>

          {isCourier && (
            <>
              <div className="ud-balance-card">
                <div className="ud-balance-icon-row">
                  <Wallet size={15} /> رصيد المحفظة
                </div>
                <div className="ud-balance-amount">
                  {formatEGP(balance)} <span>جنيه</span>
                </div>
              </div>

              <div className="ud-wallet-actions">
                <button className="ud-wallet-btn add" onClick={() => openMode("add")}>
                  <PlusCircle size={17} /> إضافة رصيد
                </button>
                <button className="ud-wallet-btn deduct" onClick={() => openMode("deduct")}>
                  <MinusCircle size={17} /> خصم رصيد
                </button>
              </div>

              <div className="ud-section-title">
                <Wallet size={14} /> حركات المحفظة
              </div>
              {txs.length === 0 ? (
                <div className="ud-empty">لسه مفيش أي حركة في المحفظة.</div>
              ) : (
                txs.map((tx) => {
                  const meta = TX_META[tx.type] || TX_META.topup;
                  const Icon = meta.icon;
                  const isAdj = tx.type === "admin_adjustment";
                  const sign = isAdj ? (Number(tx.amount) > 0 ? "+" : "-") : meta.sign;
                  return (
                    <div className="ud-tx-row" key={tx.id}>
                      <div className="ud-tx-icon" style={{ background: meta.bg, color: meta.color }}>
                        <Icon size={16} />
                      </div>
                      <div className="ud-tx-info">
                        <div className="ud-tx-label">{isAdj ? "تعديل أدمن" : meta.label}</div>
                        <div className="ud-tx-sub">
                          {tx.note ? tx.note + " — " : ""}
                          {isAdj && tx.admin?.full_name ? `بواسطة ${tx.admin.full_name} — ` : ""}
                          {formatDateTime(tx.created_at)}
                        </div>
                      </div>
                      <div className="ud-tx-amount" style={{ color: meta.color }}>
                        {sign} {formatEGP(Math.abs(tx.amount))}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          <div className="ud-section-title">
            <Package size={14} /> {linkedOrdersLabel}
          </div>
          {orders.length === 0 ? (
            <div className="ud-empty">مفيش أوردرات مرتبطة بالمستخدم ده.</div>
          ) : (
            orders.map((o) => {
              const meta = STATUS_META[o.status] || STATUS_META.new;
              const otherParty =
                person.role === "customer"
                  ? o.courier
                    ? `الدليفري: ${o.courier.full_name}`
                    : null
                  : o.customer
                  ? `العميل: ${o.customer.full_name}`
                  : null;
              return (
                <div className="ud-order-card" key={o.id}>
                  <div className="ud-order-top">
                    <div className="ud-order-desc">{o.description}</div>
                    <span className="ud-badge" style={{ background: meta.bg, color: meta.color }}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="ud-order-meta">
                    <div className="ud-order-meta-row">
                      <MapPin size={13} />
                      <span>{o.area ? `${o.area} — ${o.location}` : o.location}</span>
                    </div>
                  </div>
                  {otherParty && <div className="ud-order-other">{otherParty}</div>}
                </div>
              );
            })
          )}
        </>
      )}

      {mode && (
        <div className="ud-sheet-overlay" onClick={() => !busy && closeSheet()}>
          <div className="ud-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ud-sheet-top">
              <div className="ud-sheet-title">
                {mode === "add" ? "إضافة رصيد" : "خصم رصيد"} — {person.full_name}
              </div>
              <button className="ud-sheet-close" onClick={() => !busy && closeSheet()}>
                <X size={15} />
              </button>
            </div>

            <div className="ud-field-label">المبلغ (جنيه)</div>
            <div className="ud-input-wrap">
              <input
                type="number"
                inputMode="decimal"
                autoFocus
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="ud-field-label">سبب التعديل (إجباري)</div>
            <div className="ud-input-wrap">
              <textarea
                rows={2}
                placeholder={mode === "add" ? "مثلاً: تعويض عن مشكلة في أوردر" : "مثلاً: خصم غرامة تأخير"}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <button
              className={`ud-sheet-submit ${mode}`}
              onClick={submitAdjust}
              disabled={busy}
            >
              {busy ? (
                <Loader2 size={17} className="ud-spin" />
              ) : mode === "add" ? (
                <PlusCircle size={17} />
              ) : (
                <MinusCircle size={17} />
              )}
              {busy ? "جاري التنفيذ..." : mode === "add" ? "تأكيد الإضافة" : "تأكيد الخصم"}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`ud-toast ${toast.type}`}>
          {toast.type === "success" ? <CheckCircle2 size={17} /> : <X size={17} />}
          {toast.text}
        </div>
      )}
    </div>
  );
}
