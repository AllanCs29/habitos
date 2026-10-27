import { runtime, actions } from "../core/context.js";
import * as domain from "../core/domain.js";
import DOMPurify from "dompurify";

export function updateMedicalCondition(val) {
  if (!runtime.appState.profile)
    runtime.appState.profile = actions.createDefaultState().profile;
  runtime.appState.profile.medicalCondition = (val || "").trim();
  actions.saveState();
  actions.showToast(
    "Condición / restricción actualizada en tu perfil",
    "success",
  );
}

export function updateNutritionGoalMode(goalKey) {
  if (!runtime.appState.profile)
    runtime.appState.profile = actions.createDefaultState().profile;
  runtime.appState.profile.goalKey = goalKey;
  runtime.appState.profile.goalText =
    runtime.GOAL_LABELS[goalKey] || runtime.GOAL_LABELS.deficit;
  actions.saveState();
  actions.showToast(
    `Modo nutricional ajustado: ${runtime.appState.profile.goalText}`,
    "success",
  );
}

export function toggleSidebar() {
  const drawer = document.getElementById("sidebarDrawer"),
    overlay = document.getElementById("sidebarOverlay");
  const open = drawer.classList.contains("-translate-x-full");
  drawer.classList.toggle("-translate-x-full", !open);
  overlay.classList.toggle("hidden", !open);
  document
    .getElementById("menuButton")
    ?.setAttribute("aria-expanded", String(open));
  if (open) drawer.querySelector("button")?.focus();
}

export function triggerElementSlideAnim(el, animClass = "section-anim-enter") {
  if (!el) return;
  el.classList.remove(animClass);
  void el.offsetWidth;
  el.classList.add(animClass);
  setTimeout(() => {
    if (el) el.classList.remove(animClass);
  }, 320);
}

export function switchNutritionSubTab(sub) {
  const macrosEl = document.getElementById("nutSubView-macros");
  const mealsWrap = document.getElementById("nutSubView-mealsWrap");
  const scannerEl = document.getElementById("nutSubView-scanner");
  const waterWrap = document.getElementById("nutSubView-waterWrap");
  const chefEl = document.getElementById("nutSubView-chef");

  const showMainTracker = sub === "macros" || sub === "scanner";
  if (macrosEl) macrosEl.classList.toggle("hidden", !showMainTracker);
  if (mealsWrap) mealsWrap.classList.remove("hidden");
  if (scannerEl) scannerEl.classList.remove("hidden");
  if (waterWrap) waterWrap.classList.remove("hidden");
  if (chefEl) chefEl.classList.toggle("hidden", sub !== "chef");

  if (sub === "scanner" && scannerEl) {
    setTimeout(() => {
      scannerEl.scrollIntoView({ behavior: "smooth", block: "center" });
      const inp = document.getElementById("aiFoodInput");
      if (inp) inp.focus();
    }, 60);
  } else if (sub === "macros" && macrosEl) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  ["macros", "scanner", "chef"].forEach((k) => {
    const btn = document.getElementById(`nsub-${k}`);
    if (btn) {
      btn.className =
        k === sub
          ? "py-2 px-2 rounded-xl bg-terra-500 text-white shadow-sm transition flex items-center justify-center gap-1.5"
          : "py-2 px-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1.5";
    }
  });
}

export function triggerStreakCelebration(title, subtitle) {
  const box = document.getElementById("streakCelebrationOverlay");
  box.replaceChildren();
  const card = document.createElement("div");
  card.className = "celebration-card";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const p = document.createElement("p");
  p.textContent = subtitle || "";
  card.append(strong, p);
  box.append(card);
  box.classList.remove("hidden");
  clearTimeout(runtime.celebrationTimeoutId);
  runtime.celebrationTimeoutId = setTimeout(
    () => box.classList.add("hidden"),
    2800,
  );
}

export function switchHabitSubView(sub) {
  ["today", "stats", "sos"].forEach((s) => {
    const vEl = document.getElementById(
      `habitView${s.charAt(0).toUpperCase() + s.slice(1)}`,
    );
    if (vEl) vEl.classList.add("hidden");
    const btn = document.getElementById(`hsub-${s}`);
    if (btn) btn.className = "py-2 rounded-xl text-slate-400 transition";
  });
  const activeView = document.getElementById(
    `habitView${sub.charAt(0).toUpperCase() + sub.slice(1)}`,
  );
  if (activeView) {
    activeView.classList.remove("hidden");
    actions.triggerElementSlideAnim(activeView, "subview-anim-enter");
  }
  const activeBtn = document.getElementById(`hsub-${sub}`);
  if (activeBtn)
    activeBtn.className =
      "py-2 rounded-xl bg-terra-500 text-white shadow-sm transition";
}

export function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

export function startAlarmSound() {
  actions.stopAlarmSound();
  actions.playBeep();
  if (navigator.vibrate) navigator.vibrate([400, 150, 400]);
  let count = 0;
  runtime.alarmAudioInterval = setInterval(() => {
    actions.playBeep();
    count++;
    if (count > 8) actions.stopAlarmSound();
  }, 1500);
}

export function stopAlarmSound() {
  if (runtime.alarmAudioInterval) {
    clearInterval(runtime.alarmAudioInterval);
    runtime.alarmAudioInterval = null;
  }
}

export function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `app-toast app-toast-${type}`;
  toast.role = type === "error" ? "alert" : "status";
  toast.textContent = String(message);
  container.append(toast);
  setTimeout(() => toast.remove(), type === "error" ? 9000 : 5000);
}

export function updateCloudUI() {
  const status = runtime.persistenceStatus || "local";
  const label =
    {
      local: "En este dispositivo",
      saving: "Guardando…",
      pending: "Pendiente de sincronizar",
      synced: "Sincronizado",
      error: "Revisar conexión",
      loading: "Cargando cuenta…",
      migration: "Historial recuperado · falta sincronizar",
    }[status] || status;
  for (const id of ["cloudStatusBadge", "firebaseAuthStatus"]) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = label;
      el.title = runtime.syncError || label;
      el.dataset.status = status;
    }
  }
  document
    .getElementById("authLoggedOutBox")
    .classList.toggle("hidden", !!runtime.fbUser);
  document
    .getElementById("authLoggedInBox")
    .classList.toggle("hidden", !runtime.fbUser);
  document.getElementById("authUserEmail").textContent =
    runtime.fbUser?.email || "";
  document.getElementById("drawerUserSubtitle").textContent =
    runtime.fbUser?.email || "Espacio local";
  const transfer = document.getElementById("importGuestButton");
  if (transfer) transfer.classList.toggle("hidden", !runtime.fbUser);
  const notice = document.getElementById("syncNotice");
  if (notice) {
    notice.textContent = runtime.syncError || "";
    notice.classList.toggle("hidden", !runtime.syncError || !runtime.fbUser);
  }
  const recovery = document.getElementById("legacyRecoveryNotice");
  recovery?.classList.toggle(
    "hidden",
    !runtime.fbUser || !runtime.legacyRecoveryAvailable,
  );
}

export function checkOnboarding() {
  document
    .getElementById("onboardingModal")
    .classList.toggle("hidden", !!runtime.appState.onboardingComplete);
}

export function dismissOnboardingModal() {
  runtime.appState.onboardingComplete = true;
  document.getElementById("onboardingModal").classList.add("hidden");
  actions.saveState();
}

export function openOnboardingEdit() {
  document.getElementById("obName").value = runtime.appState.profile.name || "";
  for (const [id, key] of [
    ["obWeight", "weight"],
    ["obHeight", "height"],
    ["obAge", "age"],
    ["obGymDays", "gymDays"],
    ["obMedical", "medicalCondition"],
  ])
    document.getElementById(id).value = runtime.appState.profile[key] || "";
  document.getElementById("onboardingModal").classList.remove("hidden");
}

export function applyPersonalDataFromOnboarding() {
  const p = runtime.appState.profile;
  p.name = document.getElementById("obName").value.trim().slice(0, 80);
  for (const [id, key, min, max] of [
    ["obWeight", "weight", 20, 400],
    ["obHeight", "height", 80, 250],
    ["obAge", "age", 13, 110],
    ["obGymDays", "gymDays", 1, 7],
  ]) {
    const value = document.getElementById(id).value;
    if (value && (Number(value) < min || Number(value) > max)) {
      actions.showToast(`Revisa el campo ${key}.`, "warning");
      return false;
    }
    if (value) p[key] = Number(value);
  }
  p.medicalCondition = document.getElementById("obMedical").value.trim();
  p.activity = Number(document.getElementById("obActivity").value) || 1.55;
  p.goalKey = document.getElementById("obGoal").value;
  p.goalText = runtime.GOAL_LABELS[p.goalKey] || p.goalText;
  runtime.appState.onboardingComplete = true;
  return true;
}

export function completeOnboarding() {
  if (!actions.applyPersonalDataFromOnboarding()) return;
  actions.saveState();
  document.getElementById("onboardingModal").classList.add("hidden");
  actions.switchTab("today");
  actions.showToast(
    "Tu espacio está listo. Puedes ajustar tus metas cuando quieras.",
    "success",
  );
}

export function applyTheme() {
  const html = document.documentElement;
  const btn = document.getElementById("themeBtn");
  if (runtime.appState.theme === "dark") {
    html.classList.add("dark");
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>`;
  } else {
    html.classList.remove("dark");
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg>`;
  }
}

export function toggleTheme() {
  runtime.appState.theme = runtime.appState.theme === "dark" ? "light" : "dark";
  actions.applyTheme();
  actions.saveState();
}

export function switchTab(tabName) {
  const allowed = [
    "today",
    "nutrition",
    "focus",
    "finance",
    "tutor",
    "habits",
    "gym",
    "grocery",
    "settings",
  ];
  if (!allowed.includes(tabName)) return;
  runtime.activeTab = tabName;
  for (const name of allowed) {
    document
      .getElementById(`tab-${name}`)
      ?.classList.toggle("hidden", name !== tabName);
    for (const node of document.querySelectorAll(`[data-nav="${name}"]`)) {
      node.classList.toggle("nav-active", name === tabName);
      node.setAttribute("aria-current", name === tabName ? "page" : "false");
    }
  }
  const labels = {
    today: "Hoy",
    nutrition: "Alimentación",
    focus: "Trabajo",
    finance: "Finanzas",
    tutor: "Aprender",
    habits: "Hábitos",
    gym: "Entrenar",
    grocery: "Despensa",
    settings: "Ajustes",
  };
  document.getElementById("currentTabHeaderLabel").textContent =
    labels[tabName];
  const hash = `#${tabName}`;
  if (location.hash !== hash) history.pushState({}, "", hash);
  actions.renderAll();
  window.scrollTo({
    top: 0,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}

export function renderCalendar() {
  runtime.DAYS_CONFIG = actions.buildDynamicDaysConfig();
  const visible = domain.weekDays(runtime.appState.currentDay);
  const today = domain.isoDate();
  document.getElementById("calendarBar").innerHTML =
    `<button class="calendar-arrow" aria-label="Semana anterior" onclick="selectDay('${domain.addDays(runtime.appState.currentDay, -7)}')">‹</button>${visible.map((d) => `<button class="calendar-day ${d.id === runtime.appState.currentDay ? "selected" : ""}" aria-pressed="${d.id === runtime.appState.currentDay}" onclick="selectDay('${d.id}')"><span>${d.short}</span><strong>${Number(d.id.slice(-2))}</strong>${d.id === today ? '<i aria-label="Hoy"></i>' : ""}</button>`).join("")}<button class="calendar-arrow" aria-label="Semana siguiente" onclick="selectDay('${domain.addDays(runtime.appState.currentDay, 7)}')">›</button>`;
  document.getElementById("selectedDateLabel").textContent = new Date(
    `${runtime.appState.currentDay}T12:00:00`,
  ).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function selectDay(day) {
  if (!domain.validDate(day)) return;
  actions.cancelManualMealEdit();
  runtime.appState.currentDay = day;
  runtime.appState.days[day] ||= domain.emptyDay();
  actions.renderAll();
}

export function handleModelSelectionChange() {}

export function escapeHtmlSafe(value) {
  return domain.escapeHtml(value);
}

export function saveSettings() {
  runtime.appState.selectedModel = document.getElementById("modelSelect").value;
  runtime.appState.thinkingLevel = document.getElementById(
    "thinkingLevelSelect",
  ).value;
  actions.saveState();
  actions.showToast("Preferencias de IA guardadas.", "success");
}

export function renderSettings() {
  for (const [id, val] of [
    ["modelSelect", runtime.appState.selectedModel],
    ["thinkingLevelSelect", runtime.appState.thinkingLevel],
    ["calcMedical", runtime.appState.profile.medicalCondition || ""],
  ]) {
    const e = document.getElementById(id);
    if (e && document.activeElement !== e) e.value = val;
  }
  document.getElementById("headerTitle").textContent = "Control TCC";
  document.getElementById("headerSubtitle").textContent = "Un paso a la vez";
  document.getElementById("aiModelBadge").textContent =
    "Estimación · revisar antes de guardar";
  document.getElementById("profileSummaryCard").textContent =
    `${runtime.appState.profile.name || "Tu perfil"} · Metas de referencia: ${runtime.appState.targetKcal} kcal y ${runtime.appState.targetWater / 1000} L de agua. Puedes editarlas en Alimentación.`;
}

export function renderAll() {
  const active = document.activeElement,
    value = active && "value" in active ? active.value : null,
    start = active?.selectionStart,
    end = active?.selectionEnd,
    id = active?.id;
  actions.applyTheme();
  actions.renderCalendar();
  actions.renderSettings();
  actions.updateCloudUI();
  const renderers = {
    today: actions.renderToday,
    nutrition: actions.renderNutrition,
    focus: () => {
      actions.renderTasks();
      actions.renderWorkHubAll();
    },
    finance: actions.renderFinanceAll,
    tutor: actions.renderTutor,
    habits: actions.renderHabits,
    gym: actions.renderGym,
    grocery: actions.renderGroceries,
    settings: () => {},
  };
  (renderers[runtime.activeTab] || actions.renderToday)();
  if (id && value !== null) {
    const replacement = document.getElementById(id);
    if (replacement && ["INPUT", "TEXTAREA"].includes(replacement.tagName)) {
      replacement.value = value;
      if (active !== replacement) replacement.focus({ preventScroll: true });
      try {
        replacement.setSelectionRange(start, end);
      } catch {}
    }
  }
  document.dispatchEvent(new Event("tcc:render"));
}

export function renderToday() {
  const date = runtime.appState.currentDay,
    today = domain.isoDate();
  const habits = runtime.appState.habitsList.filter((h) =>
    domain.dueOn(h, date, today),
  );
  const done = habits.filter((h) =>
    domain.checked(runtime.appState, h, date),
  ).length;
  document.getElementById("todayGreeting").textContent =
    `${date === today ? "Tu día, a tu ritmo" : "Tu historial"}${runtime.appState.profile.name ? ", " + runtime.appState.profile.name : ""}.`;
  document.getElementById("todayProgress").textContent =
    `${done} de ${habits.length}`;
  document.getElementById("todayProgressBar").style.width =
    `${habits.length ? (done / habits.length) * 100 : 0}%`;
  document.getElementById("todayHabits").innerHTML = habits.length
    ? habits
        .slice(0, 5)
        .map((h) => {
          const idx = runtime.appState.habitsList.indexOf(h);
          return `<button class="today-habit" onclick="toggleHabitByIndex(${idx},event)" aria-pressed="${domain.checked(runtime.appState, h, date)}"><span class="habit-check ${domain.checked(runtime.appState, h, date) ? "done" : ""}">${domain.checked(runtime.appState, h, date) ? "✓" : ""}</span><span>${actions.escapeHtmlSafe(h.name)}</span><small>${domain.habitStreak(runtime.appState, h, date)} días</small></button>`;
        })
        .join("")
    : '<p class="empty-copy">Empieza con algo pequeño. Agrega tu primer hábito para hoy.</p><button class="primary-action" onclick="switchTab(\'habits\')">Crear un hábito</button>';
  const meals = runtime.appState.days[date]?.meals || [];
  document.getElementById("todayNutrition").textContent =
    `${Math.round(meals.reduce((n, m) => n + Number(m.kcal || 0), 0))} kcal`;
  document.getElementById("todayWater").textContent =
    `${(Number(runtime.appState.days[date]?.water || 0) / 1000).toFixed(1)} L`;
  const blocks = (runtime.appState.workHub.scheduleBlocks || [])
    .filter((b) => b.date === date && !b.done)
    .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
  document.getElementById("todayNextTask").textContent = blocks[0]
    ? `${blocks[0].startTime} · ${blocks[0].title}`
    : "Tu agenda está despejada";
  const completed = runtime.appState.habitsList.map((h) =>
    domain.habitStats(runtime.appState, h, date > today ? today : date),
  );
  const total = completed.reduce((n, x) => n + x.possible, 0);
  document.getElementById("todayConsistency").textContent = total
    ? `${Math.round((completed.reduce((n, x) => n + x.done, 0) / total) * 100)}%`
    : "—";
}

export function adjustHabitValue(index, delta) {
  const h = runtime.appState.habitsList[index];
  if (!h || !domain.dueOn(h, runtime.appState.currentDay)) return;
  const d = (runtime.appState.days[runtime.appState.currentDay] ||=
    domain.emptyDay());
  d.habitValues ||= {};
  const value = domain.numberIn((d.habitValues[h.id] || 0) + delta, 0, 10000);
  d.habitValues[h.id] = value;
  d.habitsState[h.id] = value >= h.targetCount;
  actions.saveState();
}

export function archiveHabit(index) {
  runtime.appState.habitsList[index].archivedAt = domain.isoDate();
  actions.saveState();
  actions.showToast(
    "Hábito archivado. Su historial sigue en Progreso.",
    "success",
  );
}

export function restoreHabit(index) {
  delete runtime.appState.habitsList[index].archivedAt;
  actions.saveState();
}

export function advanceDebtPeriod(id) {
  const d = runtime.appState.finance.debts.find(
    (x) => String(x.id) === String(id),
  );
  if (!d) return;
  d.dueDate = domain.nextMonthlyDate(d.dueDate || domain.isoDate());
  d.paidThisMonth = false;
  d.notified = "";
  actions.saveState();
}

export function saveAvailableBalance() {
  const v = document.getElementById("availableBalanceInput").value;
  runtime.appState.finance.availableBalance =
    v === "" ? null : domain.numberIn(v);
  actions.saveState();
}
