import { runtime, actions } from "../core/context.js";
import * as domain from "../core/domain.js";
import DOMPurify from "dompurify";

export function normalizeSubjectKey(name) {
  return (name || "General").trim().toLowerCase().replace(/\s+/g, "_");
}

export function resolveCorrectOptionIndex(lesson) {
  if (!lesson) return 0;
  const opts = Array.isArray(lesson.quizOptions) ? lesson.quizOptions : [];
  const raw = lesson.correctOptionIndex;
  if (typeof raw === "number" && !isNaN(raw)) {
    if (raw >= 0 && raw < opts.length) return raw;
    if (raw >= 1 && raw <= opts.length) return raw - 1;
  }
  const str = String(raw || "").trim();
  const num = parseInt(str, 10);
  if (!isNaN(num)) {
    if (num >= 0 && num < opts.length) return num;
    if (num >= 1 && num <= opts.length) return num - 1;
  }
  const upper = str.toUpperCase();
  const letterIdx = ["A", "B", "C", "D"].indexOf(
    upper.replace("OPCIÓN ", "").replace("OPCION ", "").trim(),
  );
  if (letterIdx !== -1 && letterIdx < opts.length) return letterIdx;
  const matchTextIdx = opts.findIndex(
    (o) =>
      String(o || "")
        .trim()
        .toLowerCase() === str.toLowerCase(),
  );
  if (matchTextIdx !== -1) return matchTextIdx;
  return 0;
}

export function ensureTutorMultiSubjectStructure() {
  if (!runtime.appState.tutorData) {
    runtime.appState.tutorData = actions.createDefaultState().tutorData;
  }
  const td = runtime.appState.tutorData;
  if (!td.subjectsMap || typeof td.subjectsMap !== "object") {
    td.subjectsMap = {};
  }
  if (!Array.isArray(td.studyDaysHistory)) {
    td.studyDaysHistory = [];
  }
  if (typeof td.totalXp !== "number") {
    td.totalXp = 0;
  }
  if (!td.streakReminderTime) {
    td.streakReminderTime = "20:00";
  }

  if (
    Object.keys(td.subjectsMap).length === 0 &&
    td.lastLesson &&
    td.lastLesson.lessonTitle &&
    td.subject
  ) {
    const initialSubjName = td.subject.trim();
    const initKey = actions.normalizeSubjectKey(initialSubjName);
    td.subjectsMap[initKey] = {
      key: initKey,
      name: initialSubjName,
      level: td.level || "Desde Cero (Principiante Absoluto)",
      goal: td.goal || "Dominar los fundamentos paso a paso",
      lessons: [
        {
          ...td.lastLesson,
          lessonNumber: 1,
          createdAt: runtime.appState.currentDay || actions.getLocalTodayIso(),
          stars: td.lastLesson.stars || 1,
          completedQuiz: td.lastLesson.completedQuiz === true,
        },
      ],
      selectedLessonIndex: 0,
    };
    td.activeSubjectKey = initKey;
  }

  // Garantizar numeración limpia desde Lección #1 por materia y candados secuenciales coherentes
  Object.values(td.subjectsMap).forEach((sObj) => {
    if (!Array.isArray(sObj.lessons)) sObj.lessons = [];
    let foundUnpassed = false;
    sObj.lessons.forEach((les, idx) => {
      les.lessonNumber = idx + 1;
      les.correctOptionIndex = actions.resolveCorrectOptionIndex(les);
      if (typeof les.completedQuiz !== "boolean") {
        les.completedQuiz = false;
      }
      // Si una lección previa no se ha aprobado, ninguna posterior puede estar marcada como aprobada

      if (!les.completedQuiz) {
        foundUnpassed = true;
      }
      les.stars = les.completedQuiz ? 3 : 1;
    });

    if (sObj.lessons.length === 0) {
      sObj.selectedLessonIndex = -1;
    } else {
      // Si el índice seleccionado apunta a una lección bloqueada por una anterior no aprobada, llevar a la primera pendiente
      const firstUnpassedIdx = sObj.lessons.findIndex((l) => !l.completedQuiz);
      const maxAllowedIdx =
        firstUnpassedIdx !== -1 ? firstUnpassedIdx : sObj.lessons.length - 1;
      if (
        typeof sObj.selectedLessonIndex !== "number" ||
        sObj.selectedLessonIndex < 0 ||
        sObj.selectedLessonIndex > maxAllowedIdx
      ) {
        sObj.selectedLessonIndex = maxAllowedIdx;
      }
    }
  });

  if (!td.activeSubjectKey || !td.subjectsMap[td.activeSubjectKey]) {
    td.activeSubjectKey = Object.keys(td.subjectsMap)[0];
  }
  return td;
}

export function getActiveSubjectObj() {
  const td = actions.ensureTutorMultiSubjectStructure();
  if (!td.activeSubjectKey || !td.subjectsMap[td.activeSubjectKey]) {
    const keys = Object.keys(td.subjectsMap || {});
    if (keys.length === 0) {
      return {
        key: "",
        name: "",
        level: "Desde Cero (Principiante Absoluto)",
        goal: "",
        lessons: [],
        selectedLessonIndex: -1,
      };
    }
    td.activeSubjectKey = keys[0];
  }
  return td.subjectsMap[td.activeSubjectKey];
}

export function getUnpassedCurrentLesson(subj) {
  if (!subj || !Array.isArray(subj.lessons) || subj.lessons.length === 0)
    return null;
  const idx = subj.lessons.findIndex((l) => !l.completedQuiz);
  if (idx !== -1) {
    return { lesson: subj.lessons[idx], index: idx, number: idx + 1 };
  }
  return null;
}

export function switchTutorSubTab(subTab) {
  runtime.activeTutorSubTab = subTab;
  ["map", "lesson", "practice", "exam"].forEach((st) => {
    const btn = document.getElementById(`tbottom-${st}`);
    if (btn) {
      btn.className =
        st === subTab
          ? "py-2 px-1.5 rounded-xl flex items-center justify-center gap-1.5 bg-terra-500 text-white shadow-sm transition relative"
          : "py-2 px-1.5 rounded-xl flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition relative";
    }
  });

  const mapBox = document.getElementById("tutorSubView-map");
  const lessonContainer = document.getElementById("tutorLessonContainer");

  if (subTab === "map") {
    if (mapBox) {
      mapBox.classList.remove("hidden");
      actions.triggerElementSlideAnim(mapBox, "subview-anim-enter");
    }
    if (lessonContainer) lessonContainer.classList.add("hidden");
  } else {
    if (mapBox) mapBox.classList.add("hidden");
    if (lessonContainer) {
      lessonContainer.classList.remove("hidden");
      actions.renderTutor();
      actions.triggerElementSlideAnim(lessonContainer, "subview-anim-enter");
    }
  }
}

export function handleLevelGateBannerClick() {
  const subj = actions.getActiveSubjectObj();
  const unpassed = actions.getUnpassedCurrentLesson(subj);
  if (unpassed) {
    subj.selectedLessonIndex = unpassed.index;
    actions.saveState();
    actions.switchTutorSubTab("exam");
    actions.showToast(
      `Abriendo Examen Jefe de la Lección #${unpassed.number} para desbloquear el candado`,
      "info",
    );
  } else {
    actions.startTutorSession("lesson");
  }
}

export function clickLockedCandyNode(
  lockedLevelNum,
  requiredLevelNum,
  nodeElId,
) {
  const nodeEl = document.getElementById(nodeElId);
  if (nodeEl) {
    nodeEl.classList.remove("anim-lock-shake");
    void nodeEl.offsetWidth;
    nodeEl.classList.add("anim-lock-shake");
  }
  const subj = actions.getActiveSubjectObj();
  const unpassed = actions.getUnpassedCurrentLesson(subj);
  if (unpassed) {
    actions.showToast(
      `Candado activo: Primero aprueba el Examen del Nivel #${unpassed.number} para desbloquear el Nivel #${lockedLevelNum}`,
      "warning",
    );
  } else {
    actions.showToast(
      `Candado activo: Primero debes completar y aprobar el Nivel #${requiredLevelNum}`,
      "warning",
    );
  }
}

export function goToNextTutorLevelOrGenerate() {
  const subj = actions.getActiveSubjectObj();
  if (!subj || !Array.isArray(subj.lessons) || subj.lessons.length === 0) {
    actions.startTutorSession("lesson");
    return;
  }
  const curIdx = subj.selectedLessonIndex;
  const curLesson = subj.lessons[curIdx];
  const curNum = curIdx + 1;

  // Si la lección actual NO está aprobada, el candado impide avanzar al siguiente nivel y lleva al examen
  if (!curLesson || !curLesson.completedQuiz) {
    const navNextBtn = document.getElementById("tutorNavNextLevelBtn");
    if (navNextBtn) {
      navNextBtn.classList.remove("anim-lock-shake");
      void navNextBtn.offsetWidth;
      navNextBtn.classList.add("anim-lock-shake");
    }
    const examCardEl = document.getElementById("tutorExamGateCard");
    if (examCardEl) {
      examCardEl.scrollIntoView({ behavior: "smooth", block: "center" });
      examCardEl.classList.remove("anim-lock-shake");
      void examCardEl.offsetWidth;
      examCardEl.classList.add("anim-lock-shake");
    } else {
      actions.switchTutorSubTab("exam");
    }
    actions.showToast(
      `Candado cerrado: Responde correctamente el Examen Jefe #${curNum} para pasar al Nivel #${curNum + 1}`,
      "warning",
    );
    return;
  }

  // Si la lección actual YA está aprobada:
  if (curIdx + 1 < subj.lessons.length) {
    actions.openSavedLessonByIndex(curIdx + 1, "lesson");
  } else {
    actions.startTutorSession("lesson");
  }
}

export function registerTutorStudyDayToday() {
  const td = actions.ensureTutorMultiSubjectStructure();
  const todayId = runtime.appState.currentDay || "2026-10-22";
  const wasAlreadyStudiedToday = td.studyDaysHistory.includes(todayId);
  if (!wasAlreadyStudiedToday) {
    td.studyDaysHistory.push(todayId);
  }
  td.streak = actions.calculateTutorDailyStreak();
  if (!wasAlreadyStudiedToday) {
    actions.triggerStreakCelebration(
      `🔥 ¡Racha de Estudio: ${td.streak} Día(s)!`,
      `Has asegurado tu racha del día (${todayId})`,
    );
  }
}

export function calculateTutorDailyStreak() {
  const history = new Set(
    actions.ensureTutorMultiSubjectStructure().studyDaysHistory || [],
  );
  let streak = 0;
  const today = domain.isoDate();
  for (
    let date = today, i = 0;
    i < 36600;
    date = domain.addDays(date, -1), i++
  ) {
    if (history.has(date)) streak++;
    else if (i !== 0) break;
  }
  return streak;
}

export function toggleNewSubjectBox() {
  const box = document.getElementById("newSubjectCreatorBox");
  if (!box) return;
  box.classList.toggle("hidden");
  if (!box.classList.contains("hidden")) {
    document.getElementById("newSubjectNameInput").focus();
  }
}

export function createNewTutorSubject() {
  const input = document.getElementById("newSubjectNameInput");
  const rawName = (input.value || "").trim();
  if (!rawName) {
    actions.showToast("Escribe el nombre de la nueva materia", "warning");
    return;
  }
  const td = actions.ensureTutorMultiSubjectStructure();
  const key = actions.normalizeSubjectKey(rawName);
  if (Array.isArray(td.deletedSubjectsRegistry)) {
    td.deletedSubjectsRegistry = td.deletedSubjectsRegistry.filter(
      (x) => x !== key.toLowerCase(),
    );
  } else {
    td.deletedSubjectsRegistry = [];
  }
  td.subjectsModifiedAt = Date.now();

  if (!td.subjectsMap[key]) {
    td.subjectsMap[key] = {
      key,
      name: rawName,
      level: "Desde Cero (Principiante Absoluto)",
      goal: `Dominar ${rawName} paso a paso desde la Lección 1`,
      lessons: [],
      selectedLessonIndex: -1,
    };
    actions.showToast(
      `Materia "${rawName}" creada. Inicia limpia en la Lección #1`,
      "success",
    );
  } else {
    actions.showToast(`Cambiado a "${td.subjectsMap[key].name}"`, "info");
  }

  td.activeSubjectKey = key;
  td.subject = td.subjectsMap[key].name;
  td.level = td.subjectsMap[key].level;
  td.goal = td.subjectsMap[key].goal;
  input.value = "";
  document.getElementById("newSubjectCreatorBox").classList.add("hidden");
  actions.switchTutorSubTab("map");
  actions.saveState();
}

export function selectTutorSubject(subjKey) {
  const td = actions.ensureTutorMultiSubjectStructure();
  if (!td.subjectsMap[subjKey]) return;
  td.activeSubjectKey = subjKey;
  const subj = td.subjectsMap[subjKey];
  td.subject = subj.name;
  td.level = subj.level;
  td.goal = subj.goal;
  actions.saveState();
  const mainTutorSec = document.getElementById("tab-tutor");
  if (mainTutorSec)
    actions.triggerElementSlideAnim(mainTutorSec, "subview-anim-enter");
  actions.showToast(
    `Materia activa: ${subj.name} (${subj.lessons.length === 0 ? "Lista para Lección #1" : subj.lessons.length + " nivel(es)"})`,
    "info",
  );
}

export function deleteTutorSubject(subjKey, ev) {
  if (ev) ev.stopPropagation();
  const td = actions.ensureTutorMultiSubjectStructure();
  td.subjectsModifiedAt = Date.now();
  const keys = Object.keys(td.subjectsMap);
  if (keys.length <= 1) {
    td.subjectsMap[subjKey].lessons = [];
    td.subjectsMap[subjKey].selectedLessonIndex = -1;
    actions.saveState();
    actions.showToast(
      "Se reiniciaron los niveles de esta materia a 0 (Lista para Lección #1)",
      "info",
    );
    return;
  }
  const deletedName = td.subjectsMap[subjKey]?.name || "Materia";
  if (!Array.isArray(td.deletedSubjectsRegistry))
    td.deletedSubjectsRegistry = [];
  if (!td.deletedSubjectsRegistry.includes(subjKey.toLowerCase())) {
    td.deletedSubjectsRegistry.push(subjKey.toLowerCase());
  }
  delete td.subjectsMap[subjKey];
  td.activeSubjectKey = Object.keys(td.subjectsMap)[0];
  actions.saveState();
  actions.showToast(`Materia "${deletedName}" eliminada`, "info");
}

export function saveTutorConfig() {
  const td = actions.ensureTutorMultiSubjectStructure();
  const typedName = (
    document.getElementById("tutorSubjectInput")?.value || ""
  ).trim();
  if (!typedName) return;
  const levelVal =
    document.getElementById("tutorLevelSelect")?.value ||
    "Desde Cero (Principiante Absoluto)";
  const goalVal = (
    document.getElementById("tutorGoalInput")?.value || ""
  ).trim();

  const newKey = actions.normalizeSubjectKey(typedName);
  if (Array.isArray(td.deletedSubjectsRegistry)) {
    td.deletedSubjectsRegistry = td.deletedSubjectsRegistry.filter(
      (x) => x !== newKey.toLowerCase(),
    );
  }
  td.subjectsModifiedAt = Date.now();
  if (!td.subjectsMap[newKey]) {
    td.subjectsMap[newKey] = {
      key: newKey,
      name: typedName,
      level: levelVal,
      goal: goalVal || `Aprender ${typedName} desde la Lección 1`,
      lessons: [],
      selectedLessonIndex: -1,
    };
  } else {
    td.subjectsMap[newKey].name = typedName;
    td.subjectsMap[newKey].level = levelVal;
    td.subjectsMap[newKey].goal = goalVal;
  }

  td.activeSubjectKey = newKey;
  td.subject = typedName;
  td.level = levelVal;
  td.goal = goalVal;
  actions.saveState();
}

export async function handleTutorImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  runtime.currentTutorImageBase64 = await actions.compressImageFile(
    file,
    900,
    0.8,
  );
  document.getElementById("tutorPhotoThumb").src =
    runtime.currentTutorImageBase64;
  document.getElementById("tutorPhotoPreviewBox").classList.remove("hidden");
  actions.showToast("Foto de apunte lista para el Profe IA", "success");
}

export function clearTutorPhoto() {
  runtime.currentTutorImageBase64 = null;
  document.getElementById("tutorImageInput").value = "";
  document.getElementById("tutorPhotoPreviewBox").classList.add("hidden");
}

export function openSavedLessonByIndex(idx, targetSubTab = "lesson") {
  const subj = actions.getActiveSubjectObj();
  if (!subj || !subj.lessons[idx]) return;

  // Verificar candado secuencial: no puede abrir una lección posterior si hay una anterior sin aprobar
  for (let k = 0; k < idx; k++) {
    if (!subj.lessons[k].completedQuiz) {
      subj.selectedLessonIndex = k;
      actions.saveState();
      actions.switchTutorSubTab("exam");
      actions.showToast(
        `Candado activo: Primero debes aprobar el Examen del Nivel #${k + 1} antes de abrir el Nivel #${idx + 1}`,
        "warning",
      );
      return;
    }
  }

  subj.selectedLessonIndex = idx;
  actions.saveState();
  actions.switchTutorSubTab(targetSubTab);
  actions.showToast(
    `Abriendo Nivel #${idx + 1}: ${subj.lessons[idx].lessonTitle}`,
    "info",
  );
}

export async function regenerateCurrentTutorLesson() {
  await actions.startTutorSession("lesson", true);
}

export async function startTutorSession(
  mode,
  forceRegenerateSameLevel = false,
) {
  if (!actions.isAIReady()) {
    actions.showToast(
      "Inicia sesión y configura el servicio de IA en Ajustes",
      "warning",
    );
    actions.switchTab("settings");
    return;
  }
  actions.saveTutorConfig();

  let td = actions.ensureTutorMultiSubjectStructure();
  let subj = actions.getActiveSubjectObj();
  const requestedDate = domain.isoDate(),
    requestedImage = runtime.currentTutorImageBase64;
  if (!subj || !subj.name) {
    const typedNew = (
      document.getElementById("newSubjectNameInput")?.value ||
      document.getElementById("tutorSubjectInput")?.value ||
      ""
    ).trim();
    if (!typedNew) {
      actions.toggleNewSubjectBox();
      actions.showToast(
        "Primero escribe el nombre de tu materia (ej. Matemáticas, Python, Inglés)",
        "warning",
      );
      return;
    }
    document.getElementById("tutorSubjectInput").value = typedNew;
    actions.saveTutorConfig();
    subj = actions.getActiveSubjectObj();
  }

  // CANDADO DE PASO DE NIVEL: Si hay una lección sin aprobar el examen, no puede desbloquear el siguiente nivel
  const unpassed = actions.getUnpassedCurrentLesson(subj);
  if (mode === "lesson" && unpassed && !forceRegenerateSameLevel) {
    subj.selectedLessonIndex = unpassed.index;
    actions.saveState();
    const gateBanner = document.getElementById("tutorLevelGateBanner");
    if (gateBanner) {
      gateBanner.classList.remove("anim-lock-shake");
      void gateBanner.offsetWidth;
      gateBanner.classList.add("anim-lock-shake");
    }
    actions.switchTutorSubTab("exam");
    actions.showToast(
      `Candado activo: Primero aprueba el Examen Jefe de la Lección #${unpassed.number} para desbloquear el Nivel #${unpassed.number + 1}`,
      "warning",
    );
    return;
  }

  const targetLessonNum =
    forceRegenerateSameLevel && unpassed
      ? unpassed.number
      : subj.lessons.length + 1;

  const previousTitles =
    subj.lessons
      .slice(0, targetLessonNum - 1)
      .map((l, i) => `Lección ${i + 1}: ${l.lessonTitle}`)
      .join("; ") || "Ninguna (Esta es la Lección #1 inicial de esta materia)";

  const notes = (
    document.getElementById("tutorNotesInput")?.value || ""
  ).trim();

  const btn = document.getElementById(
    mode === "lesson" ? "tutorLessonBtn" : "tutorReviewBtn",
  );
  const orig = btn.innerHTML;
  btn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full spinner"></div><span>Creando Nivel #${targetLessonNum}...</span>`;
  btn.disabled = true;

  try {
    const prompt = `Actúa como el mejor profesor interactivo de "${subj.name}".
        - Nivel del alumno en esta materia: "${subj.level}".
        - Objetivo actual: "${subj.goal}".
        - Número exacto de lección en "${subj.name}": LECCIÓN #${targetLessonNum}.
        - Lecciones previas en esta materia (NO las repitas, continúa el camino): ${previousTitles}.
        - Modo solicitado: "${mode === "lesson" ? `Lección #${targetLessonNum} progresiva, visual e interactiva + Examen Jefe de Nivel` : "Revisión detallada de tarea/apuntes/código con correcciones"}".
        ${notes ? `- Apuntes, tarea o código del alumno: "${notes}"` : ""}

        REGLAS ESTRICTAS DE CONTENIDO VISUAL, MATEMÁTICAS Y CÓDIGO:
        1. Clasifica "category" estrictamente en UNO de estos 4 valores:
           - "code": ÚNICAMENTE si la materia o tema trata sobre programación, desarrollo de software, Python, JavaScript, HTML, CSS, SQL, C++, algoritmos o terminal.
           - "math": Si trata sobre matemáticas, cálculo, álgebra, física, química, estadística, investigación de operaciones o finanzas con ecuaciones.
           - "language": Si trata sobre idiomas (inglés, francés, gramática, vocabulario).
           - "general": Cualquier otra materia teórica o práctica.
        2. Si "category" NO es "code", DEBES poner obligatoriamente "codeLanguage": "none", "codeBlock": "" y "codeOutput": "". ¡Nunca pongas código cuando la clase no sea de programación!
        3. Si "category" ES "code", llena "codeLanguage" (ej. "python", "javascript", "html", "sql"), pon un programa completo y bien indentado en "codeBlock", y su salida en "codeOutput".
        4. Si "category" ES "math" (o el tema usa fórmulas), llena "formulas" con al menos 2 fórmulas claras (sin usar signos $ de LaTeX; usa subíndices legibles como x1, x2). Si no lleva fórmulas, pon "formulas": [].
        5. En el examen ("quizQuestion", "quizOptions"), "correctOptionIndex" DEBE ser un número entero entre 0 y 3 (donde 0 es la primera opción, 1 la segunda, 2 la tercera, 3 la cuarta).

        Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta:
        {
          "category": "code | math | language | general",
          "lessonTitle": "Título de la Lección #${targetLessonNum}",
          "summaryBanner": "Resumen motivador de 1 línea de lo que aprenderá en este nivel",
          "explanation": "Explicación didáctica completa dividida en párrafos claros con ejemplos prácticos",
          "visualDiagram": {
            "diagramTitle": "Esquema Visual de Referencia: Lección #${targetLessonNum}",
            "steps": [
              {"badge": "1. Base", "title": "Concepto central", "detail": "Explicación visual breve"},
              {"badge": "2. Estructura", "title": "Cómo funciona", "detail": "Mecanismo o regla clave"},
              {"badge": "3. Ejemplo", "title": "Caso real", "detail": "Aplicación directa"},
              {"badge": "4. Dominio", "title": "Resultado", "detail": "Lo que debes recordar"}
            ]
          },
          "formulas": [
            {"name": "Nombre de Fórmula", "expression": "Ecuación matemática clara", "variables": "Significado de cada variable", "example": "Sustitución paso a paso con números"}
          ],
          "codeLanguage": "none",
          "codeBlock": "",
          "codeOutput": "",
          "keyTerms": ["Concepto 1", "Concepto 2", "Concepto 3"],
          "flashcards": [
            {"front": "Pregunta 1 para memorizar", "back": "Respuesta clara al voltear"},
            {"front": "Pregunta 2 para memorizar", "back": "Respuesta clara al voltear"},
            {"front": "Pregunta 3 para memorizar", "back": "Respuesta clara al voltear"}
          ],
          "interactiveChallenge": {
            "prompt": "Ejercicio o mini-reto rápido para resolver ahora mismo",
            "hint": "Pista clave",
            "solution": "Solución explicada paso a paso"
          },
          "homeworkFeedback": "Retroalimentación a sus apuntes o consejo experto del profesor",
          "quizQuestion": "Pregunta de Examen Jefe para aprobar la Lección #${targetLessonNum} y abrir el candado del Nivel #${targetLessonNum + 1}",
          "quizOptions": ["Opción A", "Opción B", "Opción C", "Opción D"],
          "correctOptionIndex": 0,
          "quizExplanation": "Por qué esta respuesta es la correcta"
        }`;

    const subjectKey = subj.key;
    const resText = await actions.callGeminiAPI(
      prompt,
      requestedImage,
      "lesson",
    );
    td = runtime.appState.tutorData;
    subj = td.subjectsMap[subjectKey];
    if (!subj) throw new Error("La materia ya no existe.");
    const parsed = JSON.parse(resText);

    const newLessonObj = {
      ...parsed,
      correctOptionIndex: actions.resolveCorrectOptionIndex(parsed),
      lessonNumber: targetLessonNum,
      createdAt: requestedDate,
      referenceImage: requestedImage || null,
      stars: 1,
      completedQuiz: false,
      lastSelectedQuizOption: null,
    };

    td.subjectsModifiedAt = Date.now();
    if (mode === "review" && subj.lessons.length > 0) {
      const targetIdx =
        subj.selectedLessonIndex >= 0 &&
        subj.selectedLessonIndex < subj.lessons.length
          ? subj.selectedLessonIndex
          : subj.lessons.length - 1;
      const existingLesson = subj.lessons[targetIdx];
      existingLesson.homeworkFeedback =
        parsed.homeworkFeedback || parsed.explanation || "Revisión completada.";
      if (requestedImage) existingLesson.referenceImage = requestedImage;
      if (parsed.codeBlock && actions.isStrictCodeLesson(parsed, subj.name)) {
        existingLesson.codeLanguage =
          parsed.codeLanguage || existingLesson.codeLanguage;
        existingLesson.codeBlock = parsed.codeBlock;
        existingLesson.codeOutput =
          parsed.codeOutput || existingLesson.codeOutput;
      }
      if (Array.isArray(parsed.formulas) && parsed.formulas.length > 0) {
        existingLesson.formulas = parsed.formulas;
      }
      subj.selectedLessonIndex = targetIdx;
      actions.registerTutorStudyDayToday();
      td.totalXp = (td.totalXp || 0) + 30;
      if (runtime.currentTutorImageBase64) actions.clearTutorPhoto();
      actions.saveState();
      actions.switchTutorSubTab("lesson");
      actions.showToast(
        `Revisión de tarea/código integrada en el Nivel #${targetIdx + 1} (sin alterar tus niveles)`,
        "success",
      );
    } else {
      if (forceRegenerateSameLevel && unpassed) {
        subj.lessons[unpassed.index] = newLessonObj;
        subj.selectedLessonIndex = unpassed.index;
      } else {
        subj.lessons.push(newLessonObj);
        subj.selectedLessonIndex = subj.lessons.length - 1;
      }

      actions.registerTutorStudyDayToday();
      td.totalXp = (td.totalXp || 0) + 40;
      td.lessonsCompleted = Object.values(td.subjectsMap).reduce(
        (acc, sObj) => acc + (sObj.lessons?.length || 0),
        0,
      );
      td.lastLesson = newLessonObj;

      if (runtime.currentTutorImageBase64) actions.clearTutorPhoto();
      actions.saveState();
      actions.switchTutorSubTab("lesson");
      actions.showToast(
        `¡Nivel #${targetLessonNum} creado! Lee la clase y aprueba el Examen Jefe al final para abrir el candado del Nivel #${targetLessonNum + 1}`,
        "success",
      );
    }
  } catch (err) {
    actions.showToast("Error Profe IA: " + err.message, "error");
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

export function formatMathClean(str) {
  if (!str) return "";
  const subMap = {
    0: "₀",
    1: "₁",
    2: "₂",
    3: "₃",
    4: "₄",
    5: "₅",
    6: "₆",
    7: "₇",
    8: "₈",
    9: "₉",
    i: "ᵢ",
    j: "ⱼ",
    n: "ₙ",
    m: "ₘ",
  };
  const supMap = {
    0: "⁰",
    1: "¹",
    2: "²",
    3: "³",
    4: "⁴",
    5: "⁵",
    6: "⁶",
    7: "⁷",
    8: "⁸",
    9: "⁹",
    n: "ⁿ",
  };
  let out = String(str)
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\\cdot/g, "·")
    .replace(/\\times/g, "×")
    .replace(/\\leq/g, "≤")
    .replace(/\\geq/g, "≥")
    .replace(/\\neq/g, "≠")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\sum/g, "∑")
    .replace(/\\sqrt\{([^}]+)\}/g, "√($1)")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/_\{([0-9ijnm]+)\}/g, (_, g) =>
      g
        .split("")
        .map((c) => subMap[c] || c)
        .join(""),
    )
    .replace(/_([0-9ijnm])/g, (_, c) => subMap[c] || "_" + c)
    .replace(/\^\{([0-9n]+)\}/g, (_, g) =>
      g
        .split("")
        .map((c) => supMap[c] || c)
        .join(""),
    )
    .replace(/\^([0-9n])/g, (_, c) => supMap[c] || "^" + c);
  return actions.escapeHtmlSafe(out);
}

export function isStrictCodeLesson(lesson, subjName) {
  if (!lesson) return false;
  const rawCode = String(lesson.codeBlock || "").trim();
  if (rawCode.length < 6) return false;
  const lowerCode = rawCode.toLowerCase();
  if (
    lowerCode.includes("si es clase de programación") ||
    lowerCode === "none" ||
    lowerCode === "no aplica" ||
    lowerCode === "n/a"
  ) {
    return false;
  }
  const lang = String(lesson.codeLanguage || "")
    .trim()
    .toLowerCase();
  if (lang === "none" || lang === "no aplica" || lang === "n/a") return false;

  const cat = String(lesson.category || "")
    .trim()
    .toLowerCase();
  if (cat === "code") return true;

  const combinedText =
    `${subjName || ""} ${lesson.lessonTitle || ""} ${lang}`.toLowerCase();
  const codeKeywords = [
    "programac",
    "python",
    "javascript",
    "typescript",
    "html",
    "css",
    "sql",
    "java",
    "c++",
    "c#",
    "react",
    "node",
    "codigo",
    "código",
    "algoritm",
    "bash",
    "linux",
    "php",
    "swift",
    "kotlin",
    "rust",
    "golang",
  ];
  return codeKeywords.some((kw) => combinedText.includes(kw));
}

export function getValidMathFormulas(lesson) {
  if (!lesson || !Array.isArray(lesson.formulas)) return [];
  return lesson.formulas.filter((fm) => {
    if (!fm || !fm.expression) return false;
    const exp = String(fm.expression).trim().toLowerCase();
    return (
      exp.length > 2 && exp !== "none" && exp !== "no aplica" && exp !== "n/a"
    );
  });
}

export function copyLessonCodeBlock() {
  const subj = actions.getActiveSubjectObj();
  const lesson = subj?.lessons?.[subj.selectedLessonIndex];
  if (!lesson || !lesson.codeBlock) return;
  actions.copyTextSafe(
    lesson.codeBlock,
    "Código copiado del IDE al portapapeles",
  );
}

export function simulateIdeRun() {
  const el = document.getElementById("ideRunStatusText");
  if (el) el.textContent = "Salida ilustrativa · código sin ejecutar";
  actions.showToast(
    "Esta salida es un ejemplo generado por IA. Puedes copiar el código y comprobarlo en tu entorno.",
    "info",
  );
}

export function toggleFlashcardFlip(cardIdx) {
  const cardWrap = document.getElementById(`fc-wrap-${cardIdx}`);
  const frontEl = document.getElementById(`fc-front-${cardIdx}`);
  const backEl = document.getElementById(`fc-back-${cardIdx}`);
  if (!frontEl || !backEl) return;
  if (cardWrap) actions.triggerElementSlideAnim(cardWrap, "subview-anim-enter");
  frontEl.classList.toggle("hidden");
  backEl.classList.toggle("hidden");
}

export function toggleChallengeSolution(type) {
  const el = document.getElementById(`tutor-challenge-${type}`);
  if (el) {
    el.classList.toggle("hidden");
    if (!el.classList.contains("hidden"))
      actions.triggerElementSlideAnim(el, "subview-anim-enter");
  }
}

export function answerTutorQuiz(selectedIdx) {
  const td = actions.ensureTutorMultiSubjectStructure();
  const subj = actions.getActiveSubjectObj();
  const lesson = subj?.lessons?.[subj.selectedLessonIndex];
  if (!lesson) return;

  const correctIdx = actions.resolveCorrectOptionIndex(lesson);
  lesson.lastSelectedQuizOption = selectedIdx;

  if (selectedIdx === correctIdx) {
    const firstTime = !lesson.completedQuiz;
    lesson.completedQuiz = true;
    lesson.stars = 3;
    if (firstTime) {
      td.totalXp = (td.totalXp || 0) + 100;
    }
    actions.playBeep();
    actions.saveState();
    actions.triggerStreakCelebration(
      `🔓 ¡Candado Abierto! Nivel #${lesson.lessonNumber} Superado`,
      `Has ganado 3 estrellas (★★★) y desbloqueaste el Nivel #${lesson.lessonNumber + 1}`,
    );
    actions.showToast(
      `¡Correcto! Se abrió el candado del Nivel #${lesson.lessonNumber + 1}`,
      "success",
    );
  } else {
    actions.saveState();
    const examCardEl = document.getElementById("tutorExamGateCard");
    if (examCardEl) {
      examCardEl.classList.remove("anim-lock-shake");
      void examCardEl.offsetWidth;
      examCardEl.classList.add("anim-lock-shake");
    }
    actions.showToast(
      "Respuesta incorrecta: el candado sigue cerrado. Intenta con otra opción.",
      "error",
    );
  }
}

export function buildFullVisualIdeHtml(lesson, subjName, currentNum) {
  if (!actions.isStrictCodeLesson(lesson, subjName)) return "";

  const rawLang = (lesson.codeLanguage || "python").toLowerCase();
  let ext = "py";
  if (rawLang.includes("js") || rawLang.includes("javascript")) ext = "js";
  else if (rawLang.includes("ts") || rawLang.includes("typescript")) ext = "ts";
  else if (rawLang.includes("html")) ext = "html";
  else if (rawLang.includes("sql")) ext = "sql";
  else if (rawLang.includes("cpp") || rawLang.includes("c++")) ext = "cpp";
  else if (rawLang.includes("java")) ext = "java";

  const fileName = `leccion_${currentNum}.${ext}`;
  const codeLines = String(lesson.codeBlock || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const numberedCodeRows = codeLines
    .map((lineText, idx) => {
      const safeLine = actions.escapeHtmlSafe(lineText) || "&nbsp;";
      const isComment =
        lineText.trim().startsWith("#") ||
        lineText.trim().startsWith("//") ||
        lineText.trim().startsWith("--");
      const lineColorClass = isComment
        ? "text-slate-400 italic"
        : "text-emerald-300";
      return `
          <div class="flex hover:bg-white/5 px-2 py-0.5 rounded">
            <span class="w-7 shrink-0 select-none text-right pr-3 text-[10px] text-slate-600 font-mono">${idx + 1}</span>
            <span class="flex-1 font-mono text-[11px] ${lineColorClass} whitespace-pre">${safeLine}${idx === codeLines.length - 1 ? '<span class="ide-cursor ml-0.5"></span>' : ""}</span>
          </div>
        `;
    })
    .join("");

  return `
        <div class="rounded-3xl overflow-hidden border-2 border-emerald-500/40 bg-[#0d1117] text-slate-100 shadow-2xl card-minimal-anim">
          <div class="flex items-center justify-between px-3.5 py-2 bg-[#161b22] border-b border-slate-800">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span class="text-[10px] font-mono font-black text-slate-300 ml-1.5 flex items-center gap-1">
                <i class="fi fi-rr-laptop-code text-emerald-400"></i>
                <span>TCC Studio IDE • ${actions.escapeHtmlSafe(rawLang.toUpperCase())}</span>
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              <button onclick="simulateIdeRun()" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black flex items-center gap-1 shadow">
                <i class="fi fi-sr-play text-[9px]"></i> <span>Run</span>
              </button>
              <button onclick="copyLessonCodeBlock()" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center gap-1 border border-slate-700">
                <i class="fi fi-rr-copy-alt"></i> <span>Copiar</span>
              </button>
            </div>
          </div>

          <div class="flex items-center bg-[#0d1117] border-b border-slate-800 text-[10px] font-mono overflow-x-auto no-scrollbar">
            <div class="px-3.5 py-2 bg-[#161b22] border-t-2 border-emerald-400 text-emerald-300 font-bold flex items-center gap-1.5">
              <i class="fi fi-rr-file-code text-emerald-400"></i>
              <span>${fileName}</span>
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1"></span>
            </div>
            <div class="px-3 py-2 text-slate-500 border-r border-slate-800/80 flex items-center gap-1">
              <i class="fi fi-rr-document"></i>
              <span>apuntes_nivel_${currentNum}.md</span>
            </div>
          </div>

          <div class="grid grid-cols-12 min-h-[190px]">
            <div class="col-span-4 sm:col-span-3 bg-[#161b22]/70 border-r border-slate-800 p-2.5 font-mono text-[10px] space-y-1.5 select-none">
              <div class="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Explorador</div>
              <div class="text-slate-300 font-bold flex items-center gap-1 truncate">
                <i class="fi fi-rr-folder-open text-amber-400"></i>
                <span class="truncate">${actions.escapeHtmlSafe(actions.normalizeSubjectKey(subjName))}</span>
              </div>
              <div class="pl-2 space-y-1">
                <div class="px-1.5 py-1 rounded bg-emerald-500/15 text-emerald-300 font-bold truncate flex items-center gap-1">
                  <i class="fi fi-rr-file-code text-[9px]"></i>
                  <span class="truncate">${fileName}</span>
                </div>
                <div class="px-1.5 py-0.5 text-slate-500 truncate flex items-center gap-1">
                  <i class="fi fi-rr-file text-[9px]"></i>
                  <span class="truncate">tests_${currentNum}.${ext}</span>
                </div>
                <div class="px-1.5 py-0.5 text-slate-500 truncate flex items-center gap-1">
                  <i class="fi fi-rr-settings text-[9px]"></i>
                  <span class="truncate">config.json</span>
                </div>
              </div>
            </div>

            <div class="col-span-8 sm:col-span-9 py-2.5 overflow-x-auto bg-[#0d1117]">
              ${numberedCodeRows}
            </div>
          </div>

          <div class="bg-[#090d13] border-t border-slate-800 p-3 font-mono text-[11px] space-y-1.5">
            <div class="flex items-center justify-between text-[9px] text-slate-400 border-b border-slate-800/80 pb-1.5">
              <div class="flex items-center gap-3 font-bold uppercase">
                <span class="text-emerald-400 border-b border-emerald-400 pb-0.5">TERMINAL</span>
                <span class="text-slate-500">SALIDA</span>
                <span class="text-slate-500">PROBLEMAS (0)</span>
              </div>
              <span id="ideRunStatusText" class="text-emerald-400 font-bold">● Listo</span>
            </div>
            <div id="ideSimulatedTerminalOutput" class="space-y-1 transition-opacity duration-300">
              <div class="text-slate-400 text-[10px]">$ ejecutar ${fileName}</div>
              <div class="text-sky-300 whitespace-pre-wrap pl-2 border-l-2 border-emerald-500/50">${actions.escapeHtmlSafe(lesson.codeOutput || "Programa ejecutado correctamente.")}</div>
            </div>
          </div>

          <div class="bg-emerald-600 text-slate-950 px-3 py-1 text-[9px] font-mono font-black flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span>⎇ main*</span>
              <span>✓ 0 errores</span>
            </div>
            <div class="flex items-center gap-2.5">
              <span>Ln ${codeLines.length}, Col 1</span>
              <span>UTF-8</span>
              <span>${actions.escapeHtmlSafe(rawLang.toUpperCase())}</span>
            </div>
          </div>
        </div>
      `;
}

export function buildVisualReferenceCardHtml(lesson, subjName) {
  const vd = lesson.visualDiagram || {};
  const steps =
    Array.isArray(vd.steps) && vd.steps.length > 0
      ? vd.steps
      : [
          { badge: "Paso 1", title: "Entrada", detail: subjName },
          {
            badge: "Paso 2",
            title: "Regla",
            detail: lesson.lessonTitle || "Concepto",
          },
          { badge: "Paso 3", title: "Aplicación", detail: "Práctica guiada" },
          { badge: "Paso 4", title: "Dominio", detail: "Nivel completado" },
        ];

  const cat = (lesson.category || "general").toLowerCase();
  let themeGrad =
    "from-indigo-950 via-slate-900 to-blue-950 border-blue-500/30";
  let iconClass = "fi-rr-bulb text-amber-400";
  let customSvgGraphic = `
        <svg viewBox="0 0 280 70" class="w-full h-16 rounded-2xl bg-black/30 p-2 border border-white/10">
          <circle cx="35" cy="35" r="18" fill="#3b82f6" fill-opacity="0.25" stroke="#60a5fa" stroke-width="2"/>
          <text x="35" y="39" text-anchor="middle" fill="#93c5fd" font-size="11" font-weight="bold">01</text>
          <line x1="55" y1="35" x2="95" y2="35" stroke="#60a5fa" stroke-width="2" stroke-dasharray="4 3"/>
          <rect x="98" y="17" width="84" height="36" rx="10" fill="#e05a33" fill-opacity="0.25" stroke="#fb923c" stroke-width="2"/>
          <text x="140" y="39" text-anchor="middle" fill="#fdba74" font-size="10" font-weight="bold">CONCEPTO CLAVE</text>
          <line x1="184" y1="35" x2="222" y2="35" stroke="#34d399" stroke-width="2" stroke-dasharray="4 3"/>
          <circle cx="245" cy="35" r="18" fill="#10b981" fill-opacity="0.25" stroke="#34d399" stroke-width="2"/>
          <text x="245" y="39" text-anchor="middle" fill="#6ee7b7" font-size="11" font-weight="bold">★</text>
        </svg>
      `;

  if (cat === "math") {
    themeGrad =
      "from-amber-950/90 via-slate-900 to-rose-950/90 border-amber-500/40";
    iconClass = "fi-rr-calculator text-amber-400";
    customSvgGraphic = `
          <svg viewBox="0 0 280 76" class="w-full h-20 rounded-2xl bg-black/40 p-2 border border-amber-500/30">
            <line x1="20" y1="62" x2="260" y2="62" stroke="#64748b" stroke-width="1.5"/>
            <line x1="35" y1="10" x2="35" y2="68" stroke="#64748b" stroke-width="1.5"/>
            <path d="M 35 58 Q 110 52, 165 28 T 245 12" fill="none" stroke="#fbbf24" stroke-width="3"/>
            <circle cx="165" cy="28" r="5" fill="#f43f5e"/>
            <text x="160" y="20" fill="#fde68a" font-size="9" font-family="monospace" font-weight="bold">f(x) • Óptimo</text>
          </svg>
        `;
  } else if (cat === "code") {
    themeGrad =
      "from-slate-950 via-emerald-950/60 to-slate-900 border-emerald-500/40";
    iconClass = "fi-rr-laptop-code text-emerald-400";
    customSvgGraphic = `
          <svg viewBox="0 0 280 72" class="w-full h-18 rounded-2xl bg-black/40 p-2 border border-emerald-500/30">
            <rect x="12" y="16" width="68" height="40" rx="8" fill="#064e3b" stroke="#34d399" stroke-width="1.5"/>
            <text x="46" y="40" text-anchor="middle" fill="#a7f3d0" font-size="9" font-family="monospace" font-weight="bold">INPUT()</text>
            <line x1="82" y1="36" x2="106" y2="36" stroke="#34d399" stroke-width="2"/>
            <rect x="108" y="16" width="68" height="40" rx="8" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
            <text x="142" y="40" text-anchor="middle" fill="#bae6fd" font-size="9" font-family="monospace" font-weight="bold">LÓGICA</text>
            <line x1="178" y1="36" x2="202" y2="36" stroke="#38bdf8" stroke-width="2"/>
            <rect x="204" y="16" width="64" height="40" rx="8" fill="#312e81" stroke="#a78bfa" stroke-width="1.5"/>
            <text x="236" y="40" text-anchor="middle" fill="#ddd6fe" font-size="9" font-family="monospace" font-weight="bold">OUTPUT</text>
          </svg>
        `;
  }

  const nodesHtml = steps
    .slice(0, 4)
    .map(
      (st, idx) => `
        <div class="relative p-3 rounded-2xl bg-slate-900/90 border border-white/10 flex flex-col justify-between shadow-md card-minimal-anim">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-terra-500/20 text-terra-400">${actions.escapeHtmlSafe(st.badge || `Paso ${idx + 1}`)}</span>
            <span class="text-[10px] text-slate-500 font-black">0${idx + 1}</span>
          </div>
          <p class="text-xs font-extrabold text-white leading-snug">${actions.formatMathClean(st.title)}</p>
          <p class="text-[10px] text-slate-300 mt-1 leading-relaxed">${actions.formatMathClean(st.detail)}</p>
        </div>
      `,
    )
    .join("");

  const userRefImgHtml = lesson.referenceImage
    ? `
        <div class="mt-3 pt-3 border-t border-white/10">
          <span class="text-[10px] font-extrabold uppercase text-sky-400 block mb-1.5">Tu Imagen / Apunte Guardado en esta Lección:</span>
          <img src="${actions.escapeHtmlSafe(domain.safeImageUrl(lesson.referenceImage))}" class="w-full max-h-56 object-contain rounded-2xl border border-white/15 bg-black/40 p-1">
        </div>
      `
    : "";

  return `
        <div class="rounded-3xl p-4 bg-gradient-to-br ${themeGrad} border text-white space-y-3 shadow-lg card-minimal-anim">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="fi ${iconClass} text-base"></i>
              <div>
                <span class="text-[9px] font-extrabold uppercase tracking-wider text-slate-300 block">Lámina & Esquema Visual Referencial</span>
                <h4 class="text-xs font-black">${actions.formatMathClean(vd.diagramTitle || `Mapa Visual: ${lesson.lessonTitle}`)}</h4>
              </div>
            </div>
            <span class="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-slate-200 font-bold">Ilustración IA</span>
          </div>
          ${customSvgGraphic}
          <div class="grid grid-cols-2 gap-2.5">
            ${nodesHtml}
          </div>
          ${userRefImgHtml}
        </div>
      `;
}

export function renderCandyCrushMap(subj) {
  const mapEl = document.getElementById("tutorCandyMapContainer");
  const titleEl = document.getElementById("candyMapSubjectTitle");
  const starsEl = document.getElementById("candyMapStarsCount");
  if (!mapEl) return;

  const lessons = subj.lessons || [];
  const totalStars = lessons.reduce(
    (acc, l) => acc + (l.completedQuiz ? 3 : 1),
    0,
  );
  if (titleEl) titleEl.textContent = `Mapa de Niveles: ${subj.name}`;
  if (starsEl) starsEl.textContent = `★ ${totalStars} estrellas`;

  const unpassed = actions.getUnpassedCurrentLesson(subj);
  const totalNodesToShow = Math.max(4, lessons.length + 2);
  const offsets = [
    "translate-x-0",
    "translate-x-3",
    "-translate-x-3",
    "translate-x-2",
    "-translate-x-2",
  ];

  let nodesMarkup = "";
  for (let i = 0; i < totalNodesToShow; i++) {
    const lessonNum = i + 1;
    const offsetClass = offsets[i % offsets.length];
    const isGenerated = i < lessons.length;
    const isCurrentSelected = i === subj.selectedLessonIndex;
    const isNextToGenerate = i === lessons.length;

    // Un nivel i está bloqueado con candado si cualquier nivel anterior k < i no ha aprobado su examen
    let isLockedByPrevious = false;
    let blockingLevelNum = 1;
    for (let k = 0; k < i; k++) {
      if (!lessons[k] || !lessons[k].completedQuiz) {
        isLockedByPrevious = true;
        blockingLevelNum = k + 1;
        break;
      }
    }

    const pathUnlocked =
      isGenerated && lessons[i].completedQuiz && !isLockedByPrevious;
    const connectorLine =
      i < totalNodesToShow - 1
        ? `
          <div class="flex flex-col items-center my-0.5">
            <div class="w-1.5 h-6 rounded-full ${pathUnlocked ? "bg-gradient-to-b from-emerald-400 to-amber-400 shadow-sm" : "bg-slate-300 dark:bg-slate-800 border-l border-dashed border-slate-500"}"></div>
          </div>
        `
        : "";

    if (isGenerated && !isLockedByPrevious) {
      const lObj = lessons[i];
      const passed = !!lObj.completedQuiz;
      const starsCount = passed ? 3 : 1;
      const starsStr =
        "★".repeat(starsCount) + "☆".repeat(Math.max(0, 3 - starsCount));
      nodesMarkup += `
            <div class="flex flex-col items-center w-full">
              <button onclick="openSavedLessonByIndex(${i}, 'lesson')" class="transform ${offsetClass} w-full max-w-[275px] group relative flex items-center gap-3 p-2.5 rounded-3xl transition shadow-md border-2 ${
                isCurrentSelected
                  ? "bg-gradient-to-r from-terra-500 to-amber-500 text-white border-amber-200 ring-4 ring-terra-500/25"
                  : passed
                    ? "bg-emerald-600/95 hover:bg-emerald-500 text-white border-emerald-400/50"
                    : "bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 candy-node-active"
              }">
                <!-- Medallón circular de nivel -->
                <div class="w-11 h-11 rounded-2xl ${passed ? "bg-black/25 text-amber-300" : "bg-slate-950 text-amber-400"} flex flex-col items-center justify-center shrink-0 shadow-inner border border-white/15">
                  <span class="text-[8px] font-black uppercase leading-none opacity-80">NIVEL</span>
                  <span class="text-sm font-black leading-tight">${lessonNum}</span>
                </div>
                <div class="text-left min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-1">
                    <span class="text-[10px] font-black ${passed ? "text-amber-200" : "text-slate-950"} tracking-wider">${starsStr}</span>
                    <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${passed ? "bg-black/20 text-emerald-100" : "bg-slate-950/15 text-slate-950"} inline-flex items-center gap-1 shrink-0">
                      ${passed ? `${runtime.SVG_PADLOCK_OPEN} Superado` : "Examen Pendiente"}
                    </span>
                  </div>
                  <div class="text-xs font-extrabold truncate mt-0.5">${actions.escapeHtmlSafe(lObj.lessonTitle)}</div>
                </div>
              </button>
              ${connectorLine}
            </div>
          `;
    } else if (isNextToGenerate && !isLockedByPrevious) {
      // El nivel anterior ya fue aprobado (o es el Nivel 1 inicial), por lo que este nivel está ABIERTO y listo para generarse
      nodesMarkup += `
            <div class="flex flex-col items-center w-full">
              <button onclick="startTutorSession('lesson')" class="transform ${offsetClass} w-full max-w-[275px] candy-node-active flex items-center gap-3 p-2.5 rounded-3xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black shadow-lg border-2 border-amber-200 ring-4 ring-amber-400/25 transition">
                <div class="w-11 h-11 rounded-2xl bg-slate-950 text-amber-400 flex flex-col items-center justify-center shrink-0 shadow">
                  <span class="text-[8px] font-black uppercase leading-none">NIVEL</span>
                  <span class="text-sm font-black leading-tight">${lessonNum}</span>
                </div>
                <div class="text-left min-w-0 flex-1">
                  <div class="text-[9px] uppercase font-black tracking-wider flex items-center gap-1 text-slate-900">
                    ${runtime.SVG_PADLOCK_OPEN} <span>¡Candado Abierto!</span>
                  </div>
                  <div class="text-xs font-black truncate">Iniciar Lección #${lessonNum}</div>
                </div>
              </button>
              ${connectorLine}
            </div>
          `;
    } else {
      // Nivel bloqueado con candado cerrado SVG
      const nodeId = `candy-locked-node-${lessonNum}`;
      nodesMarkup += `
            <div class="flex flex-col items-center w-full">
              <button id="${nodeId}" onclick="clickLockedCandyNode(${lessonNum}, ${blockingLevelNum}, '${nodeId}')" class="transform ${offsetClass} w-full max-w-[275px] flex items-center gap-3 p-2.5 rounded-3xl bg-slate-200/80 dark:bg-slate-800/75 border-2 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-amber-500/50 transition">
                <div class="w-11 h-11 rounded-2xl bg-slate-300 dark:bg-slate-900 text-slate-500 dark:text-amber-400/80 flex items-center justify-center shrink-0 border border-slate-400/30 dark:border-slate-700">
                  ${runtime.SVG_PADLOCK_CLOSED}
                </div>
                <div class="text-left min-w-0 flex-1">
                  <div class="text-[9px] font-extrabold uppercase tracking-wider text-amber-500/90 truncate">
                    Candado • Requiere Nivel #${blockingLevelNum}
                  </div>
                  <div class="text-xs font-extrabold truncate">Nivel #${lessonNum} Bloqueado</div>
                </div>
              </button>
              ${connectorLine}
            </div>
          `;
    }
  }

  mapEl.innerHTML = `<div class="flex flex-col items-center py-1">${nodesMarkup}</div>`;
}

export function renderTutor() {
  const td = actions.ensureTutorMultiSubjectStructure();
  const subj = actions.getActiveSubjectObj();

  // Actualizar estado de recordatorio de racha (ubicado ahora en Ajustes)
  const remInput = document.getElementById("streakReminderTimeInput");
  if (remInput) remInput.value = td.streakReminderTime || "20:00";
  const studiedToday = (td.studyDaysHistory || []).includes(
    runtime.appState.currentDay,
  );
  const riskTextEl = document.getElementById("tutorStreakRiskStatusText");
  if (riskTextEl) {
    riskTextEl.innerHTML = studiedToday
      ? `<span class="text-emerald-400 font-bold">✓ Racha de hoy (${runtime.appState.currentDay}) asegurada</span>`
      : `<span class="text-amber-400 font-bold">⚠ Aún no estudias hoy: hora de recordatorio: ${actions.escapeHtmlSafe(td.streakReminderTime || "20:00")}</span>`;
  }

  // Renderizar píldoras de materias con truncado limpio
  const pillsEl = document.getElementById("tutorSubjectPills");
  if (pillsEl) {
    pillsEl.innerHTML = Object.values(td.subjectsMap)
      .map((sItem) => {
        const isAct = sItem.key === td.activeSubjectKey;
        const countL = (sItem.lessons || []).length;
        return `
            <div onclick="selectTutorSubject(${domain.inlineArgument(sItem.key)})" class="max-w-full px-3 py-1.5 rounded-2xl text-xs font-extrabold cursor-pointer transition flex items-center gap-2 border shrink-0 ${
              isAct
                ? "bg-terra-500 text-white border-terra-500 shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            }">
              <span class="truncate max-w-[165px] sm:max-w-[200px]" title="${actions.escapeHtmlSafe(sItem.name)}">${actions.escapeHtmlSafe(sItem.name)}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${isAct ? "bg-black/25 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-400"}">
                ${countL === 0 ? "Niv. 1 listo" : `Niv. ${countL}`}
              </span>
              <button onclick="deleteTutorSubject(${domain.inlineArgument(sItem.key)}, event)" class="opacity-80 hover:opacity-100 shrink-0 ml-0.5" title="Borrar o reiniciar materia">
                <i class="fi fi-rr-cross-small"></i>
              </button>
            </div>
          `;
      })
      .join("");
  }

  const subjInput = document.getElementById("tutorSubjectInput");
  if (subjInput) subjInput.value = subj.name || "";
  const lvlSelect = document.getElementById("tutorLevelSelect");
  if (lvlSelect)
    lvlSelect.value = subj.level || "Desde Cero (Principiante Absoluto)";
  const goalInput = document.getElementById("tutorGoalInput");
  if (goalInput) goalInput.value = subj.goal || "";

  const lessonsCount = (subj.lessons || []).length;
  const unpassed = actions.getUnpassedCurrentLesson(subj);
  const nextBtnLabel = document.getElementById("tutorNextLessonBtnLabel");
  const gateStatusLabel = document.getElementById("tutorGateStatusLabel");
  const examDot = document.getElementById("tbottomExamDot");

  if (unpassed) {
    if (gateStatusLabel)
      gateStatusLabel.innerHTML = `${runtime.SVG_PADLOCK_CLOSED} <span class="truncate">Nivel #${unpassed.number + 1} con candado:</span>`;
    if (nextBtnLabel)
      nextBtnLabel.textContent = `Ir a Examen #${unpassed.number} ▶`;
    if (examDot) examDot.classList.remove("hidden");
  } else {
    const nextNum = lessonsCount + 1;
    if (gateStatusLabel)
      gateStatusLabel.innerHTML = `${runtime.SVG_PADLOCK_OPEN} <span class="truncate">Nivel #${nextNum} desbloqueado:</span>`;
    if (nextBtnLabel)
      nextBtnLabel.textContent = `Generar Lección #${nextNum} ▶`;
    if (examDot) examDot.classList.add("hidden");
  }

  const dailyStreak = actions.calculateTutorDailyStreak();
  document.getElementById("tutorProgressBadge").textContent =
    `${lessonsCount} lección(es) • ${subj.name}`;
  document.getElementById("tutorStreakBadge").innerHTML =
    `<i class="fi fi-sr-flame"></i> <span>${dailyStreak}d racha</span>`;
  const xpEl = document.getElementById("tutorXpBadge");
  if (xpEl)
    xpEl.innerHTML = `<i class="fi fi-sr-star"></i> <span>${td.totalXp || 0} XP</span>`;

  actions.renderCandyCrushMap(subj);

  const container = document.getElementById("tutorLessonContainer");
  if (!container) return;

  if (lessonsCount === 0) {
    const pracLabel = document.getElementById("tbottomPracticeLabel");
    if (pracLabel) pracLabel.textContent = "Práctica";
    container.innerHTML = `
          <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 text-center space-y-3 card-minimal-anim">
            <p class="text-xs font-extrabold text-terra-500 uppercase">Materia lista: ${actions.escapeHtmlSafe(subj.name)}</p>
            <p class="text-xs text-slate-400">Esta materia comienza desde cero. Presiona el botón de abajo o <strong>"Darme Clase + Examen"</strong> para abrir tu <strong>Lección #1 (Nivel 1)</strong>.</p>
            <button onclick="startTutorSession('lesson')" class="px-5 py-2.5 bg-terra-500 hover:bg-terra-600 text-white font-black text-xs rounded-2xl shadow inline-flex items-center gap-2">
              <i class="fi fi-rr-play-alt"></i> <span>Iniciar Nivel #1 Ahora</span>
            </button>
          </div>
        `;
    return;
  }

  if (
    subj.selectedLessonIndex < 0 ||
    subj.selectedLessonIndex >= lessonsCount
  ) {
    subj.selectedLessonIndex = lessonsCount - 1;
  }

  const lesson = subj.lessons[subj.selectedLessonIndex];
  const currentNum = actions.idxToLessonNum(subj.selectedLessonIndex);
  const isCode = actions.isStrictCodeLesson(lesson, subj.name);
  const formulasList = actions.getValidMathFormulas(lesson);

  const pracLabel = document.getElementById("tbottomPracticeLabel");
  if (pracLabel) {
    pracLabel.textContent = isCode
      ? "IDE Código"
      : formulasList.length > 0
        ? "Fórmulas"
        : "Práctica";
  }

  // Barra superior de la lección con Candado Inteligente para pasar de un nivel a otro
  const prevDisabled = subj.selectedLessonIndex <= 0;
  const isCurrentPassed = !!lesson.completedQuiz;
  const hasNextSaved = subj.selectedLessonIndex + 1 < lessonsCount;

  const navHeaderHtml = `
        <div class="flex items-center justify-between gap-2 bg-slate-900 text-white px-3.5 py-2.5 rounded-2xl border border-slate-800 text-xs shadow-sm">
          <button onclick="${!prevDisabled ? `openSavedLessonByIndex(${subj.selectedLessonIndex - 1}, '${runtime.activeTutorSubTab === "map" ? "lesson" : runtime.activeTutorSubTab}')` : ""}" ${prevDisabled ? "disabled" : ""} class="px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1 shrink-0 ${prevDisabled ? "opacity-30 cursor-not-allowed" : "bg-white/10 hover:bg-white/20"}">
            <i class="fi fi-rr-angle-left"></i> <span>Nivel #${Math.max(1, currentNum - 1)}</span>
          </button>

          <div class="text-center min-w-0 flex-1">
            <span class="font-black text-amber-400 block truncate">Nivel / Lección #${currentNum} de ${lessonsCount}</span>
            <span class="text-[10px] ${isCurrentPassed ? "text-emerald-400" : "text-amber-300"} font-bold inline-flex items-center gap-1">
              ${isCurrentPassed ? `${runtime.SVG_PADLOCK_OPEN} <span>Nivel Superado ★★★</span>` : `${runtime.SVG_PADLOCK_CLOSED} <span>Aprueba el examen para avanzar</span>`}
            </span>
          </div>

          <button id="tutorNavNextLevelBtn" onclick="goToNextTutorLevelOrGenerate()" class="px-3 py-1.5 rounded-xl font-extrabold flex items-center gap-1.5 shrink-0 transition ${
            isCurrentPassed
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow"
              : "bg-amber-500/20 border border-amber-500/40 text-amber-300"
          }">
            ${isCurrentPassed ? runtime.SVG_PADLOCK_OPEN : runtime.SVG_PADLOCK_CLOSED}
            <span>${isCurrentPassed ? (hasNextSaved ? `Nivel #${currentNum + 1} ▶` : `Crear #${currentNum + 1} ▶`) : `Nivel #${currentNum + 1}`}</span>
          </button>
        </div>
      `;

  // 1. Pizarrón de Fórmulas Matemáticas resaltadas (SOLO si hay fórmulas reales)
  const formulasHtml =
    formulasList.length > 0
      ? `
        <div class="p-4 rounded-3xl bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-rose-500/15 border-2 border-amber-500/40 space-y-3 card-minimal-anim">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <i class="fi fi-rr-square-root"></i>
              <span>Pizarrón de Fórmulas y Ecuaciones Resaltadas</span>
            </span>
            <span class="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold">Matemáticas</span>
          </div>
          <div class="space-y-2.5">
            ${formulasList
              .map(
                (fm) => `
              <div class="p-3.5 rounded-2xl bg-slate-950/90 border border-amber-400/40 space-y-1.5 shadow-inner">
                <span class="text-[10px] font-extrabold text-amber-300 uppercase block">${actions.formatMathClean(fm.name || "Fórmula Clave")}</span>
                <div class="py-2.5 px-3 rounded-xl bg-amber-500/10 border border-amber-400/30 font-mono text-sm font-black text-amber-200 text-center tracking-wide overflow-x-auto">
                  ${actions.formatMathClean(fm.expression)}
                </div>
                ${fm.variables ? `<p class="text-[11px] text-slate-300"><strong>Variables:</strong> ${actions.formatMathClean(fm.variables)}</p>` : ""}
                ${fm.example ? `<p class="text-[11px] text-emerald-300 font-mono"><strong>Sustitución paso a paso:</strong> ${actions.formatMathClean(fm.example)}</p>` : ""}
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `
      : "";

  // 2. Interfaz Visual de IDE Completa (SOLO cuando es clase de código)
  const codeIdeHtml = actions.buildFullVisualIdeHtml(
    lesson,
    subj.name,
    currentNum,
  );

  // 3. Flashcards Interactivas
  const flashcards = Array.isArray(lesson.flashcards) ? lesson.flashcards : [];
  const flashcardsHtml =
    flashcards.length > 0
      ? `
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3 card-minimal-anim">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-extrabold uppercase text-terra-500 flex items-center gap-1.5">
              <i class="fi fi-rr-playing-cards"></i>
              <span>Tarjetas Memorama Interactivas (Toca para voltear)</span>
            </span>
            <span class="text-[10px] text-slate-400 font-bold">${flashcards.length} tarjetas</span>
          </div>
          <div class="grid grid-cols-1 gap-2.5">
            ${flashcards
              .map(
                (fc, idx) => `
              <div id="fc-wrap-${idx}" onclick="toggleFlashcardFlip(${idx})" class="flashcard-flip-anim p-4 rounded-2xl cursor-pointer border-2 border-terra-500/30 hover:border-terra-500 bg-slate-50 dark:bg-slate-800/80">
                <div id="fc-front-${idx}" class="flex items-center justify-between gap-2">
                  <div>
                    <span class="text-[9px] font-black uppercase text-terra-500 block">Tarjeta #${idx + 1} • Pregunta (Toca para girar)</span>
                    <p class="text-xs font-bold mt-1">${actions.formatMathClean(fc.front)}</p>
                  </div>
                  <i class="fi fi-rr-refresh text-terra-500 text-base"></i>
                </div>
                <div id="fc-back-${idx}" class="hidden flex items-center justify-between gap-2 text-emerald-400">
                  <div>
                    <span class="text-[9px] font-black uppercase text-emerald-400 block">✓ Respuesta / Concepto</span>
                    <p class="text-xs font-extrabold mt-1">${actions.formatMathClean(fc.back)}</p>
                  </div>
                  <i class="fi fi-sr-check-circle text-emerald-400 text-base"></i>
                </div>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `
      : "";

  // 4. Reto práctico con Pista y Solución desplegable
  const ch = lesson.interactiveChallenge;
  const challengeHtml =
    ch && ch.prompt
      ? `
        <div class="p-4 rounded-3xl bg-indigo-500/10 border border-indigo-500/30 space-y-2.5 text-xs card-minimal-anim">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-black uppercase text-indigo-400 flex items-center gap-1">
              <i class="fi fi-rr-rocket-lunch"></i> <span>Mini-Reto Interactivo de Práctica</span>
            </span>
            <div class="flex gap-1.5">
              <button onclick="toggleChallengeSolution('hint')" class="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-[10px] font-bold">Ver Pista</button>
              <button onclick="toggleChallengeSolution('sol')" class="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">Ver Solución</button>
            </div>
          </div>
          <p class="font-bold text-slate-700 dark:text-slate-200">${actions.formatMathClean(ch.prompt)}</p>
          <div id="tutor-challenge-hint" class="hidden p-2.5 rounded-xl bg-amber-500/15 text-amber-300 text-[11px]">
            <strong>💡 Pista:</strong> ${actions.formatMathClean(ch.hint)}
          </div>
          <div id="tutor-challenge-sol" class="hidden p-2.5 rounded-xl bg-emerald-500/15 text-emerald-300 text-[11px] font-mono">
            <strong>✓ Solución paso a paso:</strong> ${actions.formatMathClean(ch.solution)}
          </div>
        </div>
      `
      : "";

  const termsHtml = (lesson.keyTerms || [])
    .map(
      (k) =>
        `<span class="px-2.5 py-1 rounded-full bg-terra-500/15 text-terra-500 font-bold text-[11px]">+ ${actions.escapeHtmlSafe(k)}</span>`,
    )
    .join("");

  const correctIdx = actions.resolveCorrectOptionIndex(lesson);
  const selectedOpt = lesson.lastSelectedQuizOption;
  const optionsHtml = (lesson.quizOptions || [])
    .map((opt, idx) => {
      let optStyle =
        "border-slate-200 dark:border-slate-700 hover:border-terra-500 bg-slate-50 dark:bg-slate-800/60";
      let badgeStyle =
        "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200";
      if (lesson.completedQuiz && idx === correctIdx) {
        optStyle =
          "border-2 border-emerald-500 bg-emerald-500/15 text-emerald-300";
        badgeStyle = "bg-emerald-500 text-slate-950";
      } else if (
        !lesson.completedQuiz &&
        selectedOpt === idx &&
        idx !== correctIdx
      ) {
        optStyle = "border-2 border-rose-500 bg-rose-500/15 text-rose-300";
        badgeStyle = "bg-rose-500 text-white";
      }
      return `
          <button onclick="answerTutorQuiz(${idx})" class="p-3.5 rounded-2xl border ${optStyle} text-left text-xs font-bold flex items-center gap-2.5 transition">
            <span class="w-6 h-6 rounded-lg ${badgeStyle} flex items-center justify-center text-[10px] font-black shrink-0">${["A", "B", "C", "D"][idx] || idx + 1}</span>
            <span class="flex-1">${actions.formatMathClean(opt)}</span>
          </button>
        `;
    })
    .join("");

  // Tarjeta de Candado y Examen Jefe para pasar de nivel
  const examCardHtml = `
        <div id="tutorExamGateCard" class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border-2 ${lesson.completedQuiz ? "border-emerald-500/60" : "border-amber-500/50"} space-y-3.5 card-minimal-anim">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-9 h-9 rounded-2xl ${lesson.completedQuiz ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"} flex items-center justify-center shrink-0">
                ${lesson.completedQuiz ? runtime.SVG_PADLOCK_OPEN : runtime.SVG_PADLOCK_CLOSED}
              </div>
              <div class="min-w-0">
                <span class="text-[10px] font-extrabold uppercase ${lesson.completedQuiz ? "text-emerald-400" : "text-amber-400"} block truncate">
                  ${lesson.completedQuiz ? `Candado Abierto • Nivel #${currentNum} Aprobado (★★★)` : `Candado de Nivel #${currentNum} • Aprueba para abrir Nivel #${currentNum + 1}`}
                </span>
                <p class="text-[11px] text-slate-400 truncate">Responde correctamente para desbloquear el siguiente nivel</p>
              </div>
            </div>
            <span class="text-[10px] font-black bg-amber-500/15 text-amber-400 px-2.5 py-1 rounded-xl shrink-0">+100 XP</span>
          </div>

          <h4 class="text-sm font-black leading-snug">${actions.formatMathClean(lesson.quizQuestion)}</h4>
          <div class="grid grid-cols-1 gap-2">${optionsHtml}</div>

          <div id="tutorQuizFeedback" class="${lesson.completedQuiz || (selectedOpt !== null && selectedOpt !== undefined) ? "p-4 rounded-2xl border-2 text-xs mt-2 space-y-2.5 " + (lesson.completedQuiz ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-200" : "bg-rose-500/15 border-rose-500/40 text-rose-200") : "hidden"}">
            ${
              lesson.completedQuiz
                ? `
              <div class="font-black text-sm text-emerald-400 flex items-center gap-1.5">
                ${runtime.SVG_PADLOCK_OPEN} <span>★★★ ¡Nivel #${currentNum} Superado! Candado del Nivel #${currentNum + 1} Abierto</span>
              </div>
              <p>${actions.formatMathClean(lesson.quizExplanation)}</p>
              <button onclick="goToNextTutorLevelOrGenerate()" class="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs rounded-2xl shadow-lg flex items-center justify-center gap-2">
                ${runtime.SVG_PADLOCK_OPEN}
                <span>${hasNextSaved ? `Pasar Ahora al Nivel #${currentNum + 1} ▶` : `Desbloquear y Generar Nivel #${currentNum + 1} ▶`}</span>
              </button>
            `
                : selectedOpt !== null && selectedOpt !== undefined
                  ? `
              <div class="font-black text-rose-400 flex items-center gap-1.5">
                ${runtime.SVG_PADLOCK_CLOSED} <span>Respuesta Incorrecta: El candado del Nivel #${currentNum + 1} sigue cerrado</span>
              </div>
              <p>Pista del profesor: <em>${actions.formatMathClean(lesson.quizExplanation)}</em></p>
            `
                  : ""
            }
          </div>
        </div>
      `;

  // Bloque de Clase Teórica + Esquema Visual + Candado de Examen al final
  const theoryCardHtml = `
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4 card-minimal-anim">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-extrabold uppercase bg-terra-500 text-white px-3 py-1 rounded-full truncate max-w-[200px] sm:max-w-[240px]" title="${actions.escapeHtmlSafe(subj.name)} • Lección #${currentNum}">
              ${actions.escapeHtmlSafe(subj.name)} • Nivel #${currentNum}
            </span>
            <div class="flex items-center gap-2 shrink-0">
              <button onclick="regenerateCurrentTutorLesson()" class="text-[10px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-terra-500 font-bold" title="Volver a generar explicación de este mismo nivel"><i class="fi fi-rr-refresh"></i> Re-explicar #${currentNum}</button>
              <span class="text-xs font-black text-amber-400">${"★".repeat(lesson.completedQuiz ? 3 : 1)}</span>
            </div>
          </div>

          <div>
            <h3 class="text-base font-black">${actions.escapeHtmlSafe(lesson.lessonTitle)}</h3>
            ${lesson.summaryBanner ? `<p class="text-[11px] text-terra-500 font-bold mt-0.5">${actions.escapeHtmlSafe(lesson.summaryBanner)}</p>` : ""}
          </div>

          ${actions.buildVisualReferenceCardHtml(lesson, subj.name)}

          <div class="text-xs leading-relaxed whitespace-pre-wrap text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800">${actions.formatMathClean(lesson.explanation)}</div>

          ${formulasHtml}
          ${codeIdeHtml}

          ${lesson.homeworkFeedback ? `<div class="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-xs"><strong class="text-blue-400 block mb-0.5">Nota del Profesor / Revisión:</strong> ${actions.formatMathClean(lesson.homeworkFeedback)}</div>` : ""}

          <div>
            <span class="text-[10px] font-bold uppercase text-slate-400 block mb-1.5">Conceptos Clave del Nivel #${currentNum}</span>
            <div class="flex flex-wrap gap-1.5">${termsHtml}</div>
          </div>
        </div>

        <!-- CANDADO Y EXAMEN JEFE INTEGRADO AL FINAL DE LA CLASE PARA PASAR DIRECTO AL SIGUIENTE NIVEL -->
        ${examCardHtml}
      `;

  if (runtime.activeTutorSubTab === "practice") {
    container.innerHTML = `
          ${navHeaderHtml}
          ${codeIdeHtml}
          ${formulasHtml}
          ${challengeHtml}
          ${flashcardsHtml}
          <button onclick="switchTutorSubTab('exam')" class="w-full py-3 bg-gradient-to-r from-terra-500 to-amber-500 text-white font-black text-xs rounded-2xl shadow-md flex items-center justify-center gap-2">
            ${lesson.completedQuiz ? runtime.SVG_PADLOCK_OPEN : runtime.SVG_PADLOCK_CLOSED}
            <span>Ir al Examen Jefe del Nivel #${currentNum}</span>
          </button>
        `;
  } else if (runtime.activeTutorSubTab === "exam") {
    container.innerHTML = `
          ${navHeaderHtml}
          ${examCardHtml}
        `;
  } else {
    container.innerHTML = `
          ${navHeaderHtml}
          ${theoryCardHtml}
        `;
  }
}

export function idxToLessonNum(idx) {
  return typeof idx === "number" && idx >= 0 ? idx + 1 : 1;
}
