import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { initDeepLinks } from "./lib/deepLinks.js";

// بيسجّل listener لروابط استرجاع كلمة السر لو التطبيق شغّال جوه
// Capacitor (أندرويد حقيقي). على الويب (PWA عادي) الدالة دي مالهاش
// أي تأثير خالص.
initDeepLinks();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
