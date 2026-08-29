import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Users,
  Truck,
  Wallet,
  LogOut,
  Loader2,
  Search,
  MapPin,
  Phone,
  Trash2,
  XCircle,
  RefreshCw,
  ShieldCheck,
  User,
  ClipboardList,
  ChevronLeft,
  Settings2,
  Plus,
  Check,
  X,
  Image as ImageIcon,
  Power,
  ArrowDownToLine,
  ArrowUpFromLine,
  CreditCard,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import UserDetailScreen from "./UserDetailScreen.jsx";
import { VodafoneCashLogo, InstaPayLogo } from "./PaymentLogos.jsx";

const LOGO_ICON = "/seka-icon.png";

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
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

const STATUS_META = {
  new: { label: "جديد", color: "#FFC93C", bg: "#3A2F10" },
  claimed: { label: "مأخوذ", color: "#4DA3FF", bg: "#102538" },
  on_the_way: { label: "في الطريق", color: "#B18CFF", bg: "#241A3D" },
  delivered: { label: "تم التسليم", color: "#35D68C", bg: "#0F2E24" },
  cancelled: { label: "ملغي", color: "#FF6B6B", bg: "#3A1616" },
};
const STATUS_TABS = ["all", "new", "claimed", "on_the_way", "delivered", "cancelled"];

const ACCOUNT_TYPE_META = {
  cash: { label: "فودافون كاش", icon: VodafoneCashLogo, color: "#E60000", bg: "#3A1616" },
  instapay: { label: "انستاباي", icon: InstaPayLogo, color: "#8E5CF7", bg: "#241A3D" },
};

export default function AdminScreen({ profile, onLogout }) {
  const [tab, setTab] = useState("orders"); // 'orders' | 'users' | 'adminlog' | 'topups' | 'accounts' | 'courier_verifications' | 'settings'
  const [orders, setOrders] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [adminLog, setAdminLog] = useState([]);
  const [topupRequests, setTopupRequests] = useState([]);
  const [withdrawRequests, setWithdrawRequests] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [workLocations, setWorkLocations] = useState([]);
  const [courierVerifications, setCourierVerifications] = useState([]);
  const [appSettings, setAppSettings] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orderFilter, setOrderFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all"); // 'all' | 'customer' | 'courier' | 'admin'
  const [search, setSearch] = useState("");
  const [banner, setBanner] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // { id, type: 'cancel' | 'delete' }

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(t);
  }, [banner]);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "*, customer:profiles!orders_customer_id_fkey(full_name,phone), courier:profiles!orders_courier_id_fkey(full_name,phone)"
      )
      .order("created_at", { ascending: false });
    if (!error) setOrders(data || []);
    return error;
  }, []);

  const fetchProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setProfiles(data || []);
    return error;
  }, []);

  const fetchAdminLog = useCallback(async () => {
    const { data, error } = await supabase
      .from("wallet_transactions")
      .select(
        "*, target:profiles!wallet_transactions_user_id_fkey(full_name,phone), admin:profiles!wallet_transactions_admin_id_fkey(full_name)"
      )
      .eq("type", "admin_adjustment")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error) setAdminLog(data || []);
    return error;
  }, []);

  const fetchTopupRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from("topup_requests")
      .select("*, requester:profiles!topup_requests_user_id_fkey(full_name,phone), account:payment_accounts(label,type,value)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error) setTopupRequests(data || []);
    return error;
  }, []);

  const fetchPaymentAccounts = useCallback(async () => {
    const { data, error } = await supabase
      .from("payment_accounts")
      .select("*")
      .order("sort_order", { ascending: true });
    if (!error) setPaymentAccounts(data || []);
    return error;
  }, []);

  const fetchWithdrawRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from("withdraw_requests")
      .select("*, requester:profiles!withdraw_requests_user_id_fkey(full_name,phone)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error) setWithdrawRequests(data || []);
    return error;
  }, []);

  const fetchWorkLocations = useCallback(async () => {
    const { data, error } = await supabase
      .from("work_locations")
      .select("*")
      .order("sort_order", { ascending: true });
    if (!error) setWorkLocations(data || []);
    return error;
  }, []);

  const fetchCourierVerifications = useCallback(async () => {
    const { data, error } = await supabase
      .from("courier_verifications")
      .select("*, courier:profiles!courier_verifications_courier_id_fkey(full_name,phone,area)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error) setCourierVerifications(data || []);
    return error;
  }, []);

  const fetchAppSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!error) setAppSettings(data || null);
    return error;
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    Promise.all([
      fetchOrders(),
      fetchProfiles(),
      fetchAdminLog(),
      fetchTopupRequests(),
      fetchPaymentAccounts(),
      fetchWithdrawRequests(),
      fetchWorkLocations(),
      fetchCourierVerifications(),
      fetchAppSettings(),
    ]).then(() => {
      if (!ignore) setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [
    fetchOrders,
    fetchProfiles,
    fetchAdminLog,
    fetchTopupRequests,
    fetchPaymentAccounts,
    fetchWithdrawRequests,
    fetchWorkLocations,
    fetchCourierVerifications,
    fetchAppSettings,
  ]);

  // الأدمن بيشوف كل حاجة (RLS مسموحلها) — أي تغيير في الأوردرات أو
  // البروفايلات (رصيد محفظة اتغير، دور اتغير...) بيعيد الجلب عشان الداشبورد يفضل لايف
  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        fetchProfiles();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions" }, () => {
        fetchAdminLog();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "topup_requests" }, () => {
        fetchTopupRequests();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_accounts" }, () => {
        fetchPaymentAccounts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "withdraw_requests" }, () => {
        fetchWithdrawRequests();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "work_locations" }, () => {
        fetchWorkLocations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_verifications" }, () => {
        fetchCourierVerifications();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => {
        fetchAppSettings();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [
    fetchOrders,
    fetchProfiles,
    fetchAdminLog,
    fetchTopupRequests,
    fetchPaymentAccounts,
    fetchWithdrawRequests,
    fetchWorkLocations,
    fetchCourierVerifications,
    fetchAppSettings,
  ]);

  const manualRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchOrders(),
      fetchProfiles(),
      fetchAdminLog(),
      fetchTopupRequests(),
      fetchPaymentAccounts(),
      fetchWithdrawRequests(),
      fetchWorkLocations(),
      fetchCourierVerifications(),
      fetchAppSettings(),
    ]);
    setRefreshing(false);
  };

  const pendingTopupsCount = useMemo(
    () => topupRequests.filter((r) => r.status === "pending").length,
    [topupRequests]
  );

  const pendingWithdrawsCount = useMemo(
    () => withdrawRequests.filter((r) => r.status === "pending").length,
    [withdrawRequests]
  );

  const pendingCourierVerificationsCount = useMemo(
    () => courierVerifications.filter((r) => r.status === "pending").length,
    [courierVerifications]
  );

  const reviewTopup = async (request, approve, note) => {
    const { error } = await supabase.rpc("admin_review_topup_request", {
      p_request_id: request.id,
      p_approve: approve,
      p_admin_note: note || null,
    });
    if (error) {
      setBanner({ type: "error", text: error.message || "حصل خطأ، حاول تاني" });
      return;
    }
    setBanner({ type: "ok", text: approve ? "تم قبول طلب الشحن وزودنا الرصيد" : "تم رفض طلب الشحن" });
    fetchTopupRequests();
    fetchProfiles();
  };

  const reviewWithdraw = async (request, approve, note) => {
    const { error } = await supabase.rpc("admin_review_withdraw_request", {
      p_request_id: request.id,
      p_approve: approve,
      p_admin_note: note || null,
    });
    if (error) {
      setBanner({ type: "error", text: error.message || "حصل خطأ، حاول تاني" });
      return;
    }
    setBanner({
      type: "ok",
      text: approve ? "تم تأكيد تحويل الفلوس للدليفري" : "تم رفض طلب السحب واسترجاع المبلغ لرصيده",
    });
    fetchWithdrawRequests();
    fetchProfiles();
  };

  const reviewCourierVerification = async (verification, approve, note) => {
    const { error } = await supabase.rpc("admin_review_courier_verification", {
      p_verification_id: verification.id,
      p_approve: approve,
      p_admin_note: note || null,
    });
    if (error) {
      setBanner({ type: "error", text: error.message || "حصل خطأ، حاول تاني" });
      return;
    }
    setBanner({
      type: "ok",
      text: approve ? "تم قبول توثيق الدليفري" : "تم رفض توثيق الدليفري",
    });
    fetchCourierVerifications();
  };

  const addPaymentAccount = async (payload) => {
    const { error } = await supabase.from("payment_accounts").insert({
      type: payload.type,
      label: payload.label.trim(),
      value: payload.value.trim(),
      sort_order: paymentAccounts.length,
    });
    if (error) {
      setBanner({ type: "error", text: "معرفناش نضيف المحفظة، حاول تاني" });
      return false;
    }
    setBanner({ type: "ok", text: "اتضافت المحفظة" });
    fetchPaymentAccounts();
    return true;
  };

  const toggleAccountActive = async (acc) => {
    const { error } = await supabase
      .from("payment_accounts")
      .update({ active: !acc.active })
      .eq("id", acc.id);
    if (!error) fetchPaymentAccounts();
  };

  const deletePaymentAccount = async (acc) => {
    const { error } = await supabase.from("payment_accounts").delete().eq("id", acc.id);
    if (error) {
      setBanner({ type: "error", text: "معرفناش نحذف المحفظة" });
      return;
    }
    setBanner({ type: "ok", text: "اتمسحت المحفظة" });
    fetchPaymentAccounts();
  };

  const addWorkLocation = async (name) => {
    const { error } = await supabase.from("work_locations").insert({
      name: name.trim(),
      sort_order: workLocations.length,
    });
    if (error) {
      setBanner({ type: "error", text: "معرفناش نضيف المكان، حاول تاني" });
      return false;
    }
    setBanner({ type: "ok", text: "اتضاف المكان" });
    fetchWorkLocations();
    return true;
  };

  const toggleWorkLocationActive = async (loc) => {
    const { error } = await supabase
      .from("work_locations")
      .update({ active: !loc.active })
      .eq("id", loc.id);
    if (!error) fetchWorkLocations();
  };

  const deleteWorkLocation = async (loc) => {
    const { error } = await supabase.from("work_locations").delete().eq("id", loc.id);
    if (error) {
      setBanner({ type: "error", text: "معرفناش نحذف المكان" });
      return;
    }
    setBanner({ type: "ok", text: "اتمسح المكان" });
    fetchWorkLocations();
  };

  const saveAppSettings = async (minPrice, commission) => {
    const { data, error } = await supabase.rpc("admin_update_app_settings", {
      p_min_delivery_price: minPrice,
      p_commission_amount: commission,
    });
    if (error) {
      setBanner({ type: "error", text: error.message || "معرفناش نحفظ الإعدادات" });
      return false;
    }
    setAppSettings(data);
    setBanner({ type: "ok", text: "اتحفظت الإعدادات" });
    return true;
  };

  const stats = useMemo(() => {
    const byStatus = { new: 0, claimed: 0, on_the_way: 0, delivered: 0, cancelled: 0 };
    orders.forEach((o) => {
      if (byStatus[o.status] !== undefined) byStatus[o.status] += 1;
    });
    const deliveredToday = orders.filter(
      (o) => o.status === "delivered" && o.updated_at >= startOfTodayISO()
    ).length;
    const customers = profiles.filter((p) => p.role === "customer").length;
    const couriers = profiles.filter((p) => p.role === "courier").length;
    const walletTotal = profiles.reduce((sum, p) => sum + Number(p.wallet_balance || 0), 0);
    return {
      total: orders.length,
      active: byStatus.claimed + byStatus.on_the_way,
      byStatus,
      deliveredToday,
      customers,
      couriers,
      walletTotal,
    };
  }, [orders, profiles]);

  const filteredOrders = useMemo(() => {
    let list = orders;
    if (orderFilter !== "all") list = list.filter((o) => o.status === orderFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const hay = [
          o.description,
          o.location,
          o.area,
          o.phone,
          o.customer?.full_name,
          o.courier?.full_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [orders, orderFilter, search]);

  const filteredUsers = useMemo(() => {
    let list = profiles;
    if (userFilter !== "all") list = list.filter((p) => p.role === userFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        [p.full_name, p.phone, p.area].filter(Boolean).join(" ").toLowerCase().includes(q)
      );
    }
    return list;
  }, [profiles, userFilter, search]);

  const cancelOrder = async (order) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order.id);
    setPendingAction(null);
    if (error) {
      setBanner({ type: "error", text: "معرفناش نلغي الأوردر، حاول تاني" });
      return;
    }
    setBanner({ type: "ok", text: "تم إلغاء الأوردر" });
    fetchOrders();
  };

  const deleteOrder = async (order) => {
    const { error } = await supabase.from("orders").delete().eq("id", order.id);
    setPendingAction(null);
    if (error) {
      setBanner({ type: "error", text: "معرفناش نحذف الأوردر، حاول تاني" });
      return;
    }
    setBanner({ type: "ok", text: "اتحذف الأوردر" });
    fetchOrders();
  };

  return (
    <div className="adm-root" dir="rtl">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Changa:wght@500;600;700;800&family=Cairo:wght@400;500;600;700;900&display=swap');

        .adm-root {
          --navy: #0B1526; --navy-2: #101E33; --navy-3: #16263F; --navy-line: #22344F;
          --gold: #F2B705; --gold-2: #E8A33D; --white: #FFFFFF;
          --muted: #93A0B8; --muted-2: #5E6E8C; --danger: #FF6B6B; --danger-bg: #3A1616;
          font-family: 'Cairo', sans-serif;
          background: radial-gradient(1400px 700px at 85% -10%, #14213a 0%, var(--navy) 55%), var(--navy);
          color: var(--white);
          min-height: 100vh;
          width: 100%;
          box-sizing: border-box;
          position: relative;
        }
        .adm-root * { box-sizing: border-box; }
        .adm-shell { max-width: 900px; margin: 0 auto; padding-bottom: 60px; }

        .adm-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 20px 16px; border-bottom: 1px solid var(--navy-line);
          flex-wrap: wrap; gap: 12px;
        }
        .adm-brand { display: flex; align-items: center; gap: 10px; }
        .adm-mark { width: 42px; height: 42px; border-radius: 11px; object-fit: contain; }
        .adm-name { font-family: 'Changa', sans-serif; font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 7px; }
        .adm-sub { font-size: 11.5px; color: var(--gold-2); font-weight: 600; margin-top: 1px; }
        .adm-btn-icon {
          width: 38px; height: 38px; border-radius: 12px; background: var(--navy-2);
          border: 1px solid var(--navy-line); color: var(--muted);
          display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
        }
        .adm-btn-icon:active { transform: scale(0.94); }
        .adm-header-actions { display: flex; gap: 8px; }

        /* stats */
        .adm-stats {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
          padding: 18px 20px 4px;
        }
        @media (min-width: 640px) { .adm-stats { grid-template-columns: repeat(4, 1fr); } }
        .adm-stat-card {
          background: var(--navy-2); border: 1px solid var(--navy-line); border-radius: 14px; padding: 13px 14px;
        }
        .adm-stat-num { font-family: 'Cairo', sans-serif; font-weight: 900; font-size: 21px; color: var(--gold); }
        .adm-stat-label { font-size: 11.5px; color: var(--muted); font-weight: 600; margin-top: 3px; }

        /* tabs (section) */
        .adm-sec-tabs {
          display: flex; gap: 6px; margin: 18px 20px 4px;
          background: var(--navy-2); border: 1px solid var(--navy-line); border-radius: 14px; padding: 5px;
          overflow-x: auto;
        }
        .adm-sec-tab {
          flex: 1; text-align: center; padding: 10px 8px; border-radius: 10px;
          font-weight: 700; font-size: 13px; color: var(--muted); background: transparent; border: none;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;
          white-space: nowrap; position: relative; flex-shrink: 0; min-width: fit-content; padding-left: 12px; padding-right: 12px;
        }
        .adm-sec-tab.on { background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: var(--navy); }
        .adm-tab-dot {
          background: #FF6B6B; color: #fff; border-radius: 999px; font-size: 10.5px; font-weight: 800;
          min-width: 17px; height: 17px; display: flex; align-items: center; justify-content: center; padding: 0 4px;
        }

        .adm-body { padding: 16px 20px; }

        .adm-search {
          display: flex; align-items: center; gap: 8px; background: var(--navy-2);
          border: 1px solid var(--navy-line); border-radius: 12px; padding: 10px 12px; margin-bottom: 12px;
        }
        .adm-search input {
          flex: 1; background: transparent; border: none; outline: none; color: var(--white);
          font-family: 'Cairo', sans-serif; font-size: 13.5px;
        }
        .adm-search svg { color: var(--muted-2); flex-shrink: 0; }

        .adm-chips { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 6px; }
        .adm-chip {
          flex-shrink: 0; padding: 7px 13px; border-radius: 999px; font-size: 12.5px; font-weight: 700;
          border: 1px solid var(--navy-line); background: var(--navy-2); color: var(--muted); cursor: pointer;
          display: flex; align-items: center; gap: 6px; white-space: nowrap;
        }
        .adm-chip.on { background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: var(--navy); border-color: transparent; }

        /* order card */
        .adm-order-card {
          background: var(--navy-2); border: 1px solid var(--navy-line); border-radius: 16px;
          padding: 15px; margin-bottom: 12px;
        }
        .adm-order-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
        .adm-order-desc { font-size: 14.5px; font-weight: 700; line-height: 1.6; }
        .adm-badge {
          display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px;
          font-size: 11.5px; font-weight: 800; white-space: nowrap; flex-shrink: 0;
        }
        .adm-order-meta { font-size: 12.5px; color: var(--muted); display: flex; flex-direction: column; gap: 5px; margin: 10px 0; }
        .adm-order-meta-row { display: flex; align-items: center; gap: 7px; }
        .adm-order-meta-row svg { flex-shrink: 0; color: var(--gold-2); }
        .adm-people-row { display: flex; gap: 10px; flex-wrap: wrap; margin: 10px 0; }
        .adm-person-pill {
          display: flex; align-items: center; gap: 6px; background: var(--navy-3); border: 1px solid var(--navy-line);
          border-radius: 10px; padding: 6px 10px; font-size: 11.5px; color: var(--muted);
        }
        .adm-person-pill b { color: var(--white); font-weight: 700; }
        .adm-order-actions { display: flex; gap: 8px; margin-top: 10px; }
        .adm-act-btn {
          flex: 1; border-radius: 10px; padding: 9px; font-weight: 700; font-size: 12.5px;
          display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;
          font-family: 'Cairo', sans-serif; border: 1px solid var(--navy-line); background: var(--navy-3); color: var(--muted);
        }
        .adm-act-btn.danger { border-color: var(--danger); color: var(--danger); background: var(--danger-bg); }

        .adm-screenshot-btn {
          display: flex; align-items: center; gap: 7px; width: fit-content;
          background: var(--navy-3); border: 1px solid var(--navy-line); color: var(--gold-2);
          border-radius: 10px; padding: 8px 12px; font-size: 12px; font-weight: 700; cursor: pointer;
          font-family: 'Cairo', sans-serif; margin-top: 4px;
        }
        .adm-screenshot-img {
          width: 100%; max-height: 320px; object-fit: contain; border-radius: 12px;
          border: 1px solid var(--navy-line); background: #000; margin-top: 10px;
        }
        .adm-topup-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
        .adm-btn-mini {
          display: flex; align-items: center; gap: 6px; border-radius: 10px; padding: 9px 12px;
          font-weight: 700; font-size: 12.5px; cursor: pointer; font-family: 'Cairo', sans-serif;
          border: 1px solid var(--navy-line); background: var(--navy-3); color: var(--muted);
        }
        .adm-btn-mini.ok { border-color: #35D68C; color: #35D68C; background: #0F2E24; }
        .adm-btn-mini.danger { border-color: var(--danger); color: var(--danger); background: var(--danger-bg); }
        .adm-reject-input {
          flex: 1; min-width: 140px; background: var(--navy-3); border: 1px solid var(--navy-line);
          border-radius: 10px; padding: 9px 12px; color: var(--white); font-size: 12.5px;
          font-family: 'Cairo', sans-serif;
        }

        .adm-add-account-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
          background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: var(--navy);
          border: none; border-radius: 14px; padding: 13px; font-weight: 800; font-size: 13.5px;
          cursor: pointer; font-family: 'Cairo', sans-serif; margin-bottom: 16px;
        }
        .adm-account-form {
          background: var(--navy-2); border: 1px solid var(--navy-line); border-radius: 14px;
          padding: 14px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px;
        }
        .adm-form-type-row { display: flex; gap: 8px; }
        .adm-form-type-btn {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
          background: var(--navy-3); border: 1.5px solid var(--navy-line); border-radius: 10px;
          padding: 9px; font-size: 12.5px; font-weight: 700; color: var(--muted); cursor: pointer;
          font-family: 'Cairo', sans-serif;
        }
        .adm-form-input {
          background: var(--navy-3); border: 1px solid var(--navy-line); border-radius: 10px;
          padding: 11px 12px; color: var(--white); font-size: 13px; font-family: 'Cairo', sans-serif;
        }
        .adm-form-actions { display: flex; gap: 8px; }
        .adm-act-btn.confirm { border-color: var(--danger); background: var(--danger); color: #fff; }

        /* user row */
        .adm-user-row {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          background: var(--navy-2); border: 1px solid var(--navy-line); border-radius: 14px;
          padding: 12px 14px; margin-bottom: 10px; cursor: pointer;
        }
        .adm-user-row:active { transform: scale(0.99); }
        .adm-user-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .adm-user-avatar {
          width: 36px; height: 36px; border-radius: 10px; background: var(--navy-3);
          display: flex; align-items: center; justify-content: center; color: var(--gold-2); flex-shrink: 0;
        }
        .adm-user-name { font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .adm-user-phone { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
        .adm-user-email { font-size: 11px; color: var(--muted); margin-top: 1px; opacity: 0.8; direction: ltr; text-align: right; }
        .adm-user-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .adm-role-badge { font-size: 10.5px; font-weight: 800; padding: 4px 9px; border-radius: 999px; }
        .adm-wallet-tag { font-size: 12px; font-weight: 800; color: var(--gold); white-space: nowrap; }

        .adm-empty { text-align: center; color: var(--muted); padding: 60px 20px; font-size: 13.5px; }

        .adm-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 90px 24px; color: var(--muted); }
        .adm-spin { animation: admspin 0.9s linear infinite; }
        @keyframes admspin { to { transform: rotate(360deg); } }

        .adm-banner {
          position: fixed; left: 20px; right: 20px; bottom: 22px; max-width: 860px; margin: 0 auto;
          padding: 13px 16px; border-radius: 14px; font-weight: 700; font-size: 13.5px; z-index: 30;
          box-shadow: 0 10px 30px -10px rgba(0,0,0,0.6);
        }
        .adm-banner.ok { background: #0F2E24; color: #35D68C; border: 1px solid #35D68C; }
        .adm-banner.error { background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger); }
      `}</style>

      <div className="adm-shell">
        <div className="adm-header">
          <div className="adm-brand">
            <img src={LOGO_ICON} alt="سكة" className="adm-mark" />
            <div>
              <div className="adm-name">
                <LayoutDashboard size={17} color="#F2B705" />
                لوحة تحكم سكة
              </div>
              <div className="adm-sub">
                {profile?.full_name ? `أهلاً يا ${profile.full_name}` : "واجهة الإدارة"}
              </div>
            </div>
          </div>
          <div className="adm-header-actions">
            <button className="adm-btn-icon" onClick={manualRefresh} title="تحديث">
              <RefreshCw size={16} className={refreshing ? "adm-spin" : ""} />
            </button>
            {onLogout && (
              <button className="adm-btn-icon" onClick={onLogout} title="تسجيل خروج">
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="adm-loading">
            <Loader2 size={28} className="adm-spin" />
            بنحمّل بيانات اللوحة...
          </div>
        ) : selectedUser ? (
          <div className="adm-body">
            <UserDetailScreen
              person={selectedUser}
              onBack={() => setSelectedUser(null)}
              onChanged={() => {
                fetchProfiles();
                fetchAdminLog();
              }}
            />
          </div>
        ) : (
          <>
            <div className="adm-stats">
              <StatCard num={stats.total} label="إجمالي الأوردرات" />
              <StatCard num={stats.active} label="شغالة دلوقتي" />
              <StatCard num={stats.deliveredToday} label="اتسلمت النهاردة" />
              <StatCard num={`${stats.walletTotal.toFixed(0)} ج.م`} label="إجمالي أرصدة المحافظ" />
              <StatCard num={stats.customers} label="عدد العملاء" />
              <StatCard num={stats.couriers} label="عدد الدليفريز" />
              <StatCard num={stats.byStatus.new} label="أوردرات جديدة" />
              <StatCard num={stats.byStatus.cancelled} label="ملغية" />
            </div>

            <div className="adm-sec-tabs">
              <button
                className={`adm-sec-tab ${tab === "orders" ? "on" : ""}`}
                onClick={() => setTab("orders")}
              >
                <Package size={15} /> الأوردرات
              </button>
              <button
                className={`adm-sec-tab ${tab === "users" ? "on" : ""}`}
                onClick={() => setTab("users")}
              >
                <Users size={15} /> المستخدمين
              </button>
              <button
                className={`adm-sec-tab ${tab === "topups" ? "on" : ""}`}
                onClick={() => setTab("topups")}
              >
                <ArrowDownToLine size={15} /> طلبات الشحن
                {pendingTopupsCount > 0 && <span className="adm-tab-dot">{pendingTopupsCount}</span>}
              </button>
              <button
                className={`adm-sec-tab ${tab === "withdraws" ? "on" : ""}`}
                onClick={() => setTab("withdraws")}
              >
                <ArrowUpFromLine size={15} /> طلبات السحب
                {pendingWithdrawsCount > 0 && <span className="adm-tab-dot">{pendingWithdrawsCount}</span>}
              </button>
              <button
                className={`adm-sec-tab ${tab === "courier_verifications" ? "on" : ""}`}
                onClick={() => setTab("courier_verifications")}
              >
                <CreditCard size={15} /> توثيق الدليفري
                {pendingCourierVerificationsCount > 0 && (
                  <span className="adm-tab-dot">{pendingCourierVerificationsCount}</span>
                )}
              </button>
              <button
                className={`adm-sec-tab ${tab === "accounts" ? "on" : ""}`}
                onClick={() => setTab("accounts")}
              >
                <Wallet size={15} /> المحافظ
              </button>
              <button
                className={`adm-sec-tab ${tab === "locations" ? "on" : ""}`}
                onClick={() => setTab("locations")}
              >
                <MapPin size={15} /> الأماكن
              </button>
              <button
                className={`adm-sec-tab ${tab === "adminlog" ? "on" : ""}`}
                onClick={() => setTab("adminlog")}
              >
                <ClipboardList size={15} /> سجل الأدمن
              </button>
              <button
                className={`adm-sec-tab ${tab === "settings" ? "on" : ""}`}
                onClick={() => setTab("settings")}
              >
                <Settings2 size={15} /> إعدادات التسعير
              </button>
            </div>

            <div className="adm-body">
              {tab !== "adminlog" &&
                tab !== "topups" &&
                tab !== "withdraws" &&
                tab !== "accounts" &&
                tab !== "locations" &&
                tab !== "courier_verifications" &&
                tab !== "settings" && (
                <div className="adm-search">
                  <Search size={15} />
                  <input
                    placeholder={tab === "orders" ? "دور بالوصف/المكان/التليفون/الاسم..." : "دور بالاسم أو التليفون..."}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              )}

              {tab === "orders" ? (
                <>
                  <div className="adm-chips">
                    {STATUS_TABS.map((s) => (
                      <button
                        key={s}
                        className={`adm-chip ${orderFilter === s ? "on" : ""}`}
                        onClick={() => setOrderFilter(s)}
                      >
                        {s === "all" ? "الكل" : STATUS_META[s].label}
                        <span>({s === "all" ? stats.total : stats.byStatus[s]})</span>
                      </button>
                    ))}
                  </div>

                  {filteredOrders.length === 0 ? (
                    <div className="adm-empty">مفيش أوردرات مطابقة</div>
                  ) : (
                    filteredOrders.map((o) => (
                      <OrderRow
                        key={o.id}
                        order={o}
                        pendingAction={pendingAction}
                        setPendingAction={setPendingAction}
                        onCancel={cancelOrder}
                        onDelete={deleteOrder}
                      />
                    ))
                  )}
                </>
              ) : tab === "users" ? (
                <>
                  <div className="adm-chips">
                    {["all", "customer", "courier", "admin"].map((r) => (
                      <button
                        key={r}
                        className={`adm-chip ${userFilter === r ? "on" : ""}`}
                        onClick={() => setUserFilter(r)}
                      >
                        {r === "all" ? "الكل" : r === "customer" ? "عملاء" : r === "courier" ? "دليفريز" : "أدمن"}
                        <span>
                          (
                          {r === "all"
                            ? profiles.length
                            : profiles.filter((p) => p.role === r).length}
                          )
                        </span>
                      </button>
                    ))}
                  </div>

                  {filteredUsers.length === 0 ? (
                    <div className="adm-empty">مفيش مستخدمين مطابقين</div>
                  ) : (
                    filteredUsers.map((p) => (
                      <UserRow key={p.id} person={p} onOpen={() => setSelectedUser(p)} />
                    ))
                  )}
                </>
              ) : tab === "topups" ? (
                <>
                  {topupRequests.length === 0 ? (
                    <div className="adm-empty">لسه مفيش أي طلبات شحن.</div>
                  ) : (
                    topupRequests.map((r) => (
                      <TopupRequestRow key={r.id} request={r} onReview={reviewTopup} />
                    ))
                  )}
                </>
              ) : tab === "withdraws" ? (
                <>
                  {withdrawRequests.length === 0 ? (
                    <div className="adm-empty">لسه مفيش أي طلبات سحب.</div>
                  ) : (
                    withdrawRequests.map((r) => (
                      <WithdrawRequestRow key={r.id} request={r} onReview={reviewWithdraw} />
                    ))
                  )}
                </>
              ) : tab === "courier_verifications" ? (
                <>
                  {courierVerifications.length === 0 ? (
                    <div className="adm-empty">لسه مفيش أي طلبات توثيق دليفري.</div>
                  ) : (
                    courierVerifications.map((v) => (
                      <CourierVerificationRow
                        key={v.id}
                        verification={v}
                        onReview={reviewCourierVerification}
                      />
                    ))
                  )}
                </>
              ) : tab === "accounts" ? (
                <PaymentAccountsPanel
                  accounts={paymentAccounts}
                  onAdd={addPaymentAccount}
                  onToggle={toggleAccountActive}
                  onDelete={deletePaymentAccount}
                />
              ) : tab === "locations" ? (
                <LocationsPanel
                  locations={workLocations}
                  onAdd={addWorkLocation}
                  onToggle={toggleWorkLocationActive}
                  onDelete={deleteWorkLocation}
                />
              ) : tab === "settings" ? (
                <SettingsPanel settings={appSettings} onSave={saveAppSettings} />
              ) : (
                <>
                  {adminLog.length === 0 ? (
                    <div className="adm-empty">لسه مفيش أي تعديل رصيد من الأدمن.</div>
                  ) : (
                    adminLog.map((tx) => <AdminLogRow key={tx.id} tx={tx} />)
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {banner && <div className={`adm-banner ${banner.type}`}>{banner.text}</div>}
    </div>
  );
}

function StatCard({ num, label }) {
  return (
    <div className="adm-stat-card">
      <div className="adm-stat-num">{num}</div>
      <div className="adm-stat-label">{label}</div>
    </div>
  );
}

function OrderRow({ order, pendingAction, setPendingAction, onCancel, onDelete }) {
  const meta = STATUS_META[order.status] || STATUS_META.new;
  const canCancel = order.status !== "delivered" && order.status !== "cancelled";
  const confirmingCancel = pendingAction?.id === order.id && pendingAction?.type === "cancel";
  const confirmingDelete = pendingAction?.id === order.id && pendingAction?.type === "delete";

  return (
    <div className="adm-order-card">
      <div className="adm-order-top">
        <div className="adm-order-desc">{order.description}</div>
        <span className="adm-badge" style={{ background: meta.bg, color: meta.color }}>
          {meta.label}
        </span>
      </div>

      <div className="adm-order-meta">
        <div className="adm-order-meta-row">
          <MapPin size={14} />
          <span>{order.area ? `${order.area} — ${order.location}` : order.location}</span>
        </div>
        <div className="adm-order-meta-row">
          <Phone size={14} />
          <span>{order.phone}</span>
        </div>
      </div>

      <div className="adm-people-row">
        <span className="adm-person-pill">
          العميل: <b>{order.customer?.full_name || "—"}</b>
        </span>
        <span className="adm-person-pill">
          الدليفري: <b>{order.courier?.full_name || "لسه محدش"}</b>
        </span>
      </div>

      <div className="adm-order-actions">
        {canCancel && (
          <button
            className={`adm-act-btn ${confirmingCancel ? "confirm" : "danger"}`}
            onClick={() =>
              confirmingCancel
                ? onCancel(order)
                : setPendingAction({ id: order.id, type: "cancel" })
            }
          >
            <XCircle size={14} />
            {confirmingCancel ? "متأكد؟ دوس تاني" : "إلغاء الأوردر"}
          </button>
        )}
        <button
          className={`adm-act-btn ${confirmingDelete ? "confirm" : ""}`}
          onClick={() =>
            confirmingDelete
              ? onDelete(order)
              : setPendingAction({ id: order.id, type: "delete" })
          }
        >
          <Trash2 size={14} />
          {confirmingDelete ? "متأكد؟ دوس تاني" : "حذف نهائي"}
        </button>
      </div>
    </div>
  );
}

const ROLE_META = {
  customer: { label: "عميل", color: "#4DA3FF", bg: "#102538", icon: Package },
  courier: { label: "دليفري", color: "#B18CFF", bg: "#241A3D", icon: Truck },
  admin: { label: "أدمن", color: "#F2B705", bg: "#3A2F10", icon: ShieldCheck },
};

function UserRow({ person, onOpen }) {
  const meta = ROLE_META[person.role] || ROLE_META.customer;
  const Icon = meta.icon;
  return (
    <div className="adm-user-row" onClick={onOpen} role="button" tabIndex={0}>
      <div className="adm-user-left">
        <div className="adm-user-avatar">
          <User size={17} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="adm-user-name">{person.full_name}</div>
          <div className="adm-user-phone">
            {person.phone}
            {person.area ? ` · ${person.area}` : ""}
          </div>
          {person.email && <div className="adm-user-email">{person.email}</div>}
        </div>
      </div>
      <div className="adm-user-right">
        {person.role === "courier" && (
          <span className="adm-wallet-tag">
            <Wallet size={12} style={{ display: "inline", marginLeft: 3 }} />
            {Number(person.wallet_balance || 0).toFixed(0)} ج.م
          </span>
        )}
        <span className="adm-role-badge" style={{ background: meta.bg, color: meta.color }}>
          <Icon size={11} style={{ display: "inline", marginLeft: 3 }} />
          {meta.label}
        </span>
        <ChevronLeft size={16} color="#5E6E8C" />
      </div>
    </div>
  );
}

const TOPUP_STATUS_META = {
  pending: { label: "قيد المراجعة", color: "#F2B705", bg: "#3A2F10" },
  approved: { label: "تم القبول", color: "#35D68C", bg: "#0F2E24" },
  rejected: { label: "مرفوض", color: "#FF6B6B", bg: "#3A1616" },
};

function TopupRequestRow({ request, onReview }) {
  const [signedUrl, setSignedUrl] = useState(null);
  const [loadingImg, setLoadingImg] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const meta = TOPUP_STATUS_META[request.status] || TOPUP_STATUS_META.pending;
  const accMeta = ACCOUNT_TYPE_META[request.account?.type] || ACCOUNT_TYPE_META.cash;

  const loadImage = async () => {
    if (signedUrl || loadingImg) {
      setShowFull((s) => !s);
      return;
    }
    setLoadingImg(true);
    const { data } = await supabase.storage
      .from("topup-screenshots")
      .createSignedUrl(request.screenshot_path, 3600);
    setLoadingImg(false);
    if (data?.signedUrl) {
      setSignedUrl(data.signedUrl);
      setShowFull(true);
    }
  };

  const approve = async () => {
    setBusy(true);
    await onReview(request, true, null);
    setBusy(false);
  };

  const reject = async () => {
    setBusy(true);
    await onReview(request, false, note.trim() || null);
    setBusy(false);
    setRejecting(false);
    setNote("");
  };

  return (
    <div className="adm-order-card">
      <div className="adm-order-top">
        <div className="adm-order-desc" style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <accMeta.icon size={15} color={accMeta.color} />
          {request.requester?.full_name || "مستخدم محذوف"}
        </div>
        <span className="adm-badge" style={{ background: meta.bg, color: meta.color }}>
          {meta.label}
        </span>
      </div>

      <div className="adm-order-meta">
        <div className="adm-order-meta-row">
          <span>المبلغ: <b style={{ color: "#F2B705" }}>{Number(request.amount).toFixed(2)} ج.م</b></span>
        </div>
        <div className="adm-order-meta-row">
          <span>حوّل على: {request.account?.label || "—"} ({accMeta.label})</span>
        </div>
        {request.status !== "pending" && request.admin_note && (
          <div className="adm-order-meta-row">
            <span>ملاحظة: {request.admin_note}</span>
          </div>
        )}
      </div>

      <button type="button" className="adm-screenshot-btn" onClick={loadImage} disabled={loadingImg}>
        {loadingImg ? <Loader2 size={14} className="adm-spin" /> : <ImageIcon size={14} />}
        {loadingImg ? "بيحمّل..." : showFull ? "إخفاء الإسكرين" : "شوف إسكرين التحويل"}
      </button>

      {showFull && signedUrl && (
        <img src={signedUrl} alt="إثبات التحويل" className="adm-screenshot-img" />
      )}

      <div className="adm-people-row">
        <span className="adm-person-pill">{request.requester?.phone || "—"}</span>
        <span className="adm-person-pill">{formatDateTime(request.created_at)}</span>
      </div>

      {request.status === "pending" && (
        <div className="adm-topup-actions">
          {rejecting ? (
            <>
              <input
                className="adm-reject-input"
                placeholder="سبب الرفض (اختياري)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button className="adm-btn-mini danger" onClick={reject} disabled={busy}>
                {busy ? <Loader2 size={13} className="adm-spin" /> : <X size={13} />} تأكيد الرفض
              </button>
              <button className="adm-btn-mini" onClick={() => setRejecting(false)} disabled={busy}>
                رجوع
              </button>
            </>
          ) : (
            <>
              <button className="adm-btn-mini ok" onClick={approve} disabled={busy}>
                {busy ? <Loader2 size={13} className="adm-spin" /> : <Check size={13} />} قبول وزيادة الرصيد
              </button>
              <button className="adm-btn-mini danger" onClick={() => setRejecting(true)} disabled={busy}>
                <X size={13} /> رفض
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CourierVerificationRow({ verification, onReview }) {
  const [signedUrl, setSignedUrl] = useState(null);
  const [loadingImg, setLoadingImg] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const meta = TOPUP_STATUS_META[verification.status] || TOPUP_STATUS_META.pending;

  const loadImage = async () => {
    if (signedUrl || loadingImg) {
      setShowFull((s) => !s);
      return;
    }
    setLoadingImg(true);
    const { data } = await supabase.storage
      .from("courier-id-cards")
      .createSignedUrl(verification.id_card_path, 3600);
    setLoadingImg(false);
    if (data?.signedUrl) {
      setSignedUrl(data.signedUrl);
      setShowFull(true);
    }
  };

  const approve = async () => {
    setBusy(true);
    await onReview(verification, true, null);
    setBusy(false);
  };

  const reject = async () => {
    setBusy(true);
    await onReview(verification, false, note.trim() || null);
    setBusy(false);
    setRejecting(false);
    setNote("");
  };

  return (
    <div className="adm-order-card">
      <div className="adm-order-top">
        <div className="adm-order-desc" style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <CreditCard size={15} color="#F2B705" />
          {verification.courier?.full_name || "مستخدم محذوف"}
        </div>
        <span className="adm-badge" style={{ background: meta.bg, color: meta.color }}>
          {meta.label}
        </span>
      </div>

      <div className="adm-order-meta">
        <div className="adm-order-meta-row">
          <MapPin size={14} />
          <span>{verification.courier?.area || "—"}</span>
        </div>
        {verification.status !== "pending" && verification.admin_note && (
          <div className="adm-order-meta-row">
            <span>ملاحظة: {verification.admin_note}</span>
          </div>
        )}
      </div>

      <button type="button" className="adm-screenshot-btn" onClick={loadImage} disabled={loadingImg}>
        {loadingImg ? <Loader2 size={14} className="adm-spin" /> : <ImageIcon size={14} />}
        {loadingImg ? "بيحمّل..." : showFull ? "إخفاء صورة البطاقة" : "شوف صورة البطاقة"}
      </button>

      {showFull && signedUrl && (
        <img src={signedUrl} alt="صورة البطاقة" className="adm-screenshot-img" />
      )}

      <div className="adm-people-row">
        <span className="adm-person-pill">{verification.courier?.phone || "—"}</span>
        <span className="adm-person-pill">{formatDateTime(verification.created_at)}</span>
      </div>

      {verification.status === "pending" && (
        <div className="adm-topup-actions">
          {rejecting ? (
            <>
              <input
                className="adm-reject-input"
                placeholder="سبب الرفض (اختياري)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button className="adm-btn-mini danger" onClick={reject} disabled={busy}>
                {busy ? <Loader2 size={13} className="adm-spin" /> : <X size={13} />} تأكيد الرفض
              </button>
              <button className="adm-btn-mini" onClick={() => setRejecting(false)} disabled={busy}>
                رجوع
              </button>
            </>
          ) : (
            <>
              <button className="adm-btn-mini ok" onClick={approve} disabled={busy}>
                {busy ? <Loader2 size={13} className="adm-spin" /> : <Check size={13} />} قبول التوثيق
              </button>
              <button className="adm-btn-mini danger" onClick={() => setRejecting(true)} disabled={busy}>
                <X size={13} /> رفض
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const WITHDRAW_METHOD_META = {
  vodafone_cash: { label: "فودافون كاش", icon: VodafoneCashLogo, color: "#E60000", bg: "#3A1616" },
  instapay: { label: "انستاباي", icon: InstaPayLogo, color: "#8E5CF7", bg: "#241A3D" },
};

function WithdrawRequestRow({ request, onReview }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const statusMeta = TOPUP_STATUS_META[request.status] || TOPUP_STATUS_META.pending;
  const methodMeta = WITHDRAW_METHOD_META[request.method] || WITHDRAW_METHOD_META.vodafone_cash;

  const approve = async () => {
    setBusy(true);
    await onReview(request, true, null);
    setBusy(false);
  };

  const reject = async () => {
    setBusy(true);
    await onReview(request, false, note.trim() || null);
    setBusy(false);
    setRejecting(false);
    setNote("");
  };

  return (
    <div className="adm-order-card">
      <div className="adm-order-top">
        <div className="adm-order-desc" style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <ArrowUpFromLine size={15} color={methodMeta.color} />
          {request.requester?.full_name || "مستخدم محذوف"}
        </div>
        <span className="adm-badge" style={{ background: statusMeta.bg, color: statusMeta.color }}>
          {statusMeta.label}
        </span>
      </div>

      <div className="adm-order-meta">
        <div className="adm-order-meta-row">
          <span>المبلغ: <b style={{ color: "#F2B705" }}>{Number(request.amount).toFixed(2)} ج.م</b></span>
        </div>
        <div className="adm-order-meta-row">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 7,
              background: methodMeta.bg,
              color: methodMeta.color,
              marginLeft: 6,
            }}
          >
            <methodMeta.icon size={13} />
          </span>
          <span>حوّل عليه: {methodMeta.label} — {request.reference}</span>
        </div>
        {request.status !== "pending" && request.admin_note && (
          <div className="adm-order-meta-row">
            <span>ملاحظة: {request.admin_note}</span>
          </div>
        )}
      </div>

      <div className="adm-people-row">
        <span className="adm-person-pill">{request.requester?.phone || "—"}</span>
        <span className="adm-person-pill">{formatDateTime(request.created_at)}</span>
      </div>

      {request.status === "pending" && (
        <div className="adm-topup-actions">
          {rejecting ? (
            <>
              <input
                className="adm-reject-input"
                placeholder="سبب الرفض (اختياري)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button className="adm-btn-mini danger" onClick={reject} disabled={busy}>
                {busy ? <Loader2 size={13} className="adm-spin" /> : <X size={13} />} تأكيد الرفض
              </button>
              <button className="adm-btn-mini" onClick={() => setRejecting(false)} disabled={busy}>
                رجوع
              </button>
            </>
          ) : (
            <>
              <button className="adm-btn-mini ok" onClick={approve} disabled={busy}>
                {busy ? <Loader2 size={13} className="adm-spin" /> : <Check size={13} />} أكّد إني حوّلت الفلوس
              </button>
              <button className="adm-btn-mini danger" onClick={() => setRejecting(true)} disabled={busy}>
                <X size={13} /> رفض واسترجاع الرصيد
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentAccountsPanel({ accounts, onAdd, onToggle, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState("cash");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const submit = async () => {
    if (!label.trim() || !value.trim()) return;
    setBusy(true);
    const ok = await onAdd({ type, label, value });
    setBusy(false);
    if (ok) {
      setLabel("");
      setValue("");
      setType("cash");
      setAdding(false);
    }
  };

  return (
    <div>
      {!adding ? (
        <button className="adm-add-account-btn" onClick={() => setAdding(true)}>
          <Plus size={16} /> إضافة محفظة جديدة
        </button>
      ) : (
        <div className="adm-account-form">
          <div className="adm-form-type-row">
            {Object.entries(ACCOUNT_TYPE_META).map(([k, m]) => (
              <button
                key={k}
                type="button"
                className={`adm-form-type-btn ${type === k ? "on" : ""}`}
                onClick={() => setType(k)}
                style={type === k ? { borderColor: m.color, color: m.color } : {}}
              >
                <m.icon size={14} /> {m.label}
              </button>
            ))}
          </div>
          <input
            className="adm-form-input"
            placeholder="اسم يظهر للدليفري (مثلاً: فودافون كاش - محمد)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            className="adm-form-input"
            placeholder={type === "cash" ? "رقم المحفظة" : "لينك/معرّف انستاباي"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ direction: "ltr", textAlign: "right" }}
          />
          <div className="adm-form-actions">
            <button className="adm-btn-mini ok" onClick={submit} disabled={busy || !label.trim() || !value.trim()}>
              {busy ? <Loader2 size={13} className="adm-spin" /> : <Check size={13} />} حفظ
            </button>
            <button className="adm-btn-mini" onClick={() => setAdding(false)} disabled={busy}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="adm-empty">لسه مفيش محافظ مضافة.</div>
      ) : (
        accounts.map((acc) => {
          const m = ACCOUNT_TYPE_META[acc.type] || ACCOUNT_TYPE_META.cash;
          return (
            <div className="adm-order-card" key={acc.id}>
              <div className="adm-order-top">
                <div className="adm-order-desc" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <m.icon size={15} color={m.color} /> {acc.label}
                </div>
                <span
                  className="adm-badge"
                  style={{ background: acc.active ? "#0F2E24" : "#3A1616", color: acc.active ? "#35D68C" : "#FF6B6B" }}
                >
                  {acc.active ? "مفعّلة" : "متوقفة"}
                </span>
              </div>
              <div className="adm-order-meta">
                <div className="adm-order-meta-row" style={{ direction: "ltr", justifyContent: "flex-end" }}>
                  <span>{acc.value}</span>
                </div>
              </div>
              <div className="adm-topup-actions">
                <button className="adm-btn-mini" onClick={() => onToggle(acc)}>
                  <Power size={13} /> {acc.active ? "إيقاف" : "تفعيل"}
                </button>
                {confirmDelete === acc.id ? (
                  <button className="adm-btn-mini danger" onClick={() => { onDelete(acc); setConfirmDelete(null); }}>
                    <Trash2 size={13} /> تأكيد الحذف
                  </button>
                ) : (
                  <button className="adm-btn-mini danger" onClick={() => setConfirmDelete(acc.id)}>
                    <Trash2 size={13} /> حذف
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function LocationsPanel({ locations, onAdd, onToggle, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const ok = await onAdd(name);
    setBusy(false);
    if (ok) {
      setName("");
      setAdding(false);
    }
  };

  return (
    <div>
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
        الأماكن دي هي اللي هتظهر للعميل يختار منها لما يعمل أوردر جديد. أي مكان "متوقف" مش هيظهر ليه.
      </div>

      {!adding ? (
        <button className="adm-add-account-btn" onClick={() => setAdding(true)}>
          <Plus size={16} /> إضافة مكان جديد
        </button>
      ) : (
        <div className="adm-account-form">
          <input
            className="adm-form-input"
            placeholder="اسم المكان (مثلاً: المعادي، مدينة نصر...)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="adm-form-actions">
            <button className="adm-btn-mini ok" onClick={submit} disabled={busy || !name.trim()}>
              {busy ? <Loader2 size={13} className="adm-spin" /> : <Check size={13} />} حفظ
            </button>
            <button className="adm-btn-mini" onClick={() => setAdding(false)} disabled={busy}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {locations.length === 0 ? (
        <div className="adm-empty">لسه مفيش أماكن مضافة.</div>
      ) : (
        locations.map((loc) => (
          <div className="adm-order-card" key={loc.id}>
            <div className="adm-order-top">
              <div className="adm-order-desc" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <MapPin size={15} color="#F2B705" /> {loc.name}
              </div>
              <span
                className="adm-badge"
                style={{
                  background: loc.active ? "#0F2E24" : "#3A1616",
                  color: loc.active ? "#35D68C" : "#FF6B6B",
                }}
              >
                {loc.active ? "مفعّل" : "متوقف"}
              </span>
            </div>
            <div className="adm-topup-actions">
              <button className="adm-btn-mini" onClick={() => onToggle(loc)}>
                <Power size={13} /> {loc.active ? "إيقاف" : "تفعيل"}
              </button>
              {confirmDelete === loc.id ? (
                <button
                  className="adm-btn-mini danger"
                  onClick={() => {
                    onDelete(loc);
                    setConfirmDelete(null);
                  }}
                >
                  <Trash2 size={13} /> تأكيد الحذف
                </button>
              ) : (
                <button className="adm-btn-mini danger" onClick={() => setConfirmDelete(loc.id)}>
                  <Trash2 size={13} /> حذف
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SettingsPanel({ settings, onSave }) {
  const [minPrice, setMinPrice] = useState("");
  const [commission, setCommission] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!settings || dirty) return;
    setMinPrice(String(settings.min_delivery_price ?? ""));
    setCommission(String(settings.commission_amount ?? ""));
  }, [settings, dirty]);

  const minPriceNum = Number(minPrice);
  const commissionNum = Number(commission);
  const valid =
    minPrice !== "" &&
    commission !== "" &&
    Number.isFinite(minPriceNum) &&
    Number.isFinite(commissionNum) &&
    minPriceNum >= 0 &&
    commissionNum >= 0;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const ok = await onSave(minPriceNum, commissionNum);
    setBusy(false);
    if (ok) setDirty(false);
  };

  if (!settings) {
    return <div className="adm-empty">بنحمّل الإعدادات...</div>;
  }

  return (
    <div>
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
        الحد الأدنى بيتفرض على العميل وقت ما يعمل أوردر جديد. العمولة قيمة
        ثابتة (مش نسبة) بتتخصم من محفظة الدليفري لحظة ما ياخد الأوردر —
        بالسعر الأصلي أو بأي عرض.
      </div>

      <div className="adm-account-form" style={{ marginBottom: 0 }}>
        <label style={{ fontSize: 12.5, color: "#93A0B8", fontWeight: 700 }}>
          الحد الأدنى لسعر التوصيل (ج.م)
        </label>
        <input
          className="adm-form-input"
          type="number"
          min="0"
          step="0.5"
          placeholder="مثلاً: 10"
          value={minPrice}
          onChange={(e) => {
            setMinPrice(e.target.value);
            setDirty(true);
          }}
        />

        <label style={{ fontSize: 12.5, color: "#93A0B8", fontWeight: 700, marginTop: 6 }}>
          قيمة العمولة الثابتة (ج.م)
        </label>
        <input
          className="adm-form-input"
          type="number"
          min="0"
          step="0.5"
          placeholder="مثلاً: 2"
          value={commission}
          onChange={(e) => {
            setCommission(e.target.value);
            setDirty(true);
          }}
        />

        <div className="adm-form-actions" style={{ marginTop: 4 }}>
          <button className="adm-btn-mini ok" onClick={submit} disabled={busy || !valid || !dirty}>
            {busy ? <Loader2 size={13} className="adm-spin" /> : <Check size={13} />} حفظ
          </button>
          {dirty && !busy && (
            <button
              className="adm-btn-mini"
              onClick={() => {
                setMinPrice(String(settings.min_delivery_price ?? ""));
                setCommission(String(settings.commission_amount ?? ""));
                setDirty(false);
              }}
            >
              إلغاء التعديل
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminLogRow({ tx }) {
  const isPositive = Number(tx.amount) > 0;
  return (
    <div className="adm-order-card">
      <div className="adm-order-top">
        <div className="adm-order-desc" style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Settings2 size={15} color="#F2B705" />
          {tx.target?.full_name || "مستخدم محذوف"}
        </div>
        <span
          className="adm-badge"
          style={{
            background: isPositive ? "#0F2E24" : "#3A1616",
            color: isPositive ? "#35D68C" : "#FF6B6B",
          }}
        >
          {isPositive ? "+" : "-"} {Number(Math.abs(tx.amount)).toFixed(2)} ج.م
        </span>
      </div>
      <div className="adm-order-meta">
        <div className="adm-order-meta-row">
          <span>السبب: {tx.note || "—"}</span>
        </div>
      </div>
      <div className="adm-people-row">
        <span className="adm-person-pill">
          بواسطة: <b>{tx.admin?.full_name || "—"}</b>
        </span>
        <span className="adm-person-pill">{formatDateTime(tx.created_at)}</span>
      </div>
    </div>
  );
}
