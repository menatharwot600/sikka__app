// =====================================================================
// سكة (Sikka) — اختبار سيناريوهات التزامن (نسخة تفاعلية)
//
// النسخة دي بتسألك البيانات المطلوبة وإنت شغّلها، مش محتاج تظبط
// أي env variables بنفسك. شغّلها بدبل كليك على run-test.bat في جذر
// المشروع (أسهل طريقة)، أو من التيرمينال:
//   node concurrency-tests/interactive.mjs
// =====================================================================

import { createClient } from "@supabase/supabase-js";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = readline.createInterface({ input: stdin, output: stdout });

async function ask(question, { optional = false } = {}) {
  while (true) {
    const answer = (await rl.question(question)).trim();
    if (answer || optional) return answer;
    console.log("  ⚠️  الحقل ده لازم يتملى، جرّب تاني.");
  }
}

async function signedInClient(url, anonKey, email, password) {
  const client = createClient(url, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`فشل تسجيل دخول ${email}: ${error.message}`);
  return client;
}

async function createOrder(customerClient) {
  const {
    data: { user },
  } = await customerClient.auth.getUser();
  const { data: settings } = await customerClient
    .from("app_settings")
    .select("min_delivery_price")
    .eq("id", 1)
    .maybeSingle();
  const price = Number(settings?.min_delivery_price ?? 10);
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
  console.log(`\n--- ${label} ---`);
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && !r.value.error) {
      console.log(`  [${i}] ✅ نجح`);
    } else {
      const msg = r.status === "fulfilled" ? r.value.error?.message : r.reason?.message;
      console.log(`  [${i}] ❌ فشل: ${msg}`);
    }
  });
  return { succeeded };
}

async function scenario1(customer, courier1, courier2) {
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

async function scenario2(customer, courier1) {
  const order = await createOrder(customer);
  const { data: offer, error: offerErr } = await courier1.rpc("submit_or_update_offer", {
    p_order_id: order.id,
    p_price: Number(order.price) + 5,
  });
  if (offerErr) throw new Error(`فشل تقديم عرض: ${offerErr.message}`);

  const results = await Promise.allSettled([
    courier1.rpc("courier_accept_order", { p_order_id: order.id }),
    customer.rpc("customer_accept_offer", { p_offer_id: offer.id }),
  ]);
  const { succeeded } = summarize(
    "سيناريو 2: دليفري يقبل بالسعر الأصلي والعميل بيقبل عرض في نفس اللحظة",
    results
  );
  console.log(
    succeeded.length === 1
      ? "✅ PASS — نجحت عملية واحدة بس"
      : `❌ FAIL — المفروض تنجح عملية واحدة بس، نجح ${succeeded.length}`
  );
}

async function scenario4(url, serviceRoleKey, customer, courier1, courierId1) {
  if (!serviceRoleKey) {
    console.log("\n--- سيناريو 4: رصيد المحفظة غير كافي ---");
    console.log("⏭️  اتقفز — ماحطتش service role key.");
    return;
  }
  const admin = createClient(url, serviceRoleKey.trim());

  const { data: settings, error: settingsErr } = await admin
    .from("app_settings")
    .select("commission_amount")
    .eq("id", 1)
    .single();

  if (settingsErr || !settings) {
    console.log("\n--- سيناريو 4: رصيد المحفظة غير كافي ---");
    console.log(`❌ فشل قراءة app_settings بالـ service_role key: ${settingsErr?.message ?? "الصف رجع فاضي"}`);
    console.log(
      "   الغالب إن service_role key اللي اتلصق مش صحيح (كوبي/بيست فيه مسافة أو سطر زيادة)،" +
        "\n   أو اتلصق anon key بالغلط بدل service_role. راجعه من Settings > API > service_role وجرّب تاني."
    );
    return;
  }
  const fee = Number(settings.commission_amount);

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
  console.log("=".repeat(60));
  console.log("اختبار سيناريوهات التزامن — سكة");
  console.log("هسألك كام سؤال بسيط، وبعدين هشغّل الاختبار لوحدي.");
  console.log("=".repeat(60));

  console.log("\n📍 من Supabase Dashboard > Settings > API:");
  const url = await ask("Project URL (مثال: https://xxxx.supabase.co): ");
  const anonKey = await ask("anon public key: ");

  console.log("\n👤 بيانات الحسابات التجريبية (اللي عملتهم في التطبيق):");
  const customerEmail = await ask("إيميل حساب العميل: ");
  const customerPassword = await ask("باسورد حساب العميل: ");
  const courier1Email = await ask("إيميل حساب الدليفري الأول: ");
  const courier1Password = await ask("باسورد حساب الدليفري الأول: ");
  const courier2Email = await ask("إيميل حساب الدليفري التاني: ");
  const courier2Password = await ask("باسورد حساب الدليفري التاني: ");

  console.log(
    "\n🔑 service_role key (اختياري — بس لازم لسيناريو رصيد المحفظة." +
      "\n   من Settings > API > service_role. سيبه فاضي وسيب Enter لو مش عايز تختبر السيناريو ده):"
  );
  const serviceRoleKey = await ask("service_role key (اختياري): ", { optional: true });

  rl.close();

  console.log("\nبنسجّل دخول الحسابات...");
  const customer = await signedInClient(url, anonKey, customerEmail, customerPassword);
  const courier1 = await signedInClient(url, anonKey, courier1Email, courier1Password);
  const courier2 = await signedInClient(url, anonKey, courier2Email, courier2Password);

  const {
    data: { user: courier1User },
  } = await courier1.auth.getUser();

  await scenario1(customer, courier1, courier2);
  await scenario2(customer, courier1);
  await scenario4(url, serviceRoleKey, customer, courier1, courier1User.id);

  console.log("\n" + "=".repeat(60));
  console.log("خلصنا. راجع النتايج فوق — أي ❌ FAIL ابعتهولي زي ما هو.");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("\n💥 حصل خطأ:", err.message);
  process.exitCode = 1;
});
