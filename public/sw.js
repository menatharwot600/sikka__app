// Service Worker بسيط لـ "سكة": بيكاش الـ app shell بس (HTML/JS/CSS/الأيقونات)
// عشان التحميل يبقى أسرع في الزيارات اللي بعد كده، ولو النت قطع لحظة يفضل
// فيه واجهة تفتح. أي طلب لـ Supabase أو أي API خارجي بيتسحب من النت طول
// الوقت (Network only) — عشان بيانات الأوردرات والحسابات لازم تكون لحظية
// ومحدش يشوف بيانات قديمة متخزنة غلط.

const CACHE_NAME = "seka-shell-v1";
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/seka-icon-192.png",
  "/seka-icon-512.png",
  "/seka-logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // بس طلبات GET من نفس الأصل بنتعامل معاها؛ أي حاجة تانية (خصوصًا
  // Supabase وأي API خارجي) بتعدي على طول من غير ما الـ SW يلمسها
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      // Stale-while-revalidate: يورّي النسخة المخزّنة على طول لو موجودة
      // (أسرع)، وفي نفس الوقت بيحدّثها في الخلفية من النت
      return cached || network;
    })
  );
});
