import { makeCalendar, downloadText } from "../core/exports.js";
import { runtime, actions } from "../core/context.js";
import * as domain from "../core/domain.js";
import DOMPurify from "dompurify";

export function startGymRestTimer(seconds) {
  clearInterval(runtime.gymRestInterval);
  runtime.gymEndsAt = Date.now() + seconds * 1000;
  runtime.gymRestSeconds = seconds;
  actions.updateGymTimerUI();
  runtime.gymRestInterval = setInterval(() => {
    runtime.gymRestSeconds = Math.max(
      0,
      Math.ceil((runtime.gymEndsAt - Date.now()) / 1000),
    );
    actions.updateGymTimerUI();
    if (!runtime.gymRestSeconds) {
      clearInterval(runtime.gymRestInterval);
      runtime.gymRestInterval = null;
      actions.showToast("Descanso terminado.", "success");
    }
  }, 500);
}

export function stopGymRestTimer() {
  clearInterval(runtime.gymRestInterval);
  runtime.gymRestSeconds = 0;
  actions.updateGymTimerUI();
}

export function updateGymTimerUI() {
  const m = String(Math.floor(runtime.gymRestSeconds / 60)).padStart(2, "0");
  const s = String(runtime.gymRestSeconds % 60).padStart(2, "0");
  document.getElementById("gymTimerDisplay").textContent = `${m}:${s}`;
}

export function toggleNewExerciseForm() {
  document.getElementById("newExerciseForm").classList.toggle("hidden");
}

export function addGymExercise() {
  const input = document.getElementById("manualExerciseName");
  if (!input.value.trim()) return;
  const currentDayId = runtime.appState.currentDay;
  if (!runtime.appState.gymStructured[currentDayId])
    runtime.appState.gymStructured[currentDayId] = {
      focus: "Entrenamiento Personalizado",
      exercises: [],
    };
  runtime.appState.gymStructured[currentDayId].exercises.push({
    id: Date.now(),
    name: input.value.trim(),
    weight: "",
    done: false,
  });
  input.value = "";
  document.getElementById("newExerciseForm").classList.add("hidden");
  actions.saveState();
}

export function normalizeDayNameClean(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export async function generateGymRoutineWithGemini() {
  const start =
      runtime.appState.currentDay < domain.isoDate()
        ? domain.isoDate()
        : runtime.appState.currentDay,
    epoch = runtime.authEpoch;
  const weight =
      document.getElementById("gymWeight").value ||
      runtime.appState.profile.weight,
    height =
      document.getElementById("gymHeight").value ||
      runtime.appState.profile.height,
    daysCount =
      Number(document.getElementById("gymDays").value) ||
      runtime.appState.profile.gymDays ||
      4,
    goal = document.getElementById("gymGoalSelect").value;
  const btn = document.getElementById("gymBtn");
  btn.disabled = true;
  try {
    const prompt = `Propón una rutina general de ${daysCount} días por semana para una persona de ${weight || "peso no indicado"} kg y ${height || "altura no indicada"} cm. Objetivo: ${goal}. Restricciones declaradas: ${runtime.appState.profile.medicalCondition || "no indicadas"}. No diagnostiques ni prescribas tratamiento. No asumas experiencia avanzada ni cargas máximas. Incluye descansos y alternativas. Devuelve una lista con dayName, focus y exercises con name y weight vacío.`;
    const routine = JSON.parse(
      await actions.callGeminiAPI(prompt, null, "routine"),
    );
    if (
      !(await actions.reviewAIResult(
        "Revisar rutina",
        routine
          .map(
            (d) =>
              `${d.dayName}: ${d.focus}\n${d.exercises.map((e) => e.name).join("\n")}`,
          )
          .join("\n\n") +
          `\n\nSe aplicará desde ${start}. Las sesiones ya completadas y el historial anterior se conservarán.`,
      )) ||
      epoch !== runtime.authEpoch
    )
      return;
    runtime.appState.gymTemplate = { start, routine };
    for (let i = 0; i < 28; i++) {
      const date = domain.addDays(start, i),
        day = domain.dayInfo(date);
      const template = routine.find(
        (r) =>
          actions.normalizeDayNameClean(r.dayName) ===
          actions.normalizeDayNameClean(day.dayName),
      );
      if (
        template &&
        !runtime.appState.gymStructured[date]?.exercises?.some((e) => e.done)
      )
        runtime.appState.gymStructured[date] = {
          focus: template.focus,
          exercises: template.exercises.map((e) => ({
            ...e,
            id: domain.newId(),
            weight: "",
            done: false,
          })),
        };
    }
    actions.saveState();
    actions.showToast("Rutina guardada. Tu historial se conservó.", "success");
  } catch (e) {
    actions.showToast(e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

export function getBiomechanicalAnimationSVG(exerciseName) {
  return {
    svg: '<svg viewBox="0 0 160 100" class="w-48 h-36" aria-hidden="true"><circle cx="80" cy="20" r="9" fill="#94a3b8"/><path d="M80 32v30m-25-18h50M80 62l-20 28m20-28 20 28" stroke="#e05a33" stroke-width="7" fill="none" stroke-linecap="round"/></svg>',
    muscleLabel: "Referencia general",
    cue: "Consulta una demostración específica de este ejercicio. Esta ilustración no muestra su técnica ni valida tu postura.",
  };
}

export function showExerciseDemo(exerciseName) {
  const modal = document.getElementById("demoModal");
  document.getElementById("modalExerciseTitle").textContent = exerciseName;
  const bio = actions.getBiomechanicalAnimationSVG(exerciseName);
  document.getElementById("modalExerciseContent").innerHTML = `
        <div class="w-full bg-slate-950 rounded-2xl border border-slate-800 p-4 flex flex-col items-center">
          ${bio.svg}
          <p class="text-xs text-emerald-400 font-bold text-center mt-2">${bio.cue}</p>
          <p class="text-[11px] text-slate-400 mt-1">${bio.muscleLabel}</p>
        </div>
      `;
  modal.classList.remove("hidden");
}

export function showExerciseDemoByIndex(idx) {
  const currentDayId = runtime.appState.currentDay;
  const ex = runtime.appState.gymStructured?.[currentDayId]?.exercises?.[idx];
  if (ex) actions.showExerciseDemo(ex.name);
}

export function closeDemoModal() {
  document.getElementById("demoModal").classList.add("hidden");
}

export function updateGymWeight(i, val) {
  const currentDayId = runtime.appState.currentDay;
  const newWeight = val ? parseFloat(val) : "";
  if (runtime.appState.gymStructured?.[currentDayId]) {
    const ex = runtime.appState.gymStructured[currentDayId].exercises[i];
    ex.weight = newWeight;
    if (!runtime.appState.exerciseHistory)
      runtime.appState.exerciseHistory = {};
    if (!runtime.appState.exerciseHistory[ex.name])
      runtime.appState.exerciseHistory[ex.name] = [];
    if (newWeight)
      runtime.appState.exerciseHistory[ex.name].push({
        day: currentDayId,
        weight: newWeight,
      });
    actions.saveState();
  }
}

export function renderGym() {
  const currentDayId = runtime.appState.currentDay;
  const dayGymData = runtime.appState.gymStructured?.[currentDayId];
  const focusBadge = document.getElementById("gymDayFocusBadge");
  const el = document.getElementById("gymRoutineList");
  if (
    !dayGymData ||
    !dayGymData.exercises ||
    dayGymData.exercises.length === 0
  ) {
    focusBadge.textContent = "Enfoque: Día de descanso o sin rutina";
    el.innerHTML = `<p class="text-xs text-slate-400 italic">Genera una rutina con IA arriba o agrega un ejercicio.</p>`;
    return;
  }
  focusBadge.textContent = `Enfoque: ${dayGymData.focus}`;
  el.innerHTML = dayGymData.exercises
    .map((ex, i) => {
      const hist =
        runtime.appState.exerciseHistory &&
        Array.isArray(runtime.appState.exerciseHistory[ex.name])
          ? runtime.appState.exerciseHistory[ex.name]
          : [];
      const maxPr = hist.reduce(
        (m, entry) => Math.max(m, Number(entry.weight) || 0),
        0,
      );
      const lastEntry = hist.length > 0 ? hist[hist.length - 1] : null;
      return `
        <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
          <div class="flex items-center justify-between gap-2">
            <label class="flex items-center gap-2 font-bold cursor-pointer flex-1 min-w-0">
              <input type="checkbox" ${ex.done ? "checked" : ""} onchange="toggleGymEx(${i})" class="w-4 h-4 accent-blue-500 shrink-0">
              <span class="${ex.done ? "line-through text-slate-400" : ""} truncate">${actions.escapeHtmlSafe(ex.name)}</span>
            </label>
            <div class="flex gap-1.5 shrink-0">
              <button onclick="showExerciseDemoByIndex(${i})" class="text-[10px] bg-blue-500/15 text-blue-400 px-2 py-1 rounded-lg font-bold">Referencia</button>
              <button onclick="deleteGymEx(${i})" class="text-slate-400 hover:text-rose-500"><i class="fi fi-rr-trash"></i></button>
            </div>
          </div>
          <div class="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700 gap-2">
            <div class="flex items-center gap-2 text-[10px] text-slate-400">
              <span>Peso usado (kg):</span>
              ${maxPr > 0 ? `<span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-extrabold">PR: ${maxPr}kg</span>` : ""}
              ${lastEntry && lastEntry.weight ? `<span class="text-slate-500">Últ: ${actions.escapeHtmlSafe(lastEntry.weight)}kg</span>` : ""}
            </div>
            <input type="number" step="0.5" value="${actions.escapeHtmlSafe(ex.weight || "")}" placeholder="Kg" onchange="updateGymWeight(${i}, this.value)" class="w-16 px-2 py-1 text-center font-bold bg-white dark:bg-slate-900 rounded-lg outline-none">
          </div>
        </div>
      `;
    })
    .join("");
}

export function toggleGymEx(i) {
  runtime.appState.gymStructured[runtime.appState.currentDay].exercises[
    i
  ].done =
    !runtime.appState.gymStructured[runtime.appState.currentDay].exercises[i]
      .done;
  actions.saveState();
}

export function deleteGymEx(i) {
  runtime.appState.gymStructured[runtime.appState.currentDay].exercises.splice(
    i,
    1,
  );
  actions.saveState();
}

export function exportToCalendar() {
  const events = Object.entries(runtime.appState.gymStructured || {})
    .filter(([, g]) => g.exercises?.length)
    .map(([date, g]) => ({
      uid: "gym-" + date,
      date,
      time: "08:00",
      endTime: "09:15",
      title: "Entrenamiento: " + g.focus,
      description: g.exercises
        .map((e) => e.name + (e.weight ? " (" + e.weight + " kg)" : ""))
        .join("\n"),
      alarmMinutes: 15,
    }));
  if (!events.length) {
    actions.showToast("Agrega ejercicios antes de exportar.", "warning");
    return;
  }
  downloadText(
    makeCalendar(events),
    "Control-TCC-rutina.ics",
    "text/calendar;charset=utf-8",
  );
  actions.showToast(
    "Rutina descargada. Revisa los horarios al importarla en tu calendario.",
    "success",
  );
}
