import { runtime, actions } from "../core/context.js";
import * as domain from "../core/domain.js";
import DOMPurify from "dompurify";

export function formatIsoDateLocal(d) {
  return domain.isoDate(d);
}

export function getLocalTodayIso() {
  return domain.isoDate();
}

export function buildDynamicDaysConfig() {
  return domain.calendarDays(runtime.appState?.currentDay || domain.isoDate());
}

export function getActiveWeekDays(date) {
  return domain.weekDays(date);
}

export function createDefaultState() {
  const today = domain.isoDate();
  return {
    schemaVersion: 2,
    theme: "dark",
    currentDay: today,
    onboardingComplete: false,
    selectedModel: "gemini-3.8-flash",
    thinkingLevel: "LOW",
    profile: {
      name: "",
      weight: "",
      height: "",
      age: "",
      activity: 1.55,
      gymDays: 4,
      goalKey: "recomp",
      goalText: "Recomposición corporal",
      medicalCondition: "",
    },
    targetKcal: 2100,
    targetWater: 2000,
    targetProt: 120,
    targetCarb: 250,
    targetFat: 70,
    days: { [today]: domain.emptyDay() },
    tasks: [],
    gymStructured: {},
    exerciseHistory: {},
    habitsList: [],
    deletedHabitsRegistry: [],
    habitsModifiedAt: 0,
    groceries: [],
    mealPlanStructured: [],
    lastFridgePlan: null,
    tutorData: {
      subject: "",
      level: "Desde Cero (Principiante Absoluto)",
      goal: "",
      lessonsCompleted: 0,
      streak: 0,
      lastLesson: null,
      subjectsMap: {},
      studyDaysHistory: [],
      totalXp: 0,
      deletedSubjectsRegistry: [],
      subjectsModifiedAt: 0,
      streakReminderTime: "20:00",
    },
    workHub: {
      workStartHour: "09:00",
      workEndHour: "18:00",
      workEmail: "",
      workPhone: "",
      workAliasFilter: "",
      workKeywords: "",
      greenApiChatId: "",
      inboxFilter: "all",
      scheduleBlocks: [],
      inboxItems: [],
    },
    finance: {
      incomes: [],
      expenses: [],
      debts: [],
      payments: [],
      aiPeacePlanHtml: "",
      availableBalance: null,
    },
    updatedAt: 0,
  };
}

export function normalizeHabitsStructure(st) {
  if (!Array.isArray(st.habitsList)) st.habitsList = [];
  st.habitsList = st.habitsList
    .filter((h) => h && h.name)
    .map((h) => ({
      ...h,
      id: String(h.id || domain.newId()),
      createdAt: h.createdAt || domain.isoDate(),
      targetCount: domain.numberIn(h.targetCount || 1, 1, 10000),
      weekdays: Array.isArray(h.weekdays) ? h.weekdays : [0, 1, 2, 3, 4, 5, 6],
    }));
}
