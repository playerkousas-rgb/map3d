import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./ui/App.tsx";
import { I18nProvider } from "./i18n";

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
