import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";

// Native WKWebView has no browser chrome to undo a stuck zoom (iOS input-focus
// auto-zoom or an accidental pinch/double-tap traps the user). Lock scaling on
// native only; web keeps pinch-zoom for accessibility (WCAG).
if (Capacitor.isNativePlatform()) {
  const viewport = document.querySelector('meta[name="viewport"]');
  viewport?.setAttribute(
    "content",
    "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
  );
}

createRoot(document.getElementById("root")!).render(<App />);
