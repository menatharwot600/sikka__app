// =====================================================================
// سكة (Sikka) — اختبار سيناريوهات التزامن (Concurrency)
//
// السكريبت ده بيشغّل نفس السيناريوهات المذكورة في خطوة 6 من
// PRICING_NEGOTIATION_PLAN.md فعليًا ضد Supabase مشروعك، مش تخمين.
// بيستخدم @supabase/supabase-js (موجودة أصلاً في package.json).
//
// شغّله من جذر المشروع بعد `npm install`:
//   node concurrency-tests/run.mjs
//
// راجع concurrency-tests/README.md للإعداد المطلوب قبل التشغيل
// (حسابات تجريبية، الـ env vars).
// =====================================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // اختياري — لازم بس لسيناريو رصيد المحفظة

const CUSTOMER = { email: process.env.TEST_CUSTOMER_EMAIL, password: process.env.TEST_CUSTOMER_PASSWORD };
const COURIER_1 = { email: process.env.TEST_COURIER1_EMAIL, password: process.env.TEST_COURIER1_PASSWORD };
const COURIER_2 = { email: process.env.TEST_COURIER2_EMAIL, password: process.env.TEST_COURIER2_PASSWORD };

function must(v, name) {
  if (!v) {
    console.error(`❌ ناقص env var: ${name} — شوف concurrency-tests/README.md`);
    process.exit(1);
  }
  return v;
}

must(SUPABASE_URL, "SUPABASE_URL");
must(SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY");
must(CUSTOMER.email, "TEST_CUSTOMER_EMAIL");
must(COURIER_1.email, "TEST_COURIER1_EMAIL");
must(COURIER_2.email, "TEST_COURIER2_EMAIL");

async function signedInClient(creds) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInWithPassword(creds);
  if (error) throw new Error(`فشل تسجيل دخول ${creds.email}: ${error.message}`);
  return client;
}

async function createOrder(customerClient, priceHint) {
  const {
    data: { user },
  } = await customerClient.auth.getUser();
  const { data: settings } = await customerClient
    .from("app_settings")
    .select("min_delivery_price")
    .eq("id", 1)
    .maybeSingle();
  const price = priceHint ?? Number(settings?.min_delivery_price ?? 10);
  const { data, error } = await customerClient
    .from("orders")
    .insert({
      customer_id: user.id,
      description: "اختبار تزامن — سكة",
      area: "اختبار",
      location: "اختبار",
      phone: "01000000000",
      price,
      status: "new",
    })
    .select()
    .single();
  if (error) throw new Error(`فشل إنشاء أوردر: ${error.message}`);
  return data;
}

function summarize(label, results) {
  const succeeded = results.filter((r) => r.status === "fulfilled" && !r.value.error);
  const failed = results.filter((r) => r.status !== "fulfilled" || r.value.error);
  console.log(`\n--- ${label} ---`);
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && !r.value.error) {
      console.log(`  [${i}] ✅ نجح`);
    } else {
      const msg = r.status === "fulfilled" ? r.value.error?.message : r.reason?.message;
      console.log(`  [${i}] ❌ فشل: ${msg}`);
    }
  });
  return { succeeded, failed };
}

async function scenarioA(customer, courier1, courier2) {
  const order = await createOrder(customer);
  const results = await Promise.allSettled([
    courier1.rpc("courier_accept_order", { p_order_id: order.id }),
    courier2.rpc("courier_accept_order", { p_order_id: order.id }),
  ]);
  const { succeeded } = summarize("سيناريو 1: دليفريان يقبلوا نفس الأوردر في نفس اللحظة", results);
  console.log(
    succeeded.length === 1
      ? "✅ PASS — نجح واحد بس، زي المتوقع"
      : `❌ FAIL — المفروض ينجح واحد بس، نجح ${succeeded.length}`
  );
}

async function scenarioB(customer, courier1) {
  const order = await createOrder(customer);
  const { data: offer, error: offerErr } = await courier1.rpc("submit_or_update_offer", {
    p_order_id: order.id,
    p_price: Number(order.price) + 5,
  });
  if (offerErr) throw new Error(`فشل تقديم عرض: ${offerErr.message}`);

  const results = await Promise.allSettled([
    courier1.rpc("courier_accept_order", { p_order_id: order.id }), // الدليفري يقبل بالسعر الأصلي
    customer.rpc("customer_accept_offer", { p_offer_id: offer.id }), // العميل يقبل عرضه في نفس اللحظة
  ]);
  const { succeeded } = summarize("سيناريو 2: دليفري يقبل بالسعر الأصلي والعميل بيقبل عرض في نفس اللحظة", results);
  console.log(
    succeeded.length === 1
      ? "✅ PASS — نجحت عملية واحدة بس"
      : `❌ FAIL — المفروض تنجح عملية واحدة بس، نجح ${succeeded.length}`
  );
}

async function scenarioC(customer, courier1, courierId1) {
  if (!SERVICE_ROLE_KEY) {
    console.log("\n--- سيناريو 4: رصيد المحفظة غير كافي ---");
    console.log("⏭️  اتقفز — محتاج SUPABASE_SERVICE_ROLE_KEY عشان أظبط رصيد الدليفري التجريبي على قيمة حدّية.");
    return;
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY.trim());

  const { data: settings, error: settingsErr } = await admin
    .from("app_settings")
    .select("commission_amount")
    .eq("id", 1)
    .single();

  if (settingsErr || !settings) {
    console.log("\n--- سيناريو 4: رصيد المحفظة غير كافي ---");
    console.log(`❌ فشل قراءة app_settings بالـ service_role key: ${settingsErr?.message ?? "الصف رجع فاضي"}`);
    console.log("   راجع الـ SUPABASE_SERVICE_ROLE_KEY (من Settings > API > service_role) وجرّب تاني.");
    return;
  }
  const fee = Number(settings.commission_amount);

  // نظبط رصيد الدليفري التجريبي بالظبط على قيمة العمولة — كافي لأوردر واحد بس
  const { error: updateErr } = await admin.from("profiles").update({ wallet_balance: fee }).eq("id", courierId1);
  if (updateErr) {
    console.log("\n--- سيناريو 4: رصيد المحفظة غير كافي ---");
    console.log(`❌ فشل تحديث رصيد الدليفري: ${updateErr.message}`);
    return;
  }

  const orderA = await createOrder(customer);
  const orderB = await createOrder(customer);

  const results = await Promise.allSettled([
    courier1.rpc("courier_accept_order", { p_order_id: orderA.id }),
    courier1.rpc("courier_accept_order", { p_order_id: orderB.id }),
  ]);
  const { succeeded } = summarize("سيناريو 4: نفس الدليفري يقبل أوردرين ورصيده يكفي واحد بس", results);

  const { data: finalProfile } = await admin.from("profiles").select("wallet_balance").eq("id", courierId1).single();
  const balanceOk = Number(finalProfile.wallet_balance) >= 0;

  console.log(
    succeeded.length === 1 && balanceOk
      ? `✅ PASS — نجح واحد بس، والرصيد النهائي (${finalProfile.wallet_balance}) مش بالسالب`
      : `❌ FAIL — نجح ${succeeded.length} (متوقع 1)، الرصيد النهائي: ${finalProfile.wallet_balance}`
  );
}

async function main() {
  console.log("بتسجّل دخول الحسابات التجريبية...");
  const customer = await signedInClient(CUSTOMER);
  const courier1 = await signedInClient(COURIER_1);
  const courier2 = await signedInClient(COURIER_2);

  const {
    data: { user: courier1User },
  } = await courier1.auth.getUser();

  await scenarioA(customer, courier1, courier2);
  await scenarioB(customer, courier1);
  await scenarioC(customer, courier1, courier1User.id);

  console.log("\nخلصنا. راجع النتائج فوق — أي ❌ FAIL محتاج مراجعة قبل ما تنزل التحديث.");
}

main().catch((err) => {
  console.error("\n💥 السكريبت وقع:", err.message);
  process.exit(1);
});
