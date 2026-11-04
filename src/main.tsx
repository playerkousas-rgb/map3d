import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./ui/App.tsx";
import { I18nProvider } from "./i18n";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ExportStatus } from "./components/ExportStatus";
import { Analytics } from "@vercel/analytics/react";

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <I18nProvider>
      <App />
      <ExportStatus />
    </I18nProvider>
    <Analytics />
  </AppErrorBoundary>
);
