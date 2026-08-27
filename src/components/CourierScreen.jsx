import React, { useState, useEffect, useCallback } from "react";
import {
  Package,
  MapPin,
  Phone,
  Truck,
  CheckCircle2,
  X,
  ChevronLeft,
  Inbox,
  LogOut,
  Loader2,
  Wallet,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import WalletScreen from "./WalletScreen.jsx";

const LOGO_ICON = "/seka-icon.png";

// عشان نحسب عدد الأوردرات اللي اتسلمت "النهاردة" فقط
function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// مراحل مسار الأوردر بعد ما ياخده الدليفري
const ROUTE_STAGES = [
  { key: "claimed", label: "مأخوذ", x: 34, y: 92 },
  { key: "on_the_way", label: "في الطريق", x: 230, y: 34 },
  { key: "delivered", label: "تم التسليم", x: 426, y: 78 },
];

export default function CourierScreen({ profile, onLogout }) {
  const [available, setAvailable] = useState([]);
  const [current, setCurrent] = useState(null); // صف الأوردر كامل من جدول orders
  const [tab, setTab] = useState("available"); // 'available' | 'current'
  const [deliveredToday, setDeliveredToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [banner, setBanner] = useState(null); // { type: 'success'|'cancel', text }
  const [walletBalance, setWalletBalance] = useState(0);
  const [showWallet, setShowWallet] = useState(false);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(t);
  }, [banner]);

  // الأوردرات المتاحة (status = 'new') اللي لسه محدش خدها
  const fetchAvailable = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "new")
      .order("created_at", { ascending: true });
    if (!error) setAvailable(data || []);
  }, []);

  // الأوردر الحالي بتاع الدليفري ده (لو معاه واحد شغال)
  const fetchCurrent = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("courier_id", profile.id)
      .in("status", ["claimed", "on_the_way"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) setCurrent(data || null);
  }, [profile?.id]);

  // عدد الأوردرات اللي سلمها الدليفري النهاردة
  const fetchDeliveredToday = useCallback(async () => {
    if (!profile?.id) return;
    const { count, error } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("courier_id", profile.id)
      .eq("status", "delivered")
      .gte("updated_at", startOfTodayISO());
    if (!error) setDeliveredToday(count || 0);
  }, [profile?.id]);

  // رصيد محفظة الدليفري (بيتخصم منه 2 جنيه كل ما ياخد أوردر)
  const fetchWalletBalance = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", profile.id)
      .single();
    if (!error) setWalletBalance(data?.wallet_balance || 0);
  }, [profile?.id]);

  // تحميل أول دفعة بيانات
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!profile?.id) return;
    let ignore = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetchAvailable(),
      fetchCurrent(),
      fetchDeliveredToday(),
      fetchWalletBalance(),
    ])
      .catch((err) => {
        // أي استثناء هنا (شبكة/إعدادات Supabase غلط/إلخ) كان بيوقف الكود
        // قبل ما يقفل التحميل، فتفضل الشاشة "بتحقل" على طول من غير أي
        // رسالة. دلوقتي بنمسكه ونوريه للمستخدم بدل السكوت.
        console.error("فشل تحميل بيانات شاشة الدليفري:", err);
        if (!ignore) setLoadError(err?.message || "حصل خطأ غير متوقع");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [profile?.id, fetchAvailable, fetchCurrent, fetchDeliveredToday, fetchWalletBalance]);

  // الاستماع اللايف لأي تغيير في جدول الأوردرات (Realtime بيحترم RLS تلقائي:
  // الدليفري هيستقبل بس الأوردرات الجديدة المتاحة + أوردره هو)
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`courier-orders-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setAvailable((prev) => prev.filter((o) => o.id !== payload.old.id));
            setCurrent((prev) => (prev?.id === payload.old.id ? null : prev));
            return;
          }

          const updated = payload.new;
          if (!updated) return;

          // تحديث قائمة "المتاح" — لو رجع 'new' وبدون دليفري يفضل/يترجع في القائمة
          setAvailable((prev) => {
            const exists = prev.some((o) => o.id === updated.id);
            if (updated.status === "new" && !updated.courier_id) {
              if (exists) return prev.map((o) => (o.id === updated.id ? updated : o));
              return [...prev, updated].sort(
                (a, b) => new Date(a.created_at) - new Date(b.created_at)
              );
            }
            return exists ? prev.filter((o) => o.id !== updated.id) : prev;
          });

          // تتبع أوردر الدليفري الحالي
          if (updated.courier_id === profile.id) {
            if (updated.status === "claimed" || updated.status === "on_the_way") {
              setCurrent(updated);
            } else {
              // اتسلم أو رجع كـ 'new' من جهاز/تبويب تاني لنفس الدليفري
              setCurrent((prev) => (prev?.id === updated.id ? null : prev));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const claimOrder = async (order) => {
    if (current || claimingId) return;
    setClaimingId(order.id);
    const { data, error } = await supabase
      .from("orders")
      .update({ courier_id: profile.id, status: "claimed" })
      .eq("id", order.id)
      .eq("status", "new")
      .is("courier_id", null)
      .select()
      .maybeSingle();
    setClaimingId(null);

    if (error || !data) {
      // لو السبب إن رصيد المحفظة مش كافي، وريه رسالة مخصوصة وافتحله المحفظة
      if (error?.message?.includes("رصيد المحفظة")) {
        setBanner({ type: "cancel", text: `رصيدك في المحفظة مش كافي — اشحن ${2} جنيه على الأقل` });
        setShowWallet(true);
        return;
      }
      // غير كده، على الأغلب حد تاني خد الأوردر ده قبلك
      setBanner({ type: "cancel", text: "الأوردر ده اتاخد بالفعل، جرب واحد تاني" });
      fetchAvailable();
      return;
    }
    setAvailable((prev) => prev.filter((o) => o.id !== order.id));
    setCurrent(data);
    setTab("current");
    fetchWalletBalance();
  };

  const advanceStatus = async () => {
    if (!current || advancing) return;
    const nextStatus = current.status === "claimed" ? "on_the_way" : "delivered";
    setAdvancing(true);
    const { data, error } = await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", current.id)
      .eq("courier_id", profile.id)
      .select()
      .single();
    setAdvancing(false);

    if (error) {
      setBanner({ type: "cancel", text: "حصل خطأ، حاول تاني" });
      return;
    }

    setCurrent(data);
    if (nextStatus === "delivered") {
      setDeliveredToday((n) => n + 1);
      setBanner({ type: "success", text: "تم تسليم الأوردر بنجاح 🎉" });
      setTimeout(() => {
        setCurrent(null);
        setTab("available");
      }, 1400);
    }
  };

  // الدليفري بيسيب الأوردر يرجع "متاح" تاني عشان دليفري تاني ياخده
  const cancelOrder = async () => {
    if (!current) return;
    const { error } = await supabase
      .from("orders")
      .update({ courier_id: null, status: "new" })
      .eq("id", current.id)
      .eq("courier_id", profile.id);

    if (error) {
      setBanner({ type: "cancel", text: "معرفناش نلغي، حاول تاني" });
      return;
    }
    setBanner({ type: "cancel", text: "تم إلغاء الأوردر" });
    setCurrent(null);
    setTab("available");
    fetchAvailable();
    fetchWalletBalance();
  };

  if (showWallet) {
    return (
      <WalletScreen
        profile={profile}
        onBack={() => setShowWallet(false)}
        onBalanceChange={setWalletBalance}
      />
    );
  }

  return (
    <div className="seka-root" dir="rtl">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Changa:wght@500;600;700;800&family=Cairo:wght@400;500;600;700;900&display=swap');

        .seka-root {
          --navy: #0B1526;
          --navy-2: #101E33;
          --navy-3: #16263F;
          --navy-line: #22344F;
          --gold: #F2B705;
          --gold-2: #E8A33D;
          --white: #FFFFFF;
          --muted: #93A0B8;
          --muted-2: #5E6E8C;
          --status-new: #FFC93C; --status-new-bg: #3A2F10;
          --status-claimed: #4DA3FF; --status-claimed-bg: #102538;
          --status-way: #B18CFF; --status-way-bg: #241A3D;
          --status-done: #35D68C; --status-done-bg: #0F2E24;
          --status-cancel: #FF6B6B; --status-cancel-bg: #3A1616;

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
        .seka-root * { box-sizing: border-box; }

        /* -------- header -------- */
        .seka-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 22px 20px 16px;
          border-bottom: 1px solid var(--navy-line);
        }
        .brand { display: flex; align-items: center; gap: 10px; }
        .brand-mark {
          width: 42px; height: 42px; border-radius: 11px;
          object-fit: contain; background: var(--navy);
          box-shadow: 0 6px 18px -6px rgba(242,183,5,0.35);
        }
        .brand-name { font-family: 'Changa', sans-serif; font-size: 20px; font-weight: 700; letter-spacing: 0.3px; }
        .brand-role { font-size: 11px; color: var(--gold-2); font-weight: 600; margin-top: 1px; }
        .stat-pill {
          background: var(--navy-2); border: 1px solid var(--navy-line);
          border-radius: 999px; padding: 7px 14px;
          display: flex; align-items: baseline; gap: 6px;
        }
        .stat-num { font-family: 'Cairo', sans-serif; font-weight: 900; font-size: 16px; color: var(--gold); }
        .stat-label { font-size: 11px; color: var(--muted); font-weight: 600; }
        .header-actions { display: flex; align-items: center; gap: 8px; }
        .btn-logout {
          width: 38px; height: 38px; border-radius: 12px;
          background: var(--navy-2); border: 1px solid var(--navy-line);
          color: var(--muted); display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0;
        }
        .btn-logout:active { transform: scale(0.94); }
        .wallet-pill {
          background: var(--navy-2); border: 1px solid var(--gold-2);
          border-radius: 999px; padding: 7px 12px 7px 8px;
          display: flex; align-items: center; gap: 6px; cursor: pointer;
          flex-shrink: 0; transition: transform 0.15s ease;
        }
        .wallet-pill:active { transform: scale(0.95); }
        .wallet-pill-icon {
          width: 22px; height: 22px; border-radius: 999px;
          background: linear-gradient(135deg, var(--gold), var(--gold-2));
          color: var(--navy); display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .wallet-pill-num { font-family: 'Cairo', sans-serif; font-weight: 900; font-size: 13.5px; color: var(--gold); white-space: nowrap; }

        /* -------- loading -------- */
        .loading-wrap {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; padding: 90px 24px; color: var(--muted); text-align: center;
        }
        .spin { animation: spin 0.9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .retry-btn {
          margin-top: 4px; padding: 10px 22px; border-radius: 12px; border: none;
          background: var(--gold, #F2B705); color: var(--navy, #0B1526);
          font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 14px; cursor: pointer;
        }

        /* -------- tabs -------- */
        .seka-tabs {
          display: flex; gap: 6px; margin: 16px 20px 4px;
          background: var(--navy-2); border: 1px solid var(--navy-line);
          border-radius: 14px; padding: 5px;
        }
        .seka-tab {
          flex: 1; text-align: center; padding: 10px 8px; border-radius: 10px;
          font-family: 'Cairo', sans-serif; font-weight: 700; font-size: 13.5px;
          color: var(--muted); background: transparent; border: none; cursor: pointer;
          transition: all 0.25s ease; display: flex; align-items: center; justify-content: center; gap: 6px;
          position: relative;
        }
        .seka-tab.on {
          background: linear-gradient(135deg, var(--gold), var(--gold-2));
          color: var(--navy);
          box-shadow: 0 6px 16px -6px rgba(242,183,5,0.5);
        }
        .badge-count {
          background: var(--navy); color: var(--gold);
          font-size: 10.5px; font-weight: 800; border-radius: 999px;
          padding: 1px 7px; min-width: 18px;
        }
        .seka-tab.on .badge-count { background: rgba(11,21,38,0.18); color: var(--navy); }

        .seka-body { padding: 18px 20px 90px; }

        /* -------- order card (available) -------- */
        .order-card {
          background: var(--navy-2); border: 1px solid var(--navy-line);
          border-radius: 16px; padding: 16px; margin-bottom: 12px;
          animation: rise 0.4s ease both;
        }
        @keyframes rise { from { opacity:0; transform: translateY(8px);} to {opacity:1; transform: translateY(0);} }
        .order-desc { font-size: 15.5px; font-weight: 700; line-height: 1.6; margin-bottom: 10px; }
        .order-meta { font-size: 13px; color: var(--muted); display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .order-meta-row { display: flex; align-items: center; gap: 7px; }
        .order-meta-row svg { flex-shrink: 0; color: var(--gold-2); }

        .btn-claim {
          width: 100%; border: none; border-radius: 12px; padding: 12px;
          font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 14.5px;
          background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: var(--navy);
          display: flex; align-items: center; justify-content: center; gap: 8px;
          cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease;
          box-shadow: 0 8px 20px -8px rgba(242,183,5,0.55);
        }
        .btn-claim:active { transform: scale(0.97); }

        /* -------- empty state -------- */
        .empty-wrap {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          padding: 70px 24px; color: var(--muted);
        }
        .empty-icon {
          width: 64px; height: 64px; border-radius: 18px; background: var(--navy-2);
          border: 1px solid var(--navy-line); display: flex; align-items: center; justify-content: center;
          margin-bottom: 16px; color: var(--gold-2);
        }
        .empty-title { font-family: 'Changa', sans-serif; font-size: 17px; color: var(--white); margin-bottom: 6px; }
        .empty-sub { font-size: 13px; line-height: 1.8; max-width: 260px; }
        .empty-cta {
          margin-top: 18px; background: transparent; border: 1px solid var(--gold-2);
          color: var(--gold-2); font-weight: 700; font-size: 13px; padding: 9px 18px;
          border-radius: 10px; cursor: pointer; display:flex; align-items:center; gap:6px;
        }

        /* -------- current order -------- */
        .current-card {
          background: var(--navy-2); border: 1px solid var(--navy-line);
          border-radius: 18px; padding: 18px; margin-bottom: 18px;
        }
        .current-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
        .current-desc { font-size: 16px; font-weight: 700; line-height: 1.6; }
        .status-badge {
          display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
          border-radius: 999px; font-size: 12px; font-weight: 800; white-space: nowrap;
        }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; }

        .route-panel {
          background: var(--navy-3); border: 1px solid var(--navy-line);
          border-radius: 16px; padding: 16px 14px 10px; margin-bottom: 18px;
        }
        .route-panel-title { font-size: 12px; color: var(--muted); font-weight: 700; margin-bottom: 6px; }
        .route-labels { display: flex; justify-content: space-between; margin-top: 4px; padding: 0 4px; }
        .route-labels span { font-size: 11px; font-weight: 700; color: var(--muted-2); }
        .route-labels span.active { color: var(--gold); }

        .action-row { display: flex; gap: 10px; }
        .btn-primary-action {
          flex: 1; border: none; border-radius: 12px; padding: 13px;
          font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 14px;
          background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: var(--navy);
          display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;
        }
        .btn-cancel-action {
          border: 1px solid var(--status-cancel); background: var(--status-cancel-bg); color: var(--status-cancel);
          border-radius: 12px; padding: 13px 16px; font-weight: 800; font-size: 14px;
          display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;
          font-family: 'Cairo', sans-serif;
        }
        .btn-primary-action:active, .btn-cancel-action:active { transform: scale(0.97); }

        /* -------- toast banner -------- */
        .seka-banner {
          position: absolute; left: 20px; right: 20px; bottom: 22px;
          padding: 13px 16px; border-radius: 14px; font-weight: 700; font-size: 13.5px;
          display: flex; align-items: center; gap: 8px; z-index: 20;
          animation: pop 0.35s ease both;
          box-shadow: 0 10px 30px -10px rgba(0,0,0,0.6);
        }
        .seka-banner.success { background: var(--status-done-bg); color: var(--status-done); border: 1px solid var(--status-done); }
        .seka-banner.cancel { background: var(--status-cancel-bg); color: var(--status-cancel); border: 1px solid var(--status-cancel); }
        @keyframes pop { from { opacity: 0; transform: translateY(10px) scale(0.96);} to { opacity: 1; transform: translateY(0) scale(1);} }
      `}</style>

      {/* Header */}
      <div className="seka-header">
        <div className="brand">
          <img src={LOGO_ICON} alt="سكة" className="brand-mark" />
          <div>
            <div className="brand-name">سكة</div>
            <div className="brand-role">
              {profile?.full_name ? `أهلاً يا ${profile.full_name}` : "واجهة الدليفري"}
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="wallet-pill"
            onClick={() => setShowWallet(true)}
            title="المحفظة"
          >
            <span className="wallet-pill-icon">
              <Wallet size={12.5} />
            </span>
            <span className="wallet-pill-num">{Number(walletBalance).toFixed(0)} ج.م</span>
          </button>
          <div className="stat-pill">
            <span className="stat-num">{deliveredToday}</span>
            <span className="stat-label">تسليم النهاردة</span>
          </div>
          {onLogout && (
            <button className="btn-logout" onClick={onLogout} title="تسجيل خروج">
              <LogOut size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="seka-tabs">
        <button
          className={`seka-tab ${tab === "available" ? "on" : ""}`}
          onClick={() => setTab("available")}
        >
          الأوردرات المتاحة
          <span className="badge-count">{available.length}</span>
        </button>
        <button
          className={`seka-tab ${tab === "current" ? "on" : ""}`}
          onClick={() => setTab("current")}
        >
          أوردري الحالي
          {current && <span className="badge-count">1</span>}
        </button>
      </div>

      <div className="seka-body">
        {loading ? (
          <div className="loading-wrap">
            <Loader2 size={28} className="spin" />
            <div>بنحمّل الأوردرات...</div>
          </div>
        ) : loadError ? (
          <div className="loading-wrap">
            <div style={{ color: "var(--danger, #FF6B6B)" }}>
              حصل خطأ أثناء تحميل البيانات: {loadError}
            </div>
            <button
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                Promise.all([
                  fetchAvailable(),
                  fetchCurrent(),
                  fetchDeliveredToday(),
                  fetchWalletBalance(),
                ])
                  .catch((err) => setLoadError(err?.message || "حصل خطأ غير متوقع"))
                  .finally(() => setLoading(false));
              }}
              className="retry-btn"
            >
              حاول تاني
            </button>
          </div>
        ) : (
          <>
            {tab === "available" && (
              <AvailableList
                orders={available}
                onClaim={claimOrder}
                disabled={!!current}
                claimingId={claimingId}
              />
            )}

            {tab === "current" &&
              (current ? (
                <CurrentOrder
                  order={current}
                  onAdvance={advanceStatus}
                  onCancel={cancelOrder}
                  advancing={advancing}
                />
              ) : (
                <div className="empty-wrap">
                  <div className="empty-icon">
                    <Inbox size={28} />
                  </div>
                  <div className="empty-title">معندكش أوردر دلوقتي</div>
                  <div className="empty-sub">
                    روح لقائمة الأوردرات المتاحة وخد أوردر عشان تبدأ التوصيل.
                  </div>
                  <button className="empty-cta" onClick={() => setTab("available")}>
                    الأوردرات المتاحة <ChevronLeft size={15} />
                  </button>
                </div>
              ))}
          </>
        )}
      </div>

      {banner && (
        <div className={`seka-banner ${banner.type}`}>
          {banner.type === "success" ? (
            <CheckCircle2 size={17} />
          ) : (
            <X size={17} />
          )}
          {banner.text}
        </div>
      )}
    </div>
  );
}

function AvailableList({ orders, onClaim, disabled, claimingId }) {
  if (orders.length === 0) {
    return (
      <div className="empty-wrap">
        <div className="empty-icon">
          <Package size={28} />
        </div>
        <div className="empty-title">مفيش أوردرات جديدة دلوقتي</div>
        <div className="empty-sub">هتظهر هنا أول ما عميل يبعت أوردر جديد.</div>
      </div>
    );
  }
  return (
    <div>
      {disabled && (
        <div
          style={{
            fontSize: 12.5,
            color: "#93A0B8",
            background: "#101E33",
            border: "1px solid #22344F",
            borderRadius: 12,
            padding: "10px 12px",
            marginBottom: 14,
            fontWeight: 600,
            lineHeight: 1.7,
          }}
        >
          معاك أوردر شغال حالياً — خلّصه الأول عشان تقدر تاخد أوردر جديد.
        </div>
      )}
      {orders.map((o) => (
        <div className="order-card" key={o.id}>
          <div className="order-desc">{o.description}</div>
          <div className="order-meta">
            <div className="order-meta-row">
              <MapPin size={15} />
              <span>{o.area ? `${o.area} — ${o.location}` : o.location}</span>
            </div>
            <div className="order-meta-row">
              <Phone size={15} />
              <span>{o.phone}</span>
            </div>
          </div>
          <button
            className="btn-claim"
            disabled={disabled || claimingId === o.id}
            style={disabled ? { opacity: 0.4, cursor: "not-allowed" } : {}}
            onClick={() => !disabled && onClaim(o)}
          >
            {claimingId === o.id ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Package size={16} />
            )}
            {claimingId === o.id ? "بياخد الأوردر..." : "خد الأوردر"}
          </button>
        </div>
      ))}
    </div>
  );
}

const STATUS_STYLE = {
  claimed: { color: "#4DA3FF", bg: "#102538", label: "مأخوذ" },
  on_the_way: { color: "#B18CFF", bg: "#241A3D", label: "في الطريق" },
  delivered: { color: "#35D68C", bg: "#0F2E24", label: "تم التسليم" },
};

function CurrentOrder({ order, onAdvance, onCancel, advancing }) {
  const style = STATUS_STYLE[order.status];
  return (
    <div>
      <div className="current-card">
        <div className="current-top">
          <div className="current-desc">{order.description}</div>
          <span
            className="status-badge"
            style={{ background: style.bg, color: style.color }}
          >
            <span className="status-dot" style={{ background: style.color }} />
            {style.label}
          </span>
        </div>
        <div className="order-meta">
          <div className="order-meta-row">
            <MapPin size={15} />
            <span>{order.area ? `${order.area} — ${order.location}` : order.location}</span>
          </div>
          <div className="order-meta-row">
            <Phone size={15} />
            <span>{order.phone}</span>
          </div>
        </div>
      </div>

      <div className="route-panel">
        <div className="route-panel-title">مسار الأوردر</div>
        <SikkaRoute status={order.status} />
      </div>

      <div className="action-row">
        {order.status !== "delivered" && (
          <button className="btn-primary-action" onClick={onAdvance} disabled={advancing}>
            {advancing ? (
              <Loader2 size={16} className="spin" />
            ) : order.status === "claimed" ? (
              <>
                <Truck size={16} /> بدء التوصيل
              </>
            ) : (
              <>
                <CheckCircle2 size={16} /> تم التسليم
              </>
            )}
          </button>
        )}
        {order.status !== "delivered" && (
          <button className="btn-cancel-action" onClick={onCancel} disabled={advancing}>
            <X size={16} /> إلغاء
          </button>
        )}
      </div>
    </div>
  );
}

// عنصر "سكة" المميز — مسار متعرج بيتحرك عليه أيقونة العربية لحد النقطة اللي وصلها الأوردر
function SikkaRoute({ status }) {
  const stageIndex = ROUTE_STAGES.findIndex((s) => s.key === status);
  const idx = stageIndex === -1 ? 0 : stageIndex;

  const seg1Done = idx >= 1;
  const seg2Done = idx >= 2;
  const truck = ROUTE_STAGES[idx];

  return (
    <div>
      <svg viewBox="0 0 460 110" width="100%" height="100" style={{ overflow: "visible" }}>
        {/* المسار الأساسي (خلفية) */}
        <path
          d="M34,92 C110,40 150,120 230,34"
          fill="none"
          stroke="#22344F"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M230,34 C320,-10 360,110 426,78"
          fill="none"
          stroke="#22344F"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* أجزاء اتقطعت (Gold) */}
        <path
          d="M34,92 C110,40 150,120 230,34"
          fill="none"
          stroke="#F2B705"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="9 7"
          style={{
            opacity: seg1Done ? 1 : 0,
            transition: "opacity 0.6s ease",
          }}
        />
        <path
          d="M230,34 C320,-10 360,110 426,78"
          fill="none"
          stroke="#F2B705"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="9 7"
          style={{
            opacity: seg2Done ? 1 : 0,
            transition: "opacity 0.6s ease 0.15s",
          }}
        />

        {/* نقاط المحطات */}
        {ROUTE_STAGES.map((s, i) => (
          <circle
            key={s.key}
            cx={s.x}
            cy={s.y}
            r={i <= idx ? 7 : 6}
            fill={i <= idx ? "#F2B705" : "#0B1526"}
            stroke={i <= idx ? "#F2B705" : "#22344F"}
            strokeWidth="2.5"
            style={{ transition: "all 0.4s ease" }}
          />
        ))}

        {/* أيقونة العربية المتحركة */}
        <g
          style={{
            transform: `translate(${truck.x}px, ${truck.y}px)`,
            transition: "transform 0.7s cubic-bezier(0.34, 1.4, 0.64, 1)",
          }}
        >
          <circle r="14" fill="#0B1526" stroke="#F2B705" strokeWidth="2.5" />
          <g transform="translate(-8,-8)">
            <Truck size={16} color="#F2B705" strokeWidth={2.4} />
          </g>
        </g>
      </svg>
      <div className="route-labels">
        {ROUTE_STAGES.map((s, i) => (
          <span key={s.key} className={i <= idx ? "active" : ""}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
