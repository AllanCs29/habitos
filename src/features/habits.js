import { runtime, actions } from "../core/context.js";
import * as domain from "../core/domain.js";
import DOMPurify from "dompurify";

export function toggleBreathingExercise() {
  const box = document.getElementById("breatheBox"),
    button = document.getElementById("breatheBtn"),
    text = document.getElementById("breatheInstruction");
  if (runtime.breatheTimer) {
    clearInterval(runtime.breatheTimer);
    runtime.breatheTimer = null;
    box.classList.add("hidden");
    button.textContent = "Iniciar";
    return;
  }
  const phases = [
      "Inhala suave · 4 s",
      "Mantén si es cómodo · 4 s",
      "Exhala suave · 4 s",
    ],
    start = Date.now();
  box.classList.remove("hidden");
  button.textContent = "Detener";
  text.textContent = phases[0];
  runtime.breatheTimer = setInterval(() => {
    const elapsed = Date.now() - start;
    if (elapsed >= 60000) {
      clearInterval(runtime.breatheTimer);
      runtime.breatheTimer = null;
      text.textContent = "Pausa completada";
      button.textContent = "Iniciar";
      return;
    }
    text.textContent = phases[Math.floor(elapsed / 4000) % 3];
  }, 250);
}

export function isHabitCheckedOnDay(date, h) {
  return domain.checked(runtime.appState, h, date);
}

export function setHabitCheckedOnDay(date, h, value) {
  if (date > domain.isoDate()) return;
  const day = (runtime.appState.days[date] ||= domain.emptyDay());
  day.habitsState[h.id] = !!value;
  (day.habitValues ||= {})[h.id] = value ? h.targetCount || 1 : 0;
  runtime.appState.habitsModifiedAt = Date.now();
}

export function calculateHabitStreak(h) {
  const habit =
    typeof h === "object"
      ? h
      : runtime.appState.habitsList.find((x) => x.id === h || x.name === h);
  return habit
    ? domain.habitStreak(runtime.appState, habit, runtime.appState.currentDay)
    : 0;
}

export function renderHabits() {
  const date = runtime.appState.currentDay,
    today = domain.isoDate(),
    active = runtime.appState.habitsList.filter((h) => !h.archivedAt),
    due = active.filter((h) => domain.dueOn(h, date, today)),
    done = due.filter((h) => domain.checked(runtime.appState, h, date)).length;
  document.getElementById("habitsDoneSummaryTitle").textContent =
    `${done} de ${due.length} completados${date === today ? " hoy" : ""}`;
  document.getElementById("habitsDoneRatioCircle").textContent =
    `${done}/${due.length}`;
  document.getElementById("habitsList").innerHTML = active.length
    ? active
        .map((h) => {
          const index = runtime.appState.habitsList.indexOf(h),
            isDone = domain.checked(runtime.appState, h, date),
            count =
              runtime.appState.days[date]?.habitValues?.[h.id] ||
              (isDone ? h.targetCount : 0);
          return `<article class="habit-card"><div class="habit-card-top"><button class="habit-title-button" onclick="toggleHabitByIndex(${index},event)" ${domain.dueOn(h, date, today) ? "" : "disabled"} aria-pressed="${isDone}"><span class="habit-check ${isDone ? "done" : ""}">${isDone ? "✓" : ""}</span><span>${actions.escapeHtmlSafe(h.name)}<small>${h.weekdays.length === 7 ? "Todos los días" : h.weekdays.length === 5 ? "Lunes a viernes" : "Fin de semana"} · ${domain.habitStreak(runtime.appState, h, date)} días de racha</small></span></button><button class="icon-action" onclick="archiveHabit(${index})" aria-label="Archivar ${actions.escapeHtmlSafe(h.name)}" title="Archivar hábito">↗</button></div>${h.targetCount > 1 ? `<div class="habit-counter"><button onclick="adjustHabitValue(${index},-1)" aria-label="Restar" ${date > today ? "disabled" : ""}>−</button><span>${count} / ${h.targetCount} ${actions.escapeHtmlSafe(h.unit || "veces")}</span><button onclick="adjustHabitValue(${index},1)" aria-label="Sumar" ${date > today ? "disabled" : ""}>+</button></div>` : ""}<div class="habit-week">${domain
            .weekDays(date)
            .map(
              (d) =>
                `<button onclick="toggleHabitDayByIndex('${d.id}',${index},event)" ${domain.dueOn(h, d.id, today) ? "" : "disabled"} aria-label="${actions.escapeHtmlSafe(d.label)}" aria-pressed="${domain.checked(runtime.appState, h, d.id)}"><span>${d.short}</span><i class="${domain.checked(runtime.appState, h, d.id) ? "done" : ""}">${domain.checked(runtime.appState, h, d.id) ? "✓" : "·"}</i></button>`,
            )
            .join(
              "",
            )}</div><div class="habit-card-footer"><button onclick="clearAllDaysForHabit(${index},event)">Limpiar esta semana</button><button onclick="deleteHabit(${index},event)">Eliminar</button></div></article>`;
        })
        .join("")
    : '<p class="empty-copy">Un hábito pequeño y concreto es un buen comienzo.</p>';
  const stats = runtime.appState.habitsList.map((h) => ({
    h,
    ...domain.habitStats(runtime.appState, h, date > today ? today : date),
  }));
  const possible = stats.reduce((n, s) => n + s.possible, 0),
    totalDone = stats.reduce((n, s) => n + s.done, 0);
  document.getElementById("statGlobalPct").textContent = possible
    ? `${Math.round((totalDone / possible) * 100)}%`
    : "—";
  document.getElementById("statCurrentStreak").textContent =
    `${Math.max(0, ...active.map((h) => domain.habitStreak(runtime.appState, h, date)))} días`;
  document.getElementById("habitStatsBars").innerHTML = stats
    .map(
      ({ h, percent, done, possible }) =>
        `<div class="stat-row"><span>${actions.escapeHtmlSafe(h.name)}${h.archivedAt ? " · Archivado" : ""}</span><strong>${done}/${possible} · ${percent}%</strong><progress max="100" value="${percent}"></progress>${h.archivedAt ? `<button onclick="restoreHabit(${runtime.appState.habitsList.indexOf(h)})">Reactivar</button>` : ""}</div>`,
    )
    .join("");
  document.getElementById("habitHeatmapGrid").innerHTML = Array.from(
    { length: 28 },
    (_, i) => domain.addDays(today, i - 27),
  )
    .map((d) => {
      const count = runtime.appState.habitsList.filter((h) =>
        domain.checked(runtime.appState, h, d),
      ).length;
      return `<div class="heat-day ${count ? "done" : ""}" title="${d}: ${count} hábitos">${Number(d.slice(-2))}</div>`;
    })
    .join("");
  document.getElementById("impulseLogsList").innerHTML =
    (runtime.appState.days[date]?.impulses || [])
      .map(
        (x, i) =>
          `<article class="habit-card"><strong>${actions.escapeHtmlSafe(x.category)}</strong><p>${actions.escapeHtmlSafe(x.trigger)}</p><p>${actions.escapeHtmlSafe(x.action)}</p><button onclick="deleteImpulseLog(${i})">Eliminar registro</button></article>`,
      )
      .join("") ||
    '<p class="empty-copy">Tu bitácora está lista cuando la necesites.</p>';
}

export function addHabit() {
  const inp = document.getElementById("newHabitInput"),
    name = inp.value.trim().slice(0, 120);
  if (!name) return;
  if (
    runtime.appState.habitsList.some(
      (h) => !h.archivedAt && h.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    actions.showToast("Ya tienes un hábito con ese nombre.", "warning");
    return;
  }
  const frequency = document.getElementById("habitFrequency").value;
  runtime.appState.habitsList.push({
    id: domain.newId(),
    name,
    createdAt:
      runtime.appState.currentDay > domain.isoDate()
        ? domain.isoDate()
        : runtime.appState.currentDay,
    targetCount: domain.numberIn(
      document.getElementById("habitTarget").value || 1,
      1,
      10000,
    ),
    unit: document.getElementById("habitUnit").value.trim().slice(0, 30),
    weekdays:
      frequency === "weekdays"
        ? [1, 2, 3, 4, 5]
        : frequency === "weekend"
          ? [0, 6]
          : [0, 1, 2, 3, 4, 5, 6],
  });
  inp.value = "";
  actions.saveState();
  actions.showToast("Hábito creado.", "success");
}

export function toggleHabitByIndex(index, event) {
  event?.preventDefault();
  event?.stopPropagation();
  const h = runtime.appState.habitsList[index];
  if (!h || !domain.dueOn(h, runtime.appState.currentDay)) return;
  actions.setHabitCheckedOnDay(
    runtime.appState.currentDay,
    h,
    !domain.checked(runtime.appState, h, runtime.appState.currentDay),
  );
  actions.saveState();
}

export function toggleHabitState(id) {
  const idx = (runtime.appState.habitsList || []).findIndex(
    (x) => x.id === id || x.name === id,
  );
  if (idx !== -1) actions.toggleHabitByIndex(idx);
}

export function toggleHabitDayByIndex(date, index, event) {
  event?.preventDefault();
  event?.stopPropagation();
  const h = runtime.appState.habitsList[index];
  if (!h || !domain.dueOn(h, date)) return;
  actions.setHabitCheckedOnDay(
    date,
    h,
    !domain.checked(runtime.appState, h, date),
  );
  actions.saveState();
}

export function toggleHabitOnSpecificDay(dayId, habitId) {
  const idx = (runtime.appState.habitsList || []).findIndex(
    (x) => x.id === habitId || x.name === habitId,
  );
  if (idx !== -1) actions.toggleHabitDayByIndex(dayId, idx);
}

export function clearAllDaysForHabit(index, event) {
  event?.stopPropagation();
  const h = runtime.appState.habitsList[index];
  if (!h) return;
  domain
    .weekDays(runtime.appState.currentDay)
    .forEach((d) => actions.setHabitCheckedOnDay(d.id, h, false));
  actions.saveState();
  actions.showToast("Semana limpiada. Puedes usar Deshacer.", "info");
}

export function deleteHabit(index, event) {
  event?.stopPropagation();
  const h = runtime.appState.habitsList[index];
  if (!h) return;
  runtime.appState.habitsList.splice(index, 1);
  for (const d of Object.values(runtime.appState.days)) {
    delete d.habitsState?.[h.id];
    delete d.habitValues?.[h.id];
  }
  actions.saveState();
  actions.showToast("Hábito eliminado. Puedes usar Deshacer.", "info");
}

export function addImpulseLog() {
  const cat = document.getElementById("impulseCategory").value;
  const triggerInput = document.getElementById("impulseTrigger");
  const actionInput = document.getElementById("impulseAction");
  if (!triggerInput.value.trim() || !actionInput.value.trim()) return;
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  runtime.appState.days[runtime.appState.currentDay].impulses.unshift({
    category: cat,
    trigger: triggerInput.value.trim(),
    action: actionInput.value.trim(),
    time: timeStr,
  });
  triggerInput.value = "";
  actionInput.value = "";
  actions.saveState();
  actions.showToast("Victoria conductual registrada", "success");
}

export function deleteImpulseLog(idx) {
  runtime.appState.days[runtime.appState.currentDay].impulses.splice(idx, 1);
  actions.saveState();
}
