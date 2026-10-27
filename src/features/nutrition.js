import { runtime, actions } from "../core/context.js";
import * as domain from "../core/domain.js";
import DOMPurify from "dompurify";

export function parseNutritionNum(val) {
  if (typeof val === "number" && !isNaN(val))
    return Math.max(0, Math.round(val));
  if (val === null || val === undefined) return 0;
  const str = String(val).replace(/,/g, ".");
  const m = str.match(/(\d+(?:\.\d+)?)/);
  return m ? Math.max(0, Math.round(parseFloat(m[1]))) : 0;
}

export function estimateNutritionFromText(text, tag = "Comida") {
  const kcal = String(text).match(/(\d+(?:[.,]\d+)?)\s*(?:kcal|calor[ií]as)/i);
  if (!kcal)
    throw new Error(
      "Falta información para calcular esta comida. Introduce los valores de la etiqueta o utiliza el análisis con IA.",
    );
  const macro = (pattern) =>
    Number(String(text).match(pattern)?.[1]?.replace(",", ".") || 0);
  return {
    id: domain.newId(),
    name: `${tag}: ${text}`,
    kcal: Number(kcal[1].replace(",", ".")),
    p: macro(/(\d+(?:[.,]\d+)?)\s*g?\s*(?:de\s*)?(?:prote[ií]na|p\b)/i),
    c: macro(
      /(\d+(?:[.,]\d+)?)\s*g?\s*(?:de\s*)?(?:carbohidratos|carbos|c\b)/i,
    ),
    f: macro(/(\d+(?:[.,]\d+)?)\s*g?\s*(?:de\s*)?(?:grasas|f\b)/i),
    source: "manual",
  };
}

export function normalizeMealEntry(raw, tag = "Comida") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("El registro de comida no es válido.");
  const r = raw.meal || raw;
  const meal = {
    ...r,
    id: r.id || domain.newId(),
    name: String(r.name || r.nombre || tag),
    source: r.source || "manual",
  };
  for (const k of ["kcal", "p", "c", "f"]) {
    const v = Number(r[k] ?? 0);
    if (!Number.isFinite(v) || v < 0 || v > (k === "kcal" ? 20000 : 5000))
      throw new Error("Revisa los valores nutricionales.");
    meal[k] = v;
  }
  return meal;
}

export function normalizeAllDaysMeals(state) {
  for (const d of Object.values(state.days || {}))
    if (Array.isArray(d?.meals))
      d.meals = d.meals.map((m) => actions.normalizeMealEntry(m, ""));
}

export function getTodayTotals() {
  if (!runtime.appState.days[runtime.appState.currentDay]) {
    runtime.appState.days[runtime.appState.currentDay] = {
      water: 0,
      meals: [],
      habitsState: {},
      impulses: [],
    };
  }
  const dayData = runtime.appState.days[runtime.appState.currentDay];
  let totKcal = 0,
    totP = 0,
    totC = 0,
    totF = 0;
  (dayData.meals || []).forEach((m, idx) => {
    const norm = actions.normalizeMealEntry(m, "");
    dayData.meals[idx] = norm;
    totKcal += norm.kcal;
    totP += norm.p;
    totC += norm.c;
    totF += norm.f;
  });
  return { totKcal, totP, totC, totF };
}

export function getLoggedMealTypesToday() {
  const dayData = runtime.appState.days[runtime.appState.currentDay] || {
    meals: [],
  };
  const joined = (dayData.meals || [])
    .map((m) => (m.name || "").toLowerCase())
    .join(" | ");
  return {
    hasBreakfast: joined.includes("desayuno") || joined.includes("breakfast"),
    hasLunch:
      joined.includes("comida") ||
      joined.includes("almuerzo") ||
      joined.includes("lunch"),
    hasDinner: joined.includes("cena") || joined.includes("dinner"),
    count: (dayData.meals || []).length,
  };
}

export function autoSelectRemainingMeals() {
  const status = actions.getLoggedMealTypesToday();
  const bEl = document.getElementById("planBreakfast");
  const lEl = document.getElementById("planLunch");
  const dEl = document.getElementById("planDinner");

  if (status.count === 0) {
    bEl.checked = true;
    lEl.checked = true;
    dEl.checked = true;
    actions.showToast(
      "No has registrado comidas hoy: se seleccionaron las 3 comidas para cuadrar tus macros",
      "info",
    );
  } else {
    bEl.checked = !status.hasBreakfast;
    lEl.checked = !status.hasLunch;
    dEl.checked = !status.hasDinner;
    if (!bEl.checked && !lEl.checked && !dEl.checked) {
      dEl.checked = true;
    }
    actions.showToast(
      "Se marcaron automáticamente las comidas que te faltan hoy",
      "success",
    );
  }
  actions.renderChefMacroBanner();
}

export function selectAllThreeMealsForChef() {
  document.getElementById("planBreakfast").checked = true;
  document.getElementById("planLunch").checked = true;
  document.getElementById("planDinner").checked = true;
  actions.renderChefMacroBanner();
  actions.showToast(
    "3 comidas seleccionadas: se distribuirán tus macros completas del día",
    "info",
  );
}

export function getNutritionalGoalPolicy() {
  const key = runtime.appState.profile?.goalKey || "recomp",
    label = runtime.GOAL_LABELS[key] || "Alimentación";
  return {
    key,
    shortBadge: "Meta: " + label,
    ruleSummary:
      "Las metas y porciones son orientativas. No es necesario acertar cada número al gramo; ajusta tus metas a tus necesidades.",
    aiDirective: `Objetivo declarado: ${label}. Ofrece porciones razonables y valores aproximados, sin forzar coincidencias exactas ni recomendar déficits extremos. Respeta restricciones y explica la incertidumbre. No diagnostiques ni prescribas tratamiento.`,
  };
}

export function renderChefMacroBanner() {
  const banner = document.getElementById("chefMacroBudgetBanner");
  if (!banner) return;

  const maxKcal = Number(runtime.appState.targetKcal) || 2100;
  const maxP = Number(runtime.appState.targetProt) || 170;
  const maxC = Number(runtime.appState.targetCarb) || 160;
  const maxF = Number(runtime.appState.targetFat) || 75;
  const { totKcal, totP, totC, totF } = actions.getTodayTotals();

  const remKcal = Math.max(0, maxKcal - totKcal);
  const remP = Math.max(0, maxP - totP);
  const remC = Math.max(0, maxC - totC);
  const remF = Math.max(0, maxF - totF);

  const bChecked = document.getElementById("planBreakfast")?.checked;
  const lChecked = document.getElementById("planLunch")?.checked;
  const dChecked = document.getElementById("planDinner")?.checked;
  const allThreeSelected = bChecked && lChecked && dChecked;

  const policy = actions.getNutritionalGoalPolicy();

  if (allThreeSelected && totKcal === 0) {
    banner.innerHTML = `
          <div class="flex items-center justify-between font-bold text-emerald-400">
            <span>Modo Día Completo (3 Comidas)</span>
            <span>Meta: ${maxKcal} kcal</span>
          </div>
          <p class="text-slate-600 dark:text-slate-300">Las 3 comidas sumarán: <strong>${maxP}g Proteína</strong> • <strong>${maxC}g Carbos</strong> • <strong>${maxF}g Grasas</strong>.</p>
          <p class="text-[10px] text-slate-400">${policy.ruleSummary}</p>
        `;
  } else if (allThreeSelected && totKcal > 0) {
    banner.innerHTML = `
          <div class="flex items-center justify-between font-bold text-amber-400">
            <span>3 Comidas Seleccionadas (Ya llevas ${totKcal} kcal hoy)</span>
            <span>Restan: ${remKcal} kcal</span>
          </div>
          <p class="text-slate-600 dark:text-slate-300">Te faltan hoy: <strong>${remP}g P</strong> • <strong>${remC}g C</strong> • <strong>${remF}g G</strong> (o un plan completo de ${maxP}g P / ${maxC}g C / ${maxF}g G para mañana).</p>
          <p class="text-[10px] text-slate-400">${policy.ruleSummary}</p>
        `;
  } else {
    banner.innerHTML = `
          <div class="flex items-center justify-between font-bold text-terra-500">
            <span>Macros que te faltan hoy para cumplir tu meta:</span>
            <span>${remKcal} kcal disp.</span>
          </div>
          <p class="text-slate-600 dark:text-slate-300">Faltan: <strong class="text-terra-500">${remP}g Proteína</strong> • <strong class="text-amber-500">${remC}g Carbos</strong> • <strong class="text-emerald-500">${remF}g Grasas</strong></p>
          <p class="text-[10px] text-slate-400">${policy.ruleSummary}</p>
        `;
  }
}

export function renderNutrition() {
  document.getElementById("targetKcalInput").value =
    runtime.appState.targetKcal || 2100;
  document.getElementById("targetWaterInput").value =
    runtime.appState.targetWater || 3500;
  document.getElementById("targetProtInput").value =
    runtime.appState.targetProt || 170;
  document.getElementById("targetCarbInput").value =
    runtime.appState.targetCarb || 160;
  document.getElementById("targetFatInput").value =
    runtime.appState.targetFat || 75;

  const goalModeSel = document.getElementById("nutritionGoalModeSelect");
  if (goalModeSel)
    goalModeSel.value = runtime.appState.profile?.goalKey || "deficit";

  const medInput = document.getElementById("fridgeMedicalCondition");
  if (medInput)
    medInput.value = runtime.appState.profile?.medicalCondition || "";

  const maxKcal = Number(runtime.appState.targetKcal) || 2100;
  const maxWater = Number(runtime.appState.targetWater) || 3500;
  const maxP = Number(runtime.appState.targetProt) || 170;
  const maxC = Number(runtime.appState.targetCarb) || 160;
  const maxF = Number(runtime.appState.targetFat) || 75;

  const { totKcal, totP, totC, totF } = actions.getTodayTotals();
  const remKcal = Math.max(0, maxKcal - totKcal);
  const remP = Math.max(0, maxP - totP);
  const remC = Math.max(0, maxC - totC);
  const remF = Math.max(0, maxF - totF);

  const policy = actions.getNutritionalGoalPolicy();
  const badgeEl = document.getElementById("goalRuleBadge");
  if (badgeEl) badgeEl.textContent = policy.shortBadge;

  document.getElementById("metaKcalLabel").textContent = maxKcal;
  document.getElementById("kcalConsumedBig").textContent = totKcal;
  document.getElementById("kcalTargetSmall").textContent = `/ ${maxKcal} kcal`;
  document.getElementById("kcalRemainingBig").textContent = `${remKcal} kcal`;
  document.getElementById("remainingMacrosSummary").textContent =
    `Te faltan: ${remP}g P • ${remC}g C • ${remF}g G`;

  const mainRing = document.getElementById("mainKcalRing");
  if (mainRing) {
    const circumference = 2 * Math.PI * 46;
    const pct = Math.min(100, Math.round((totKcal / maxKcal) * 100));
    mainRing.style.strokeDasharray = `${circumference} ${circumference}`;
    mainRing.style.strokeDashoffset =
      circumference - (pct / 100) * circumference;
  }

  document.getElementById("protText").textContent = `${totP} / ${maxP} g`;
  document.getElementById("carbText").textContent = `${totC} / ${maxC} g`;
  document.getElementById("fatText").textContent = `${totF} / ${maxF} g`;

  document.getElementById("protRemLabel").textContent =
    remP > 0 ? `(faltan ${remP}g)` : "(meta lograda)";
  document.getElementById("carbRemLabel").textContent =
    remC > 0 ? `(faltan ${remC}g)` : "(meta lograda)";
  document.getElementById("fatRemLabel").textContent =
    remF > 0 ? `(faltan ${remF}g)` : "(meta lograda)";

  document.getElementById("protLinearBar").style.width =
    `${Math.min(100, (totP / maxP) * 100)}%`;
  document.getElementById("carbLinearBar").style.width =
    `${Math.min(100, (totC / maxC) * 100)}%`;
  document.getElementById("fatLinearBar").style.width =
    `${Math.min(100, (totF / maxF) * 100)}%`;

  const dayData = runtime.appState.days[runtime.appState.currentDay];
  const waterMl = dayData.water || 0;
  const waterPct = Math.min(100, Math.round((waterMl / maxWater) * 100));
  document.getElementById("waterText").textContent =
    `${(waterMl / 1000).toFixed(2)} L`;
  document.getElementById("waterLiquid").style.height = `${waterPct}%`;
  document.getElementById("waterPercentText").textContent = `${waterPct}%`;

  const status = actions.getLoggedMealTypesToday();
  const statusEl = document.getElementById("loggedMealTypesStatus");
  if (statusEl) {
    const doneArr = [];
    if (status.hasBreakfast) doneArr.push("✓ Desayuno");
    if (status.hasLunch) doneArr.push("✓ Comida");
    if (status.hasDinner) doneArr.push("✓ Cena");
    statusEl.textContent =
      doneArr.length > 0
        ? doneArr.join(" • ")
        : `${status.count} platillo(s) registrado(s)`;
  }

  const mealsEl = document.getElementById("mealsList");
  if (dayData.meals.length === 0) {
    mealsEl.innerHTML = `<p class="text-xs text-slate-400 italic">Aún no has registrado comidas hoy.</p>`;
  } else {
    mealsEl.innerHTML = dayData.meals
      .map(
        (m, i) => `
          <div class="flex justify-between items-center p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 text-xs gap-2">
            <div class="min-w-0 flex-1">
              <p class="font-bold text-slate-800 dark:text-slate-100 truncate">${actions.escapeHtmlSafe(m.name)}</p>
              <p class="text-[11px] text-slate-400 mt-0.5"><strong class="text-terra-500">${Number(m.kcal) || 0} kcal</strong> • ${Number(m.p) || 0}g P • ${Number(m.c) || 0}g C • ${Number(m.f) || 0}g G</p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button onclick="openEditMealByIndex(${i})" title="Editar calorías o macros" class="w-7 h-7 rounded-xl bg-slate-200/70 dark:bg-slate-700/70 hover:bg-blue-500/20 text-slate-500 dark:text-slate-300 hover:text-blue-400 flex items-center justify-center">
                <i class="fi fi-rr-edit text-[11px]"></i>
              </button>
              <button onclick="removeMeal(${i})" title="Eliminar comida" class="w-7 h-7 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white flex items-center justify-center">
                <i class="fi fi-rr-trash text-[11px]"></i>
              </button>
            </div>
          </div>
        `,
      )
      .join("");
  }

  actions.renderChefMacroBanner();
  actions.renderFridgePlan();
}

export function updateTargets() {
  const k = document.getElementById("targetKcalInput").value;
  const w = document.getElementById("targetWaterInput").value;
  const p = document.getElementById("targetProtInput").value;
  const c = document.getElementById("targetCarbInput").value;
  const f = document.getElementById("targetFatInput").value;
  runtime.appState.targetKcal = k ? parseInt(k) : 2100;
  runtime.appState.targetWater = w ? parseInt(w) : 3500;
  runtime.appState.targetProt = p ? parseInt(p) : 170;
  runtime.appState.targetCarb = c ? parseInt(c) : 160;
  runtime.appState.targetFat = f ? parseInt(f) : 75;
  actions.saveState();
  actions.showToast("Metas actualizadas", "success");
}

export async function compressImageFile(file, maxDim = 850, quality = 0.72) {
  if (
    !file ||
    !/^image\/(png|jpeg|webp|gif|avif|heic|heif)$/.test(file.type) ||
    file.size > 15 * 1024 * 1024
  )
    throw new Error(
      "Usa una imagen de hasta 15 MB (JPG, PNG o WebP recomendado).",
    );
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () =>
        reject(new Error("No se pudo abrir la imagen. Prueba con JPG o PNG."));
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height)),
            canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas
            .getContext("2d")
            .drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) {
          reject(e);
        }
      };
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  runtime.currentUploadedImageBase64 = await actions.compressImageFile(
    file,
    900,
    0.8,
  );
  document.getElementById("photoThumbnail").src =
    runtime.currentUploadedImageBase64;
  document.getElementById("photoFileName").textContent = file.name;
  document.getElementById("photoPreviewCard").classList.remove("hidden");
  actions.showToast(
    "Foto del plato lista. Presiona Calcular con IA.",
    "success",
  );
}

export function clearUploadedPhoto() {
  runtime.currentUploadedImageBase64 = null;
  document.getElementById("aiFoodImage").value = "";
  document.getElementById("photoPreviewCard").classList.add("hidden");
}

export async function analyzeFoodWithGemini() {
  const text = document.getElementById("aiFoodInput").value.trim(),
    tag = document.getElementById("mealTypeTagSelect").value || "Comida",
    date = runtime.appState.currentDay,
    epoch = runtime.authEpoch,
    image = runtime.currentUploadedImageBase64;
  if (!text && !image) {
    actions.showToast("Describe la comida o añade una foto.", "warning");
    return;
  }
  const button = document.getElementById("aiFoodBtn");
  button.disabled = true;
  try {
    let meal;
    if (!actions.isAIReady() && !image)
      meal = actions.estimateNutritionFromText(text, tag);
    else {
      const prompt = `Estima la comida ${tag}. Descripción: ${text}. Considera cantidades e ingredientes visibles. No inventes precisión. Si falta información, indícalo en assumptions. Devuelve {name,kcal,p,c,f,assumptions}. Los valores pueden ser cero. No diagnostiques ni prescribas.`;
      meal = JSON.parse(await actions.callGeminiAPI(prompt, image, "meal"));
      meal.source = "ai-estimate";
    }
    meal = actions.normalizeMealEntry(meal, tag);
    if (epoch !== runtime.authEpoch) return;
    const approved = await actions.reviewAIResult(
      "Revisar comida",
      `${meal.name}\n${meal.kcal} kcal · ${meal.p} g proteína · ${meal.c} g carbohidratos · ${meal.f} g grasa\n${meal.assumptions || "Verifica la porción y los valores antes de registrar."}\nFecha: ${date}`,
    );
    if (!approved || epoch !== runtime.authEpoch) return;
    (runtime.appState.days[date] ||= domain.emptyDay()).meals.push(meal);
    document.getElementById("aiFoodInput").value = "";
    actions.clearUploadedPhoto();
    actions.saveState();
    actions.showToast(
      `Comida guardada en ${date}. Puedes editar sus valores.`,
      "success",
    );
  } catch (e) {
    actions.showToast(e.message, "error");
    if (!actions.isAIReady()) {
      actions.toggleManualMealBox();
      document.getElementById("manualMealNameInput").value = text;
    }
  } finally {
    button.disabled = false;
  }
}

export async function recommendFromFridge() {
  const ingredients = document.getElementById("fridgeIngredients").value.trim();
  if (!ingredients) {
    actions.showToast(
      "Escribe qué ingredientes tienes en tu refri o alacena",
      "warning",
    );
    return;
  }
  if (!actions.isAIReady()) {
    actions.showToast(
      "Inicia sesión y configura el servicio de IA en Ajustes",
      "warning",
    );
    actions.switchTab("settings");
    return;
  }

  const medInputVal = document
    .getElementById("fridgeMedicalCondition")
    .value.trim();
  runtime.appState.profile.medicalCondition = medInputVal;

  const bChecked = document.getElementById("planBreakfast").checked;
  const lChecked = document.getElementById("planLunch").checked;
  const dChecked = document.getElementById("planDinner").checked;

  const mealsRequested = [];
  if (bChecked) mealsRequested.push("Desayuno");
  if (lChecked) mealsRequested.push("Comida");
  if (dChecked) mealsRequested.push("Cena");

  if (mealsRequested.length === 0) {
    actions.showToast(
      "Selecciona al menos una comida (Desayuno, Comida o Cena)",
      "warning",
    );
    return;
  }

  const maxKcal = Number(runtime.appState.targetKcal) || 2100;
  const maxP = Number(runtime.appState.targetProt) || 170;
  const maxC = Number(runtime.appState.targetCarb) || 160;
  const maxF = Number(runtime.appState.targetFat) || 75;

  const { totKcal, totP, totC, totF } = actions.getTodayTotals();
  const remKcal = Math.max(0, maxKcal - totKcal);
  const remP = Math.max(0, maxP - totP);
  const remC = Math.max(0, maxC - totC);
  const remF = Math.max(0, maxF - totF);

  const alreadyEatenList =
    (runtime.appState.days[runtime.appState.currentDay].meals || [])
      .map((m) => `${m.name} (${m.kcal} kcal, ${m.p}g P, ${m.c}g C, ${m.f}g G)`)
      .join("; ") || "Ninguna comida registrada hoy todavía";

  // Presupuesto exacto sin forzar gramos extra cuando un macro ya llegó a 0g
  const isFullDayThreeMeals = mealsRequested.length === 3 && totKcal === 0;
  const budgetKcal = isFullDayThreeMeals ? maxKcal : remKcal;
  const budgetP = isFullDayThreeMeals ? maxP : remP;
  const budgetC = isFullDayThreeMeals ? maxC : remC;
  const budgetF = isFullDayThreeMeals ? maxF : remF;

  const policy = actions.getNutritionalGoalPolicy();
  const userWeight = runtime.appState.profile.weight
    ? `${runtime.appState.profile.weight}kg`
    : "peso estándar";
  const medicalContext = medInputVal
    ? `Condición médica, alergia o restricción: "${medInputVal}".`
    : "Sin restricciones médicas.";

  const btn = document.getElementById("fridgeBtn");
  const originalText = btn.innerHTML;
  btn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full spinner"></div><span>Calculando gramajes y macros con IA...</span>`;
  btn.disabled = true;

  try {
    const prompt = `Propón ideas generales de comidas con cantidades y macros aproximados. No atribuyas precisión clínica a estimaciones de IA.
        DATOS DEL USUARIO:
        - Peso: ${userWeight} | Meta actual: "${runtime.appState.profile.goalText || policy.shortBadge}".
        - ${medicalContext}
        - Metas diarias totales establecidas: ${maxKcal} kcal | ${maxP}g Proteína | ${maxC}g Carbohidratos | ${maxF}g Grasas.
        - Comidas ya registradas hoy: ${alreadyEatenList} (Total ya consumido hoy: ${totKcal} kcal, ${totP}g P, ${totC}g C, ${totF}g G).
        - Macros y calorías FALTANTES para cerrar hoy en la meta: ${budgetKcal} kcal | ${budgetP}g Proteína | ${budgetC}g Carbohidratos | ${budgetF}g Grasas.
        - Comidas que el usuario te pide diseñar ahora mismo: ${mealsRequested.join(", ")} (${mealsRequested.length} tiempo(s) de comida).
        - Ingredientes disponibles: "${ingredients}".

        REGLA DE ORO SEGÚN SU META FÍSICA:
        ${policy.aiDirective}
        - Si te pide las 3 comidas (Desayuno, Comida, Cena), reparte los gramajes entre las 3 comidas para que LA SUMA DE LAS 3 COMIDAS se acerque a la meta de macros (${maxP}g P, ${maxC}g C, ${maxF}g G).
        - Si ya desayunó y/o comió y te pide la(s) siguiente(s) comida(s), ajusta los porciones aproximadas (ej. cuántos gramos de pechuga/atún/claras/arroz/aguacate) de esta recomendación específicamente para COMPLETAR o acercarse lo más posible a los macros que le faltan hoy (${budgetP}g P, ${budgetC}g C, ${budgetF}g G).

        Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta:
        {
          "avoidWarning": "Explicación de cómo esta(s) receta(s) cuadra(n) sus macros faltantes según su meta (${policy.shortBadge}) y qué evitar por su condición (${medInputVal || "General"})",
          "macroMathSummary": "Resumen numérico estimado: Suma de estas recetas = X kcal, Xg P, Xg C, Xg G vs Meta restante",
          "proposals": [
            {
              "mealTime": "Desayuno / Comida / Cena",
              "title": "Nombre del platillo con porciones aproximadas (ej. 220g Fajitas de Pollo + 130g Arroz + 40g Aguacate)",
              "instructions": "Preparación paso a paso indicando pesos en crudo/cocido y por qué completa sus macros faltantes",
              "kcal": 520,
              "p": 48,
              "c": 42,
              "f": 16
            }
          ]
        }`;

    const resText = await actions.callGeminiAPI(prompt, null, "chef");
    const proposed = JSON.parse(resText);
    if (
      !(await actions.reviewAIResult(
        "Revisar propuesta de comidas",
        proposed.proposals
          .map((p) => p.mealTime + ": " + p.title + " · " + p.kcal + " kcal")
          .join("\n") + "\nLas cantidades y valores son estimaciones.",
      ))
    )
      return;
    runtime.appState.lastFridgePlan = proposed;
    actions.saveState();
    actions.showToast("Recetas calculadas para cuadrar tus macros", "success");
  } catch (err) {
    actions.showToast("Error Chef IA: " + err.message, "error");
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

export function renderFridgePlan() {
  const container = document.getElementById("fridgeRecommendations");
  const plan = runtime.appState.lastFridgePlan;
  if (!plan) {
    container.innerHTML = "";
    return;
  }

  let sumKcal = 0,
    sumP = 0,
    sumC = 0,
    sumF = 0;
  (plan.proposals || []).forEach((pr) => {
    sumKcal += Number(pr.kcal) || 0;
    sumP += Number(pr.p) || 0;
    sumC += Number(pr.c) || 0;
    sumF += Number(pr.f) || 0;
  });

  const proposalsHtml = (plan.proposals || [])
    .map(
      (prop, idx) => `
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5">
          <div class="flex justify-between items-start gap-2">
            <div>
              <span class="text-[10px] font-extrabold uppercase text-emerald-500 block">${actions.escapeHtmlSafe(prop.mealTime)}</span>
              <h4 class="font-bold text-xs">${actions.escapeHtmlSafe(prop.title)}</h4>
            </div>
            <button onclick="logFridgeProposal(${idx})" class="px-2.5 py-1 bg-terra-500 hover:bg-terra-600 text-white text-[10px] font-bold rounded-lg shrink-0 shadow-sm">+ Registrar</button>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-300 leading-relaxed">${actions.escapeHtmlSafe(prop.instructions)}</p>
          <div class="flex flex-wrap gap-1.5 pt-1">
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-terra-500/15 text-terra-500">${actions.escapeHtmlSafe(prop.kcal)} kcal</span>
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400">${actions.escapeHtmlSafe(prop.p)}g Proteína</span>
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400">${actions.escapeHtmlSafe(prop.c)}g Carbos</span>
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400">${actions.escapeHtmlSafe(prop.f)}g Grasas</span>
          </div>
        </div>
      `,
    )
    .join("");

  container.innerHTML = `
        <div class="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1">
          <span class="font-extrabold text-emerald-400 uppercase text-[10px] block">Cuadre Matemático de Macros</span>
          <p class="text-slate-700 dark:text-slate-200 text-[11px] font-bold">${actions.escapeHtmlSafe(plan.macroMathSummary || `Total sugerido: ${sumKcal} kcal • ${sumP}g P • ${sumC}g C • ${sumF}g G`)}</p>
          <p class="text-slate-500 dark:text-slate-300 text-[11px]">${actions.escapeHtmlSafe(plan.avoidWarning || "")}</p>
        </div>
        <div class="space-y-2">${proposalsHtml}</div>
      `;
}

export function logFridgeProposal(idx) {
  if (
    !runtime.appState.lastFridgePlan ||
    !runtime.appState.lastFridgePlan.proposals[idx]
  )
    return;
  const p = runtime.appState.lastFridgePlan.proposals[idx];
  if (!runtime.appState.days[runtime.appState.currentDay]) {
    runtime.appState.days[runtime.appState.currentDay] = {
      water: 0,
      meals: [],
      habitsState: {},
      impulses: [],
    };
  }
  const mealObj = actions.normalizeMealEntry(
    {
      name: `${p.mealTime}: ${p.title}`,
      kcal: p.kcal,
      p: p.p,
      c: p.c,
      f: p.f,
    },
    p.mealTime || "Comida",
  );
  runtime.appState.days[runtime.appState.currentDay].meals.push(mealObj);
  runtime.appState.days[runtime.appState.currentDay].mealsModifiedAt =
    Date.now();
  actions.saveState();
  actions.showToast(
    `Registrado en tu día: ${mealObj.name} (${mealObj.kcal} kcal)`,
    "success",
  );
}

export function toggleManualMealBox() {
  const box = document.getElementById("manualMealFormBox");
  if (!box) return;
  if (!box.classList.contains("hidden") && runtime.editingMealIndex === null) {
    box.classList.add("hidden");
    return;
  }
  runtime.editingMealIndex = null;
  const scannerTyped = (
    document.getElementById("aiFoodInput")?.value || ""
  ).trim();
  const mealTypeTag =
    document.getElementById("mealTypeTagSelect")?.value || "Comida";
  document.getElementById("manualMealFormTitle").textContent =
    "Agregar Platillo Manual";
  if (scannerTyped) {
    const est = actions.estimateNutritionFromText(scannerTyped, mealTypeTag);
    document.getElementById("manualMealNameInput").value = est.name;
    document.getElementById("manualMealKcalInput").value = est.kcal;
    document.getElementById("manualMealProtInput").value = est.p;
    document.getElementById("manualMealCarbInput").value = est.c;
    document.getElementById("manualMealFatInput").value = est.f;
  } else {
    document.getElementById("manualMealNameInput").value = "";
    document.getElementById("manualMealKcalInput").value = "";
    document.getElementById("manualMealProtInput").value = "";
    document.getElementById("manualMealCarbInput").value = "";
    document.getElementById("manualMealFatInput").value = "";
  }
  box.classList.remove("hidden");
}

export function openEditMealByIndex(idx) {
  const dayData = runtime.appState.days[runtime.appState.currentDay];
  if (!dayData || !dayData.meals || !dayData.meals[idx]) return;
  const m = actions.normalizeMealEntry(dayData.meals[idx], "");
  runtime.editingMealIndex = idx;
  runtime.editingMealId = m.id;
  runtime.editingMealDate = runtime.appState.currentDay;
  document.getElementById("manualMealFormTitle").textContent =
    `Editar Platillo #${idx + 1}`;
  document.getElementById("manualMealNameInput").value = m.name || "";
  document.getElementById("manualMealKcalInput").value = m.kcal ?? 0;
  document.getElementById("manualMealProtInput").value = m.p ?? 0;
  document.getElementById("manualMealCarbInput").value = m.c ?? 0;
  document.getElementById("manualMealFatInput").value = m.f ?? 0;
  document.getElementById("manualMealFormBox").classList.remove("hidden");
}

export function cancelManualMealEdit() {
  runtime.editingMealIndex = null;
  const box = document.getElementById("manualMealFormBox");
  if (box) box.classList.add("hidden");
}

export function saveManualMealEntry() {
  const nameVal = (
    document.getElementById("manualMealNameInput").value || ""
  ).trim();
  if (!nameVal) {
    actions.showToast("Escribe el nombre del platillo o alimento", "warning");
    return;
  }
  if (runtime.editingMealIndex !== null) {
    runtime.editingMealIndex =
      runtime.appState.days[runtime.editingMealDate]?.meals.findIndex(
        (m) => m.id === runtime.editingMealId,
      ) ?? -1;
    if (
      runtime.editingMealDate !== runtime.appState.currentDay ||
      runtime.editingMealIndex < 0
    ) {
      actions.cancelManualMealEdit();
      actions.showToast(
        "El registro cambió. Ábrelo de nuevo para editar.",
        "warning",
      );
      return;
    }
  }
  const mealTypeTag =
    document.getElementById("mealTypeTagSelect")?.value || "Comida";
  const pVal = actions.parseNutritionNum(
    document.getElementById("manualMealProtInput").value,
  );
  const cVal = actions.parseNutritionNum(
    document.getElementById("manualMealCarbInput").value,
  );
  const fVal = actions.parseNutritionNum(
    document.getElementById("manualMealFatInput").value,
  );
  const kcalVal = actions.parseNutritionNum(
    document.getElementById("manualMealKcalInput").value,
  );

  const mealObj = actions.normalizeMealEntry(
    {
      ...(runtime.editingMealIndex !== null
        ? runtime.appState.days[runtime.appState.currentDay].meals[
            runtime.editingMealIndex
          ]
        : {}),
      source: "manual",
      name: nameVal,
      kcal: kcalVal,
      p: pVal,
      c: cVal,
      f: fVal,
    },
    mealTypeTag,
  );

  if (!runtime.appState.days[runtime.appState.currentDay]) {
    runtime.appState.days[runtime.appState.currentDay] = {
      water: 0,
      meals: [],
      habitsState: {},
      impulses: [],
    };
  }

  if (
    runtime.editingMealIndex !== null &&
    runtime.appState.days[runtime.appState.currentDay].meals[
      runtime.editingMealIndex
    ]
  ) {
    runtime.appState.days[runtime.appState.currentDay].meals[
      runtime.editingMealIndex
    ] = mealObj;
    actions.showToast(
      `Platillo actualizado: ${mealObj.kcal} kcal (${mealObj.p}g P)`,
      "success",
    );
  } else {
    runtime.appState.days[runtime.appState.currentDay].meals.push(mealObj);
    actions.showToast(
      `Registrado: ${mealObj.name} (${mealObj.kcal} kcal | ${mealObj.p}g P)`,
      "success",
    );
  }
  runtime.appState.days[runtime.appState.currentDay].mealsModifiedAt =
    Date.now();
  actions.cancelManualMealEdit();
  actions.saveState();
}

export function removeMeal(index) {
  if (!runtime.appState.days[runtime.appState.currentDay]) return;
  runtime.appState.days[runtime.appState.currentDay].meals.splice(index, 1);
  runtime.appState.days[runtime.appState.currentDay].mealsModifiedAt =
    Date.now();
  if (runtime.appState.days[runtime.appState.currentDay].meals.length === 0) {
    runtime.appState.days[runtime.appState.currentDay].mealsClearedAt =
      Date.now();
  }
  actions.saveState();
}

export function clearTodayMeals() {
  if (!runtime.appState.days[runtime.appState.currentDay]) return;
  runtime.appState.days[runtime.appState.currentDay].meals = [];
  runtime.appState.days[runtime.appState.currentDay].mealsClearedAt =
    Date.now();
  runtime.appState.days[runtime.appState.currentDay].mealsModifiedAt =
    Date.now();
  actions.saveState();
  actions.showToast("Comidas de hoy reiniciadas", "info");
}

export function addWater(amount) {
  if (!runtime.appState.days[runtime.appState.currentDay]) {
    runtime.appState.days[runtime.appState.currentDay] = {
      water: 0,
      meals: [],
      habitsState: {},
      impulses: [],
    };
  }
  const dayData = runtime.appState.days[runtime.appState.currentDay];
  dayData.water = Math.max(0, (dayData.water || 0) + amount);
  dayData.waterModifiedAt = Date.now();
  actions.saveState();
}

export async function calculateMacrosWithGemini() {
  if (!actions.isAIReady()) {
    actions.showToast(
      "Inicia sesión y configura el servicio de IA en Ajustes",
      "warning",
    );
    return;
  }
  const weight =
    document.getElementById("calcWeight").value ||
    runtime.appState.profile.weight;
  const height =
    document.getElementById("calcHeight").value ||
    runtime.appState.profile.height;
  const age =
    document.getElementById("calcAge").value || runtime.appState.profile.age;
  const activity = document.getElementById("calcActivity").value;
  const goal = document.getElementById("calcGoalSelect").value;
  const medCond =
    document.getElementById("calcMedical").value.trim() ||
    runtime.appState.profile.medicalCondition ||
    "Ninguna";

  if (!weight || !height || !age) {
    actions.showToast("Ingresa peso, altura y edad", "warning");
    return;
  }

  try {
    const prompt = `Calcula calorías, agua (ml) y macros para ${weight}kg, ${height}cm, ${age} años, "${activity}", objetivo: "${goal}", condición médica o restricción: "${medCond}". Devuelve ÚNICAMENTE un JSON: {"targetKcal": 2100, "targetWater": 4000, "targetProt": 170, "targetCarb": 160, "targetFat": 85}`;
    const textResult = await actions.callGeminiAPI(prompt, null, "targets");
    const parsed = JSON.parse(textResult);
    if (
      !(await actions.reviewAIResult(
        "Revisar metas sugeridas",
        JSON.stringify(parsed, null, 2) +
          "\nSon orientativas. Verifica que sean apropiadas para ti antes de aplicarlas.",
      ))
    )
      return;
    runtime.appState.targetKcal = Number(parsed.targetKcal) || 2100;
    runtime.appState.targetWater = Number(parsed.targetWater) || 4000;
    runtime.appState.targetProt = Number(parsed.targetProt) || 170;
    runtime.appState.targetCarb = Number(parsed.targetCarb) || 160;
    runtime.appState.targetFat = Number(parsed.targetFat) || 85;
    if (goal.toLowerCase().includes("grasa"))
      runtime.appState.profile.goalKey = "deficit";
    else if (goal.toLowerCase().includes("recompos"))
      runtime.appState.profile.goalKey = "recomp";
    else if (goal.toLowerCase().includes("volumen"))
      runtime.appState.profile.goalKey = "bulk";
    else runtime.appState.profile.goalKey = "hypertrophy";
    runtime.appState.profile.goalText = goal;
    actions.saveState();
    actions.showToast(
      `Metas instaladas: ${runtime.appState.targetKcal} kcal`,
      "success",
    );
    actions.switchTab("nutrition");
  } catch (err) {
    actions.showToast("Error: " + err.message, "error");
  }
}

export function toggleFactoryResetConfirm() {
  document.getElementById("factoryResetConfirmBox").classList.toggle("hidden");
}

export function copyDailyReport() {
  const dayData = runtime.appState.days[runtime.appState.currentDay];
  const { totKcal, totP, totC, totF } = actions.getTodayTotals();
  const report = `Reporte TCC (${runtime.appState.currentDay} - ${runtime.appState.profile.name || "Usuario"}):\n• Kcal: ${totKcal}/${runtime.appState.targetKcal || 2100}\n• Macros: ${totP}g P | ${totC}g C | ${totF}g G\n• Agua: ${(dayData.water / 1000).toFixed(2)}L`;
  actions.copyTextSafe(report, "Reporte diario copiado");
}
