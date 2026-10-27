import { runtime, actions } from "./context.js";
export function initializeRuntime() {
  runtime.globalAppIconPng = "";
  runtime.globalSwRegistration = null;
  runtime.DAY_NAMES_ES = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  runtime.DAY_LABELS_SHORT_ES = [
    "Dom",
    "Lun",
    "Mar",
    "Mié",
    "Jue",
    "Vie",
    "Sáb",
  ];
  runtime.DAY_SINGLE_SHORT_ES = ["D", "L", "M", "M", "J", "V", "S"];
  runtime.GOAL_LABELS = {
    deficit: "Pérdida de grasa corporal y definición (Déficit)",
    recomp: "Recomposición corporal (Perder grasa y ganar músculo)",
    hypertrophy: "Hipertrofia y ganancia de masa muscular limpia",
    bulk: "Volumen y aumento de fuerza máxima (Superávit)",
  };
  runtime.STORAGE_KEY = "allan_tcc_master_permanent_store";
  runtime.IDB_NAME = "ControlTCC_PermanentVault_DB";
  runtime.IDB_STORE = "state_vault";
  runtime.currentUploadedImageBase64 = null;
  runtime.currentTutorImageBase64 = null;
  runtime.currentModalEvidenceImages = [];
  runtime.activeFormatTaskIndex = null;
  runtime.alarmAudioInterval = null;
  runtime.celebrationTimeoutId = null;
  runtime.fbAuth = null;
  runtime.fbDb = null;
  runtime.fbUser = null;
  runtime.unsubscribeFirestore = null;
  runtime.isApplyingRemoteUpdate = false;
  runtime.isCloudHydrated = false;
  runtime.TAB_TITLES = {
    nutrition: "Nutrición",
    focus: "Trabajo & Agenda",
    finance: "Finanzas & Deudas",
    tutor: "Profe IA",
    habits: "Hábitos",
    gym: "Gimnasio",
    grocery: "Despensa",
    settings: "Ajustes",
  };
  runtime.lastSuccessfulModelEndpoint = "";
  runtime.lastSuccessfulProtocol = "";
  runtime.editingMealIndex = null;
  runtime.pomoSeconds = 25 * 60;
  runtime.pomoInterval = null;
  runtime.currentPdfTasksBuffer = [];
  runtime.activeTutorSubTab = "map";
  runtime.SVG_PADLOCK_CLOSED = `<svg viewBox="0 0 24 24" class="w-4 h-4 inline-block shrink-0 fill-none stroke-current" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path><circle cx="12" cy="16" r="1.2" fill="currentColor"></circle></svg>`;
  runtime.SVG_PADLOCK_OPEN = `<svg viewBox="0 0 24 24" class="w-4 h-4 inline-block shrink-0 fill-none stroke-current" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"></rect><path d="M8 11V7a4 4 0 0 1 7.5-1.8"></path><circle cx="12" cy="16" r="1.2" fill="currentColor"></circle></svg>`;
  runtime.breatheTimer = null;
  runtime.gymRestSeconds = 0;
  runtime.gymRestInterval = null;
  runtime.currentFocusSubTab = "agenda";
  runtime.pendingWorkInboxImageBase64 = null;
  runtime.currentFinanceSubTab = "cashflow";
  runtime.keepAliveAudioCtx = null;
  runtime.keepAliveWakeLock = null;
  runtime.keepAliveActive = false;
  runtime.deferredPwaInstallPrompt = null;

  runtime.DAYS_CONFIG = actions.buildDynamicDaysConfig();
  runtime.appState = actions.createDefaultState();
}
