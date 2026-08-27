import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      // صفحة الأدمن (admin.html) دي Entry منفصلة تماماً عن الأبليكيشن
      // (index.html) — بندل مستقل، رابط مستقل، ومحدش من العميل/الدليفري
      // بيوصلها أو يعرف إنها موجودة أصلاً.
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
});
