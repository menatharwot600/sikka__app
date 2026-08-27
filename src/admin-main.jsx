import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AdminApp from "./AdminApp.jsx";

// Entry مستقل بالكامل عن main.jsx/App.jsx بتاع أبليكيشن العميل والدليفري.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>
);
