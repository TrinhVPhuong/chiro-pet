import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { mockTauriApi } from "./mockTauri";

// Initialize mock if running in regular browser
mockTauriApi();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
