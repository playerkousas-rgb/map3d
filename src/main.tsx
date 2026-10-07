import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./ui/App.tsx";
import { I18nProvider } from "./i18n";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { Analytics } from "@vercel/analytics/react";

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <I18nProvider>
      <App />
    </I18nProvider>
    <Analytics />
  </AppErrorBoundary>
);
