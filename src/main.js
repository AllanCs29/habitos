import "./styles/animations.css";
import "./styles/app.css";
import { runtime, actions } from "./core/context.js";
import { initializeRuntime } from "./core/initialize.js";
import { features } from "./features/index.js";
import * as storage from "./services/storage.js";
import * as ai from "./services/ai.js";
import * as integrations from "./services/integrations.js";
import { installAccessibility } from "./services/accessibility.js";
import shell from "./views/shell.html?raw";
import onboarding from "./views/onboarding.html?raw";
import dialogs from "./views/dialogs.html?raw";
import today from "./views/today.html?raw";
import nutrition from "./views/nutrition.html?raw";
import focus from "./views/focus.html?raw";
import finance from "./views/finance.html?raw";
import tutor from "./views/tutor.html?raw";
import habits from "./views/habits.html?raw";
import gym from "./views/gym.html?raw";
import grocery from "./views/grocery.html?raw";
import settings from "./views/settings.html?raw";

document.getElementById("app").innerHTML = shell + onboarding + dialogs;
document.getElementById("appMain").innerHTML = [
  today,
  nutrition,
  focus,
  finance,
  tutor,
  habits,
  gym,
  grocery,
  settings,
].join("\n");
Object.assign(actions, features, storage, ai, integrations);
actions.closeMobileMenu = () => {
  if (innerWidth < 768) {
    document.getElementById("sidebarDrawer").classList.add("-translate-x-full");
    document.getElementById("sidebarOverlay").classList.add("hidden");
    document
      .getElementById("menuButton")
      .setAttribute("aria-expanded", "false");
  }
};
actions.runtimeUid = () => runtime.fbUser?.uid || "Sin sesión";
const downloadPDF = actions.triggerDirectHtml2PdfDownload;
actions.triggerDirectHtml2PdfDownload = async () => {
  try {
    window.html2pdf = (await import("html2pdf.js")).default;
    await downloadPDF();
  } catch (e) {
    actions.showToast("No se pudo generar el PDF: " + e.message, "error");
  }
};
// Compatibility bridge for the retained template event handlers. All actual logic is modular.
Object.assign(window, actions);
Object.defineProperty(window, "appState", { get: () => runtime.appState });
initializeRuntime();
window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  actions.showToast(
    event.reason?.message || "No se pudo completar la operación.",
    "error",
  );
});
window.addEventListener("popstate", () => {
  actions.switchTab(location.hash.slice(1) || "today");
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  runtime.deferredPwaInstallPrompt = event;
});
await storage.bootStorage();
actions.switchTab(location.hash.slice(1) || "today");
installAccessibility();
if (!new URLSearchParams(location.search).has("local"))
  await storage.initFirebaseIfConfigured();
else {
  document.getElementById("firebaseConfigInput").value = JSON.stringify(
    (await import("./firebase-config.js")).firebaseConfig,
    null,
    2,
  );
}
let lastToday = actions.getLocalTodayIso();
setInterval(() => {
  const today = actions.getLocalTodayIso();
  if (today !== lastToday) {
    if (runtime.appState.currentDay === lastToday) actions.selectDay(today);
    lastToday = today;
  }
  actions.checkAlarmsAndStreakRisk();
}, 10000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    actions.checkAlarmsAndStreakRisk();
    actions.renderAll();
  }
});
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(new URL("sw.js", document.baseURI), {
      scope: "./",
      updateViaCache: "none",
    })
    .then((reg) => {
      runtime.globalSwRegistration = reg;
    })
    .catch(() => {
      actions.showToast(
        "No se pudo preparar el modo sin conexión. Puedes seguir usando la app.",
        "warning",
      );
    });
}
