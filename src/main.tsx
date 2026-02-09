import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (import.meta.env.DEV) {
  const bootCount = Number(sessionStorage.getItem('__boot_count') ?? '0') + 1;
  sessionStorage.setItem('__boot_count', String(bootCount));
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  console.log('[boot]', {
    bootCount,
    navType: nav?.type,
    visibility: document.visibilityState,
  });

  window.addEventListener('pageshow', (e) => {
    console.log('[pageshow]', { persisted: (e as PageTransitionEvent).persisted });
  });
  window.addEventListener('pagehide', (e) => {
    console.log('[pagehide]', { persisted: (e as PageTransitionEvent).persisted });
  });
  document.addEventListener('visibilitychange', () => {
    console.log('[visibilitychange]', { visibility: document.visibilityState });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
