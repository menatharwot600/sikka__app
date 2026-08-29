import React, { useState, useEffect, useCallback } from "react";
import {
  Package,
  MapPin,
  Phone,
  Send,
  Clock,
  CheckCircle2,
  Truck,
  X,
  FileText,
  ListChecks,
  LogOut,
  Loader2,
  Tag,
  Pencil,
  ChevronDown,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const LOGO_ICON = "/seka-icon.png";
const STATUS_STYLE = {
  new: { color: "#FFC93C", bg: "#3A2F10", label: "جديد" },
  claimed: { color: "#4DA3FF", bg: "#102538", label: "مأخوذ" },
  on_the_way: { color: "#B18CFF", bg: "#241A3D", label: "في الطريق" },
  delivered: { color: "#35D68C", bg: "#0F2E24", label: "تم التسليم" },
  cancelled: { color: "#FF6B6B", bg: "#3A1616", label: "ملغي" },
};

// وصف الأوردر بيتحول لطابع زمني بالمللي ثانية عشان نحسب "من قد إيه"
function timeAgo(isoTs) {
  const ts = new Date(isoTs).getTime();
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `من ${mins} دقيقة`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `من ${hrs} ساعة`;
  const days = Math.round(hrs / 24);
  return `من ${days} يوم`;
}

export default function CustomerScreen({ profile, onLogout }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("new"); // 'new' | 'orders'
  const [form, setForm] = useState({
    area: "",
    description: "",
    location: "",
    phone: profile?.phone || "",
    price: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [minPrice, setMinPrice] = useState(null);

  // عروض الدليفريين المعلّقة على أوردرات العميل ده — key = order_id, value = مصفوفة عروض
  const [offersByOrder, setOffersByOrder] = useState({});
  const [acceptingOfferId, setAcceptingOfferId] = useState(null);

  // اقتراح سعر تاني على عرض دليفري معيّن — بدل ما العميل يقبل أو يسيب بس
  const [counterOpenId, setCounterOpenId] = useState(null); // id العرض اللي فاتح فيه حقل الرد دلوقتي
  const [counterDraft, setCounterDraft] = useState({}); // key = offer_id, value = نص الحقل
  const [counteringId, setCounteringId] = useState(null);

  const activeCount = orders.filter(
    (o) => o.status !== "delivered" && o.status !== "cancelled"
  ).length;

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(t);
  }, [banner]);

  // تحميل الحد الأدنى لسعر التوصيل من إعدادات الأدمن — بنستخدمه كقيمة
  // مبدئية لحقل السعر وكـ hint للعميل
  useEffect(() => {
    let ignore = false;
    supabase
      .from("app_settings")
      .select("min_delivery_price")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (ignore || error || !data) return;
        setMinPrice(data.min_delivery_price);
        setForm((f) => (f.price ? f : { ...f, price: String(data.min_delivery_price) }));
      });
    return () => {
      ignore = true;
    };
  }, []);

  // عروض الدليفريين المعلّقة على كل أوردرات العميل (عبر RPC آمن — شوف
  // customer-offers-rpc.sql — عشان نقدر نعرض اسم/تليفون كل دليفري)
  const fetchOffers = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_pending_offers");
    if (error) return;
    const map = {};
    (data || []).forEach((row) => {
      if (!map[row.order_id]) map[row.order_id] = [];
      map[row.order_id].push(row);
    });
    setOffersByOrder(map);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    fetchOffers();
  }, [profile?.id, fetchOffers]);

  // الاستماع اللايف لأي تغيير في عروض الدليفريين على أوردرات العميل ده —
  // Realtime بيحترم RLS تلقائي فمش هيوصلنا غير صفوف أوردراته هو، وأي
  // تغيير (عرض جديد / تعديل / قبول / رفض) بنعيد تحميل القايمة كاملة
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`customer-offers-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_offers" },
        () => fetchOffers()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, fetchOffers]);

  // تحميل الأماكن المتاحة للشغل اللي الأدمن ضايفها (عشان العميل يختار منها)
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

  // تحميل أول دفعة من أوردرات العميل من Supabase
  useEffect(() => {
    if (!profile?.id) return;
    let ignore = false;
    setLoading(true);
    supabase
      .from("orders")
      .select("*")
      .eq("customer_id", profile.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (ignore) return;
        if (error) {
          setBanner({ type: "cancel", text: "معرفناش نحمّل الأوردرات، حاول تاني" });
        } else {
          setOrders(data || []);
        }
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [profile?.id]);

  // الاستماع اللايف لأي تغيير في أوردرات العميل ده تحديداً (Supabase Realtime)
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`customer-orders-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `customer_id=eq.${profile.id}`,
        },
        (payload) => {
          setOrders((prev) => {
            if (payload.eventType === "INSERT") {
              if (prev.some((o) => o.id === payload.new.id)) return prev;
              return [payload.new, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              return prev.map((o) => (o.id === payload.new.id ? payload.new : o));
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((o) => o.id !== payload.old.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const canSubmit =
    form.area.trim() &&
    form.description.trim() &&
    form.location.trim() &&
    form.phone.trim() &&
    Number(form.price) > 0;

  const submitOrder = async (e) => {
    e.preventDefault();
    if (!canSubmit || submitting || !profile?.id) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from("orders")
      .insert({
        customer_id: profile.id,
        description: form.description.trim(),
        area: form.area.trim(),
        location: form.location.trim(),
        phone: form.phone.trim(),
        price: Number(form.price),
        status: "new",
      })
      .select()
      .single();
    setSubmitting(false);

    if (error) {
      setBanner({
        type: "cancel",
        text: error.message?.includes("سعر التوصيل")
          ? error.message
          : "معرفناش نبعت الأوردر، حاول تاني",
      });
      return;
    }

    setOrders((prev) => (prev.some((o) => o.id === data.id) ? prev : [data, ...prev]));
    setForm((f) => ({
      area: "",
      description: "",
      location: "",
      phone: f.phone,
      price: minPrice != null ? String(minPrice) : "",
    }));
    setBanner({ type: "success", text: "الأوردر اتبعت، هنلاقيك دليفري في أقرب وقت" });
    setTab("orders");
  };

  const cancelOrder = async (id) => {
    const prevOrders = orders;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id && o.status !== "delivered" && o.status !== "cancelled"
          ? { ...o, status: "cancelled" }
          : o
      )
    );

    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("customer_id", profile.id);

    if (error) {
      setOrders(prevOrders);
      setBanner({ type: "cancel", text: "معرفناش نلغي الأوردر، حاول تاني" });
      return;
    }
    setBanner({ type: "cancel", text: "تم إلغاء الأوردر" });
  };

  // العميل بيقبل عرض سعر معيّن من دليفري (عبر RPC آمن بيقفل الأوردر
  // ويرفض باقي العروض المعلّقة تلقائي — شوف customer_accept_offer في السكريما)
  const acceptOffer = async (offer) => {
    if (acceptingOfferId) return;
    setAcceptingOfferId(offer.id);
    const { data, error } = await supabase.rpc("customer_accept_offer", {
      p_offer_id: offer.id,
    });
    setAcceptingOfferId(null);

    if (error || !data) {
      setBanner({
        type: "cancel",
        text: error?.message || "معرفناش نقبل العرض، حاول تاني",
      });
      fetchOffers();
      return;
    }

    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    setOffersByOrder((prev) => {
      const next = { ...prev };
      delete next[data.id];
      return next;
    });
    setBanner({
      type: "success",
      text: `تم قبول عرض ${offer.courier_name} بـ ${Number(offer.offered_price).toFixed(0)} ج.م`,
    });
  };

  // العميل بيرد على عرض دليفري بسعر تاني (بدل ما يقبله على طول) — يقدر
  // يستخدمها أكتر من مرة على نفس العرض، والدليفري كمان يقدر يرد تاني،
  // من غير حد أقصى لعدد المرات لحد ما حد الطرفين يقبل.
  const counterOffer = async (offer) => {
    const raw = counterDraft[offer.id];
    const price = parseFloat(raw);
    if (!raw || Number.isNaN(price) || price <= 0) {
      setBanner({ type: "cancel", text: "اكتب سعر صحيح أكبر من صفر" });
      return;
    }
    setCounteringId(offer.id);
    const { data, error } = await supabase.rpc("customer_counter_offer", {
      p_offer_id: offer.id,
      p_price: price,
    });
    setCounteringId(null);

    if (error || !data) {
      setBanner({ type: "cancel", text: error?.message || "معرفناش نبعت ردك، حاول تاني" });
      return;
    }
    setOffersByOrder((prev) => {
      const list = prev[data.order_id] || [];
      return {
        ...prev,
        [data.order_id]: list.map((o) => (o.id === data.id ? { ...o, ...data } : o)),
      };
    });
    setCounterOpenId(null);
    setBanner({ type: "success", text: `تم إرسال ردك بـ ${price} جنيه لـ ${offer.courier_name}` });
  };

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

        /* -------- loading -------- */
        .loading-wrap {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; padding: 90px 24px; color: var(--muted); text-align: center;
        }
        .spin { animation: spin 0.9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

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

        /* -------- new order form -------- */
        .form-card {
          background: var(--navy-2); border: 1px solid var(--navy-line);
          border-radius: 18px; padding: 18px; margin-bottom: 16px;
        }
        .form-card-title {
          font-family: 'Changa', sans-serif; font-size: 18px; font-weight: 700;
          margin-bottom: 4px;
        }
        .form-card-sub { font-size: 12.5px; color: var(--muted); margin-bottom: 16px; line-height: 1.7; }
        .form-group { margin-bottom: 12px; }
        .form-label {
          font-size: 12px; font-weight: 700; color: var(--muted); margin-bottom: 7px;
          display: flex; align-items: center; gap: 6px;
        }
        .form-label svg { color: var(--gold-2); flex-shrink: 0; }
        .form-label-hint { color: var(--muted-2); font-weight: 600; font-size: 11px; margin-right: 4px; }
        .field-note { font-size: 11.5px; color: var(--muted-2); margin-top: 6px; line-height: 1.6; }
        .field-textarea, .field-input {
          width: 100%; background: var(--navy-3); border: 1px solid var(--navy-line);
          border-radius: 12px; padding: 12px 14px; color: var(--white);
          font-family: 'Cairo', sans-serif; font-size: 14px; font-weight: 500;
          outline: none; transition: border-color 0.2s ease;
        }
        .field-textarea::placeholder, .field-input::placeholder { color: var(--muted-2); }
        .field-textarea:focus, .field-input:focus { border-color: var(--gold-2); }
        .field-textarea { resize: none; min-height: 74px; line-height: 1.7; }
        select.field-input { cursor: pointer; appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2393A0B8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>");
          background-repeat: no-repeat; background-position: left 14px center; padding-left: 34px; }
        select.field-input option { background: var(--navy-3); color: var(--white); }

        .btn-submit {
          width: 100%; border: none; border-radius: 12px; padding: 13px;
          font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 14.5px;
          background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: var(--navy);
          display: flex; align-items: center; justify-content: center; gap: 8px;
          cursor: pointer; transition: transform 0.15s ease, opacity 0.15s ease;
          box-shadow: 0 8px 20px -8px rgba(242,183,5,0.55);
          margin-top: 6px;
        }
        .btn-submit:active { transform: scale(0.97); }
        .btn-submit:disabled {
          opacity: 0.4; cursor: not-allowed; box-shadow: none;
        }

        /* -------- order card -------- */
        .order-card {
          background: var(--navy-2); border: 1px solid var(--navy-line);
          border-radius: 16px; padding: 16px; margin-bottom: 12px;
          animation: rise 0.4s ease both;
        }
        @keyframes rise { from { opacity:0; transform: translateY(8px);} to {opacity:1; transform: translateY(0);} }
        .order-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
        .order-desc { font-size: 15px; font-weight: 700; line-height: 1.6; }
        .status-badge {
          display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
          border-radius: 999px; font-size: 11.5px; font-weight: 800; white-space: nowrap; flex-shrink: 0;
        }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; }
        .order-meta { font-size: 13px; color: var(--muted); display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; }
        .order-meta-row { display: flex; align-items: center; gap: 7px; }
        .order-meta-row svg { flex-shrink: 0; color: var(--gold-2); }
        .order-time { font-size: 11.5px; color: var(--muted-2); margin-top: 10px; display: flex; align-items: center; gap: 5px; }
        .order-price-row { color: var(--gold-2); font-weight: 700; }
        .order-price-row svg { color: var(--gold-2); }

        /* -------- offers section -------- */
        .offers-section {
          margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--navy-line);
        }
        .offers-title {
          display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 800;
          color: var(--gold); margin-bottom: 10px;
        }
        .offer-row {
          display: flex; flex-direction: column; gap: 10px;
          background: var(--navy-3); border: 1px solid var(--navy-line);
          border-radius: 12px; padding: 10px 12px; margin-bottom: 8px;
        }
        .offer-row-info { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .offer-courier-name {
          display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: var(--white);
        }
        .offer-courier-name svg { color: var(--gold-2); flex-shrink: 0; }
        .offer-price { font-size: 15px; font-weight: 900; color: var(--gold); font-family: 'Cairo', sans-serif; }
        .offer-wait-note {
          font-size: 11.5px; font-weight: 700; color: var(--muted);
          background: var(--navy-2); border: 1px solid var(--navy-line);
          border-radius: 8px; padding: 6px 9px; line-height: 1.6;
        }
        .offer-row-actions { display: flex; gap: 8px; }
        .btn-accept-offer {
          flex: 1; border: none; border-radius: 10px; padding: 9px 12px;
          background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: var(--navy);
          font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 12px;
          display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;
          white-space: nowrap;
        }
        .btn-accept-offer:active { transform: scale(0.96); }
        .btn-accept-offer:disabled { opacity: 0.6; cursor: not-allowed; }

        .btn-counter-toggle {
          flex: 1; border: 1px solid var(--gold-2); background: transparent; color: var(--gold-2);
          border-radius: 10px; padding: 9px 12px; font-family: 'Cairo', sans-serif;
          font-weight: 800; font-size: 12px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap;
        }
        .btn-counter-toggle:active { transform: scale(0.97); }

        .offer-form {
          display: flex; gap: 8px; animation: rise 0.25s ease both;
        }
        .offer-input {
          flex: 1; min-width: 0; background: var(--navy); border: 1px solid var(--navy-line);
          color: var(--white); border-radius: 12px; padding: 11px 12px; font-size: 14px;
          font-family: 'Cairo', sans-serif; font-weight: 700;
        }
        .offer-input:focus { outline: none; border-color: var(--gold-2); }
        .btn-offer-submit {
          flex-shrink: 0; border: none; border-radius: 12px; padding: 0 16px;
          background: var(--gold); color: var(--navy); font-family: 'Cairo', sans-serif;
          font-weight: 800; font-size: 13px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .btn-offer-submit:active { transform: scale(0.96); }
        .btn-offer-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        .btn-cancel-order {
          margin-top: 12px; width: 100%; border: 1px solid var(--status-cancel);
          background: var(--status-cancel-bg); color: var(--status-cancel);
          border-radius: 11px; padding: 10px; font-weight: 800; font-size: 13px;
          display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;
          font-family: 'Cairo', sans-serif;
        }
        .btn-cancel-order:active { transform: scale(0.97); }

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
          font-family: 'Cairo', sans-serif;
        }

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
              {profile?.full_name ? `أهلاً يا ${profile.full_name}` : "واجهة العميل"}
            </div>
          </div>
        </div>
        <div className="header-actions">
          <div className="stat-pill">
            <span className="stat-num">{activeCount}</span>
            <span className="stat-label">أوردر شغال</span>
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
          className={`seka-tab ${tab === "new" ? "on" : ""}`}
          onClick={() => setTab("new")}
        >
          <FileText size={15} /> اطلب دلوقتي
        </button>
        <button
          className={`seka-tab ${tab === "orders" ? "on" : ""}`}
          onClick={() => setTab("orders")}
        >
          أوردراتي
          <span className="badge-count">{orders.length}</span>
        </button>
      </div>

      <div className="seka-body">
        {loading ? (
          <div className="loading-wrap">
            <Loader2 size={28} className="spin" />
            <div>بنحمّل أوردراتك...</div>
          </div>
        ) : (
          <>
            {tab === "new" && (
              <NewOrderForm
                form={form}
                setForm={setForm}
                onSubmit={submitOrder}
                canSubmit={canSubmit}
                submitting={submitting}
                locations={locations}
                locationsLoading={locationsLoading}
                minPrice={minPrice}
              />
            )}

            {tab === "orders" &&
              (orders.length === 0 ? (
                <div className="empty-wrap">
                  <div className="empty-icon">
                    <Package size={28} />
                  </div>
                  <div className="empty-title">لسه معملتش أي أوردر</div>
                  <div className="empty-sub">
                    اكتب أول أوردر ليك، وحد من الدليفريز هياخده ويوصله لحد بابك.
                  </div>
                  <button className="empty-cta" onClick={() => setTab("new")}>
                    اطلب دلوقتي
                  </button>
                </div>
              ) : (
                <OrdersList
                  orders={orders}
                  onCancel={cancelOrder}
                  offersByOrder={offersByOrder}
                  onAcceptOffer={acceptOffer}
                  acceptingOfferId={acceptingOfferId}
                  counterOpenId={counterOpenId}
                  setCounterOpenId={setCounterOpenId}
                  counterDraft={counterDraft}
                  setCounterDraft={setCounterDraft}
                  onCounterOffer={counterOffer}
                  counteringId={counteringId}
                />
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

function NewOrderForm({
  form,
  setForm,
  onSubmit,
  canSubmit,
  submitting,
  locations,
  locationsLoading,
  minPrice,
}) {
  return (
    <form className="form-card" onSubmit={onSubmit}>
      <div className="form-card-title">اطلب دلوقتي</div>
      <div className="form-card-sub">
        اكتب وصف الأوردر ومكان التسليم، وحد من الدليفريز هياخده ويوصله لحد بابك.
      </div>

      <div className="form-group">
        <div className="form-label">
          <Package size={14} /> وصف الأوردر
        </div>
        <textarea
          className="field-textarea"
          placeholder="مثال: توصيل أكل من مطعم كذا، أو استلام مستندات..."
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>

      <div className="form-group">
        <div className="form-label">
          <MapPin size={14} /> المكان
        </div>
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
            className="field-input"
            value={form.area}
            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
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

      <div className="form-group">
        <div className="form-label">
          <MapPin size={14} /> تفاصيل العنوان
        </div>
        <input
          className="field-input"
          type="text"
          placeholder="العنوان بالتفصيل عشان الدليفري يلاقيك بسهولة"
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
        />
      </div>

      <div className="form-group">
        <div className="form-label">
          <Phone size={14} /> رقم التليفون
        </div>
        <input
          className="field-input"
          type="tel"
          placeholder="رقمك عشان الدليفري يتواصل معاك"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
      </div>

      <div className="form-group">
        <div className="form-label">
          <Tag size={14} /> سعر التوصيل المقترح
          {minPrice != null && (
            <span className="form-label-hint">(الحد الأدنى {Number(minPrice).toFixed(0)} ج.م)</span>
          )}
        </div>
        <input
          className="field-input"
          type="number"
          inputMode="decimal"
          min={minPrice ?? 0}
          step="0.5"
          placeholder="اكتب السعر اللي مستعد تدفعه للتوصيل"
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
        />
        <div className="field-note">
          الدليفري يقدر يقبل بالسعر ده على طول، أو يقترحلك سعر تاني وتختار.
        </div>
      </div>

      <button className="btn-submit" type="submit" disabled={!canSubmit || submitting}>
        {submitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
        {submitting ? "بيتبعت..." : "ابعت الأوردر"}
      </button>
    </form>
  );
}

function OrdersList({
  orders,
  onCancel,
  offersByOrder,
  onAcceptOffer,
  acceptingOfferId,
  counterOpenId,
  setCounterOpenId,
  counterDraft,
  setCounterDraft,
  onCounterOffer,
  counteringId,
}) {
  const sorted = [...orders].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
  return (
    <div>
      {sorted.map((o) => {
        const style = STATUS_STYLE[o.status];
        const cancellable = o.status !== "delivered" && o.status !== "cancelled";
        const offers = o.status === "new" ? offersByOrder?.[o.id] || [] : [];
        return (
          <div className="order-card" key={o.id}>
            <div className="order-top">
              <div className="order-desc">{o.description}</div>
              <span
                className="status-badge"
                style={{ background: style.bg, color: style.color }}
              >
                <span className="status-dot" style={{ background: style.color }} />
                {style.label}
              </span>
            </div>
            <div className="order-meta">
              {o.price != null && (
                <div className="order-meta-row order-price-row">
                  <Tag size={15} />
                  <span>سعر التوصيل: {Number(o.price).toFixed(0)} ج.م</span>
                </div>
              )}
              <div className="order-meta-row">
                <MapPin size={15} />
                <span>{o.area ? `${o.area} — ${o.location}` : o.location}</span>
              </div>
              <div className="order-meta-row">
                <Phone size={15} />
                <span>{o.phone}</span>
              </div>
            </div>
            <div className="order-time">
              <Clock size={12} /> {timeAgo(o.created_at)}
            </div>

            {offers.length > 0 && (
              <div className="offers-section">
                <div className="offers-title">
                  العروض المقترحة <span className="badge-count">{offers.length}</span>
                </div>
                {offers.map((offer) => {
                  const counterIsOpen = counterOpenId === offer.id;
                  const draftValue =
                    counterDraft?.[offer.id] !== undefined
                      ? counterDraft[offer.id]
                      : String(offer.offered_price);
                  const countering = counteringId === offer.id;
                  const youCountered = offer.last_action_by === "customer";
                  return (
                    <div className="offer-row" key={offer.id}>
                      <div className="offer-row-info">
                        <div className="offer-courier-name">
                          <Truck size={14} /> {offer.courier_name || "دليفري"}
                        </div>
                        <div className="offer-price">
                          {Number(offer.offered_price).toFixed(0)} ج.م
                        </div>
                      </div>

                      {youCountered && (
                        <div className="offer-wait-note">
                          بعتّله ردك، في انتظار رد الدليفري
                        </div>
                      )}

                      <div className="offer-row-actions">
                        <button
                          className="btn-accept-offer"
                          disabled={acceptingOfferId === offer.id}
                          onClick={() => onAcceptOffer(offer)}
                        >
                          {acceptingOfferId === offer.id ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <CheckCircle2 size={14} />
                          )}
                          اقبل العرض ده
                        </button>

                        <button
                          className="btn-counter-toggle"
                          onClick={() =>
                            setCounterOpenId(counterIsOpen ? null : offer.id)
                          }
                        >
                          <Pencil size={13} />
                          اقترح سعر تاني
                          <ChevronDown
                            size={13}
                            style={{
                              transform: counterIsOpen ? "rotate(180deg)" : "none",
                              transition: "transform 0.2s ease",
                            }}
                          />
                        </button>
                      </div>

                      {counterIsOpen && (
                        <div className="offer-form">
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.5"
                            className="offer-input"
                            placeholder="اكتب السعر اللي تقترحه (ج.م)"
                            value={draftValue}
                            disabled={countering}
                            onChange={(e) =>
                              setCounterDraft((prev) => ({
                                ...prev,
                                [offer.id]: e.target.value,
                              }))
                            }
                          />
                          <button
                            className="btn-offer-submit"
                            disabled={countering}
                            onClick={() => onCounterOffer(offer)}
                          >
                            {countering ? (
                              <Loader2 size={15} className="spin" />
                            ) : (
                              <Send size={15} />
                            )}
                            ابعت ردك
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {cancellable && (
              <button className="btn-cancel-order" onClick={() => onCancel(o.id)}>
                <X size={14} /> إلغاء الأوردر
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
