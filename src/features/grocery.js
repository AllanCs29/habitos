import { runtime, actions } from "../core/context.js";
import * as domain from "../core/domain.js";
import DOMPurify from "dompurify";

export async function generateGroceryWithGemini() {
  if (!actions.isAIReady()) {
    actions.showToast(
      "Inicia sesión y configura el servicio de IA en Ajustes",
      "warning",
    );
    actions.switchTab("settings");
    return;
  }
  const budget =
    document.getElementById("groceryBudget").value.trim() || "1500";
  const days = document.getElementById("groceryDays").value.trim() || "7";
  const store =
    document.getElementById("groceryStore").value.trim() || "Tiendas 3B";
  const goal = document.getElementById("groceryGoalSelect").value;
  const medCond = runtime.appState.profile?.medicalCondition
    ? `Condición médica o restricción del usuario: "${runtime.appState.profile.medicalCondition}".`
    : "";

  const maxKcal = Number(runtime.appState.targetKcal) || 2100;
  const maxP = Number(runtime.appState.targetProt) || 170;
  const maxC = Number(runtime.appState.targetCarb) || 160;
  const maxF = Number(runtime.appState.targetFat) || 75;
  const policy = actions.getNutritionalGoalPolicy();

  const btn = document.getElementById("groceryBtn");
  const orig = btn.innerHTML;
  btn.innerHTML = "Pensando menú y macros...";
  btn.disabled = true;

  try {
    const prompt = `Propón ideas generales de alimentación; distingue estimaciones y respeta las restricciones declaradas. Presupuesto $${budget} para ${days} días comprando en ${store}. Meta: "${goal}". ${medCond}
        METAS DIARIAS DEL USUARIO: ${maxKcal} kcal | ${maxP}g Proteína | ${maxC}g Carbohidratos | ${maxF}g Grasas.
        REGLA DE META: ${policy.aiDirective}
        Cada día del mealPlan debe tener las 3 comidas (Desayuno, Comida, Cena) con gramajes y macros por comida para que al sumar las 3 comidas del día se cumplan las metas de macros (${maxP}g P, ${maxC}g C, ${maxF}g G).
        Devuelve ÚNICAMENTE un JSON válido:
        {
          "groceries": [{"text": "Producto (cantidad exacta para cumplir macros de la semana) - $precio"}],
          "mealPlan": [
            {
              "day": "Día 1 (${maxKcal} kcal | ${maxP}g P | ${maxC}g C | ${maxF}g G)",
              "breakfast": "Platillo con gramajes (ej. 4 huevos + 60g avena -> 550 kcal | 42g P | 48g C | 18g G)",
              "lunch": "Platillo con gramajes (ej. 220g pechuga + 150g arroz -> 720 kcal | 68g P | 65g C | 18g G)",
              "dinner": "Platillo con gramajes (ej. 200g atún/pollo + ensalada y aguacate -> 620 kcal | 60g P | 35g C | 24g G)"
            }
          ]
        }`;
    const res = await actions.callGeminiAPI(prompt, null, "grocery");
    const parsed = JSON.parse(res);
    if (
      !(await actions.reviewAIResult(
        "Revisar menú y lista",
        parsed.groceries.map((g) => g.text).join("\n") +
          "\nLos precios son estimaciones. Se reemplazará el plan y la lista actuales; puedes deshacer.",
      ))
    )
      return;
    runtime.appState.groceries = (parsed.groceries || []).map((it, idx) => ({
      id: Date.now() + idx,
      text: it.text,
      checked: false,
    }));
    runtime.appState.mealPlanStructured = parsed.mealPlan || [];
    actions.saveState();
    actions.showToast(
      "Lista y semana con macros estimadas generadas",
      "success",
    );
  } catch (err) {
    actions.showToast("Error IA: " + err.message, "error");
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

export function addManualGrocery() {
  const input = document.getElementById("manualGroceryInput");
  if (!input || !input.value.trim()) return;
  if (!Array.isArray(runtime.appState.groceries))
    runtime.appState.groceries = [];
  runtime.appState.groceries.unshift({
    id: Date.now(),
    text: input.value.trim(),
    checked: false,
  });
  input.value = "";
  actions.saveState();
  actions.showToast("Artículo agregado a la lista del súper", "success");
}

export function clearCheckedGroceries() {
  if (!Array.isArray(runtime.appState.groceries)) return;
  const before = runtime.appState.groceries.length;
  runtime.appState.groceries = runtime.appState.groceries.filter(
    (g) => !g.checked,
  );
  if (runtime.appState.groceries.length < before) {
    actions.saveState();
    actions.showToast("Artículos comprados eliminados de la lista", "info");
  } else {
    actions.showToast("No hay artículos marcados como comprados", "info");
  }
}

export function logWeeklyPlanMealToToday(dayIdx, mealTypeKey, mealLabelEs) {
  const dayPlan = (runtime.appState.mealPlanStructured || [])[dayIdx];
  if (!dayPlan || !dayPlan[mealTypeKey]) return;
  const rawText = String(dayPlan[mealTypeKey]);

  const kcalMatch = rawText.match(/(\d+)\s*kcal/i);
  const pMatch = rawText.match(/(\d+)\s*g\s*(?:de\s*)?(?:P|Prot)/i);
  const cMatch = rawText.match(/(\d+)\s*g\s*(?:de\s*)?(?:C|Carb)/i);
  const fMatch = rawText.match(/(\d+)\s*g\s*(?:de\s*)?(?:G|F|Grasa)/i);

  const defaultKcal = Math.round(
    (Number(runtime.appState.targetKcal) || 2100) / 3,
  );
  const defaultP = Math.round((Number(runtime.appState.targetProt) || 170) / 3);
  const defaultC = Math.round((Number(runtime.appState.targetCarb) || 160) / 3);
  const defaultF = Math.round((Number(runtime.appState.targetFat) || 75) / 3);

  const mealObj = {
    name: `${mealLabelEs}: ${rawText.split("->")[0].trim()}`,
    kcal: kcalMatch ? parseInt(kcalMatch[1], 10) : defaultKcal,
    p: pMatch ? parseInt(pMatch[1], 10) : defaultP,
    c: cMatch ? parseInt(cMatch[1], 10) : defaultC,
    f: fMatch ? parseInt(fMatch[1], 10) : defaultF,
  };
  if (!runtime.appState.days[runtime.appState.currentDay]) {
    runtime.appState.days[runtime.appState.currentDay] = {
      water: 0,
      meals: [],
      habitsState: {},
      impulses: [],
    };
  }
  runtime.appState.days[runtime.appState.currentDay].meals.push(mealObj);
  actions.saveState();
  actions.showToast(
    `${mealLabelEs} registrado en tu contador de hoy (${mealObj.kcal} kcal | ${mealObj.p}g P)`,
    "success",
  );
}

export function renderGroceries() {
  const el = document.getElementById("groceryList");
  el.innerHTML =
    runtime.appState.groceries.length === 0
      ? `<p class="text-xs text-slate-400 italic">Lista vacía.</p>`
      : runtime.appState.groceries
          .map(
            (g, i) => `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs">
            <label class="flex items-center gap-2.5 flex-1 cursor-pointer">
              <input type="checkbox" ${g.checked ? "checked" : ""} onchange="toggleGrocery(${i})" class="w-4 h-4 accent-terra-500">
              <span class="${g.checked ? "line-through text-slate-400" : "font-medium"}">${actions.escapeHtmlSafe(g.text)}</span>
            </label>
            <button onclick="deleteGrocery(${i})" class="text-slate-400 hover:text-rose-500"><i class="fi fi-rr-trash"></i></button>
          </div>
        `,
          )
          .join("");

  const planContainer = document.getElementById("mealPlanContainer");
  planContainer.innerHTML = (runtime.appState.mealPlanStructured || [])
    .map(
      (day, dIdx) => `
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
          <h4 class="font-black text-terra-500 uppercase">${actions.escapeHtmlSafe(day.day)}</h4>
          <div class="flex items-start justify-between gap-2">
            <p class="flex-1"><strong>Desayuno:</strong> ${actions.escapeHtmlSafe(day.breakfast)}</p>
            <button onclick="logWeeklyPlanMealToToday(${dIdx}, 'breakfast', 'Desayuno')" class="px-2 py-0.5 rounded-lg bg-terra-500/15 text-terra-500 font-bold text-[10px] shrink-0">+ Hoy</button>
          </div>
          <div class="flex items-start justify-between gap-2">
            <p class="flex-1"><strong>Comida:</strong> ${actions.escapeHtmlSafe(day.lunch)}</p>
            <button onclick="logWeeklyPlanMealToToday(${dIdx}, 'lunch', 'Comida')" class="px-2 py-0.5 rounded-lg bg-terra-500/15 text-terra-500 font-bold text-[10px] shrink-0">+ Hoy</button>
          </div>
          <div class="flex items-start justify-between gap-2">
            <p class="flex-1"><strong>Cena:</strong> ${actions.escapeHtmlSafe(day.dinner)}</p>
            <button onclick="logWeeklyPlanMealToToday(${dIdx}, 'dinner', 'Cena')" class="px-2 py-0.5 rounded-lg bg-terra-500/15 text-terra-500 font-bold text-[10px] shrink-0">+ Hoy</button>
          </div>
        </div>
      `,
    )
    .join("");
}

export function toggleGrocery(i) {
  runtime.appState.groceries[i].checked =
    !runtime.appState.groceries[i].checked;
  actions.saveState();
}

export function deleteGrocery(i) {
  runtime.appState.groceries.splice(i, 1);
  actions.saveState();
}
