import { runtime, actions } from "../core/context.js";
import * as domain from "../core/domain.js";
import DOMPurify from "dompurify";

export function switchFinanceSubTab(sub) {
  runtime.currentFinanceSubTab = sub;
  ["cashflow", "debts", "peaceplan"].forEach((k) => {
    const viewEl = document.getElementById(`financeSubView-${k}`);
    if (viewEl) viewEl.classList.toggle("hidden", k !== sub);
    const btnEl = document.getElementById(`finsub-${k}`);
    if (btnEl) {
      btnEl.className =
        k === sub
          ? "py-2 px-2 rounded-xl bg-terra-500 text-white shadow-sm transition flex items-center justify-center gap-1.5"
          : "py-2 px-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1.5";
    }
  });
  const activeEl = document.getElementById(`financeSubView-${sub}`);
  if (activeEl) actions.triggerElementSlideAnim(activeEl, "subview-anim-enter");
  actions.renderFinanceAll();
}

export function formatMoneyMXN(n) {
  const num = Number(n) || 0;
  return (
    "$" +
    num.toLocaleString("es-MX", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

export function daysBetweenTodayAndISO(isoDateStr) {
  if (!isoDateStr) return 999;
  const today = new Date(actions.getLocalTodayIso() + "T00:00:00");
  const target = new Date(isoDateStr + "T00:00:00");
  return Math.round((target - today) / 86400000);
}

export function renderFinanceAll() {
  if (!runtime.appState.finance)
    runtime.appState.finance = actions.createDefaultState().finance;
  const incDateInp = document.getElementById("finIncomeDateInput");
  const debtDueInp = document.getElementById("finDebtDueDateInput");
  if (incDateInp && !incDateInp.value)
    incDateInp.value = actions.getLocalTodayIso();
  if (debtDueInp && !debtDueInp.value)
    debtDueInp.value = actions.getLocalTodayIso();

  const incomes = runtime.appState.finance.incomes || [];
  const expenses = runtime.appState.finance.expenses || [];
  const debts = runtime.appState.finance.debts || [];

  const monthlyIncome = incomes.reduce((acc, inc) => {
    const amt = Number(inc.amount) || 0;
    if (inc.frequency === "Semanal") return acc + amt * 4;
    if (inc.frequency === "Quincenal") return acc + amt * 2;
    return acc + amt;
  }, 0);

  const totalExpenses = expenses.reduce(
    (acc, ex) => acc + (Number(ex.amount) || 0),
    0,
  );
  const unpaidDebts = debts.filter((d) => !d.paidThisMonth);
  const totalDebtMinPay = unpaidDebts.reduce(
    (acc, d) => acc + (Number(d.minPayment) || 0),
    0,
  );
  const totalObligations = totalExpenses + totalDebtMinPay;
  const freeCash = monthlyIncome - totalObligations;

  let nextIncome = null;
  let minDaysToPayday = 999;
  incomes.forEach((inc) => {
    const d = actions.daysBetweenTodayAndISO(inc.nextDate);
    if (d >= 0 && d < minDaysToPayday) {
      minDaysToPayday = d;
      nextIncome = inc;
    }
  });
  const daysWindow =
    minDaysToPayday > 0 && minDaysToPayday <= 35 ? minDaysToPayday : 15;
  const flow = domain.cashFlow(runtime.appState.finance);
  const safeDaily = flow.daily;

  const elInc = document.getElementById("finKpiTotalIncome");
  const elIncSub = document.getElementById("finKpiNextIncomeSub");
  const elObl = document.getElementById("finKpiTotalObligations");
  const elDebtSub = document.getElementById("finKpiDebtCountSub");
  const elFree = document.getElementById("finKpiFreeCash");
  const elDaily = document.getElementById("finKpiSafeDailySpend");
  const elDaysSub = document.getElementById("finKpiDaysUntilPaySub");

  if (elInc) elInc.textContent = actions.formatMoneyMXN(monthlyIncome);
  if (elIncSub) {
    elIncSub.textContent = nextIncome
      ? `Próximo: ${nextIncome.name} (${minDaysToPayday === 0 ? "¡Hoy!" : "en " + minDaysToPayday + "d"})`
      : "Agrega tu fecha de cobro";
  }
  if (elObl) elObl.textContent = actions.formatMoneyMXN(totalObligations);
  if (elDebtSub)
    elDebtSub.textContent = `${unpaidDebts.length} deuda(s) por pagar`;
  if (elFree) {
    elFree.textContent = actions.formatMoneyMXN(freeCash);
    elFree.className = `text-base sm:text-lg font-black ${freeCash >= 0 ? "text-sky-400" : "text-rose-400"}`;
  }
  if (elDaily)
    elDaily.textContent =
      safeDaily === null
        ? "Indica tu saldo"
        : `${actions.formatMoneyMXN(safeDaily)} / día`;
  if (elDaysSub) elDaysSub.textContent = `Referencia para ${flow.days} día(s)`;

  const semBadge = document.getElementById("financePeaceSemaphoreBadge");
  const countText = document.getElementById("nextPaydayCountdownText");
  const ratioUsed =
    monthlyIncome > 0
      ? Math.min(100, Math.round((totalObligations / monthlyIncome) * 100))
      : 0;
  if (semBadge) {
    if (freeCash < 0) {
      semBadge.textContent = "🔴 Alerta: Ajustar Gastos";
      semBadge.className =
        "text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400";
    } else if (ratioUsed > 80) {
      semBadge.textContent = "🟡 Margen Ajustado";
      semBadge.className =
        "text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400";
    } else {
      semBadge.textContent = "Resumen del periodo";
      semBadge.className =
        "text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400";
    }
  }
  if (countText)
    countText.textContent = flow.hasBalance
      ? "Saldo indicado menos compromisos registrados: " +
        actions.formatMoneyMXN(flow.available) +
        ". Referencia diaria: " +
        actions.formatMoneyMXN(flow.daily) +
        ". Revisa gastos faltantes y cambios antes de decidir."
      : "Escribe tu saldo disponible actual para estimar un margen diario. Los ingresos previstos no cuentan como dinero disponible.";

  const debtPct =
    monthlyIncome > 0
      ? Math.min(100, Math.round((totalDebtMinPay / monthlyIncome) * 100))
      : 0;
  const expPct =
    monthlyIncome > 0
      ? Math.min(
          100 - debtPct,
          Math.round((totalExpenses / monthlyIncome) * 100),
        )
      : 0;
  const freePct = Math.max(0, 100 - debtPct - expPct);

  const segD = document.getElementById("finBarDebtsSeg");
  const segE = document.getElementById("finBarExpensesSeg");
  const segF = document.getElementById("finBarFreeSeg");
  const lblU = document.getElementById("finBarLabelUsed");
  const lblF = document.getElementById("finBarLabelFree");
  if (segD) segD.style.width = debtPct + "%";
  if (segE) segE.style.width = expPct + "%";
  if (segF) segF.style.width = freePct + "%";
  if (lblU)
    lblU.textContent = `Comprometido (Deudas ${debtPct}% + Gastos ${expPct}%): ${debtPct + expPct}%`;
  if (lblF) lblF.textContent = `Liquidez libre: ${freePct}%`;

  const urgentCount = unpaidDebts.filter(
    (d) => actions.daysBetweenTodayAndISO(d.dueDate) <= 5,
  ).length;
  const uBadge = document.getElementById("financeUrgentDebtsBadge");
  if (uBadge) {
    uBadge.textContent = urgentCount;
    uBadge.classList.toggle("hidden", urgentCount === 0);
  }

  actions.renderFinanceIncomesList();
  actions.renderFinanceExpensesList();
  actions.renderFinanceDebtsList();
  actions.renderFinancePaycheckAllocation();

  const aiOut = document.getElementById("financeAiPeacePlanOutput");
  if (aiOut && runtime.appState.finance.aiPeacePlanHtml) {
    aiOut.innerHTML = DOMPurify.sanitize(
      runtime.appState.finance.aiPeacePlanHtml,
    );
  }
}

export function renderFinanceIncomesList() {
  const container = document.getElementById("financeIncomesList");
  if (!container || !runtime.appState.finance) return;
  const incomes = runtime.appState.finance.incomes || [];
  if (incomes.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic p-2">Agrega arriba cuándo y cuánto cobras.</p>`;
    return;
  }
  container.innerHTML = incomes
    .map((inc) => {
      const diff = actions.daysBetweenTodayAndISO(inc.nextDate);
      const tag =
        diff < 0
          ? `Hace ${Math.abs(diff)}d`
          : diff === 0
            ? "¡Cobras HOY!"
            : `En ${diff} día(s)`;
      return `
          <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-bold text-slate-800 dark:text-slate-100">${actions.escapeHtmlSafe(inc.name)}</span>
              <span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">${actions.escapeHtmlSafe(inc.frequency)}</span>
              <span class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-mono font-bold">📅 ${actions.escapeHtmlSafe(inc.nextDate)} (${tag})</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-black text-emerald-400">${actions.formatMoneyMXN(inc.amount)}</span>
              <button onclick="markIncomeReceivedAndAdvance(${domain.inlineArgument(inc.id)})" class="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold hover:bg-emerald-500/30">✓ ¡Ya cobré!</button>
              <button onclick="deleteFinanceIncome(${domain.inlineArgument(inc.id)})" class="text-slate-400 hover:text-rose-500 px-1"><i class="fi fi-rr-trash"></i></button>
            </div>
          </div>
        `;
    })
    .join("");
}

export function addFinanceIncome() {
  const nameInp = document.getElementById("finIncomeNameInput");
  const amtInp = document.getElementById("finIncomeAmountInput");
  const freqSel = document.getElementById("finIncomeFreqSelect");
  const dateInp = document.getElementById("finIncomeDateInput");
  const name = (nameInp?.value || "").trim();
  const amount = parseFloat(amtInp?.value || "0");
  const frequency = freqSel?.value || "Quincenal";
  const nextDate = dateInp?.value || actions.getLocalTodayIso();
  if (!name || !(amount > 0)) {
    actions.showToast("Escribe el concepto y monto de tu cobro", "warning");
    return;
  }

  runtime.appState.finance.incomes.push({
    id: Date.now(),
    name,
    amount,
    frequency,
    nextDate,
  });
  if (nameInp) nameInp.value = "";
  if (amtInp) amtInp.value = "";
  actions.saveState();
  actions.showToast("Cobro registrado en tu calendario financiero", "success");
}

export function markIncomeReceivedAndAdvance(id) {
  const inc = (runtime.appState.finance?.incomes || []).find(
    (x) => String(x.id) === String(id),
  );
  if (!inc) return;
  const cur = new Date(
    (inc.nextDate || actions.getLocalTodayIso()) + "T12:00:00",
  );
  if (inc.frequency === "Semanal") cur.setDate(cur.getDate() + 7);
  else if (inc.frequency === "Quincenal") cur.setDate(cur.getDate() + 15);
  else if (inc.frequency === "Mensual") {
    inc.nextDate = domain.nextMonthlyDate(inc.nextDate);
    actions.saveState();
    actions.showToast(`Siguiente cobro: ${inc.nextDate}`, "success");
    return;
  }
  inc.nextDate = actions.formatIsoDateLocal(cur);
  actions.saveState();
  actions.showToast(
    `¡Cobro registrado! Siguiente fecha: ${inc.nextDate}`,
    "success",
  );
}

export function deleteFinanceIncome(id) {
  runtime.appState.finance.incomes = (
    runtime.appState.finance?.incomes || []
  ).filter((x) => String(x.id) !== String(id));
  actions.saveState();
}

export function renderFinanceExpensesList() {
  const container = document.getElementById("financeExpensesList");
  const totalBadge = document.getElementById("financeExpensesTotalBadge");
  if (!container || !runtime.appState.finance) return;
  const expenses = runtime.appState.finance.expenses || [];
  const total = expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  if (totalBadge)
    totalBadge.textContent = `Total: ${actions.formatMoneyMXN(total)}`;

  if (expenses.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic p-2">Sin gastos registrados.</p>`;
    return;
  }
  container.innerHTML = expenses
    .map(
      (ex) => `
        <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
          <div>
            <span class="font-bold">${actions.escapeHtmlSafe(ex.name)}</span>
            <span class="ml-2 px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold">${actions.escapeHtmlSafe(ex.category)}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-black text-amber-400">-${actions.formatMoneyMXN(ex.amount)}</span>
            <button onclick="deleteFinanceExpense(${domain.inlineArgument(ex.id)})" class="text-slate-400 hover:text-rose-500 px-1"><i class="fi fi-rr-trash"></i></button>
          </div>
        </div>
      `,
    )
    .join("");
}

export function addFinanceExpense() {
  const nameInp = document.getElementById("finExpenseNameInput");
  const amtInp = document.getElementById("finExpenseAmountInput");
  const catSel = document.getElementById("finExpenseCategorySelect");
  const name = (nameInp?.value || "").trim();
  const amount = parseFloat(amtInp?.value || "0");
  const category = catSel?.value || "Fijo Necesario";
  if (!name || !(amount > 0)) {
    actions.showToast("Ingresa el concepto y monto del gasto", "warning");
    return;
  }

  runtime.appState.finance.expenses.unshift({
    id: Date.now(),
    name,
    amount,
    category,
    date: actions.getLocalTodayIso(),
  });
  if (nameInp) nameInp.value = "";
  if (amtInp) amtInp.value = "";
  actions.saveState();
  actions.showToast("Gasto registrado", "success");
}

export function deleteFinanceExpense(id) {
  runtime.appState.finance.expenses = (
    runtime.appState.finance?.expenses || []
  ).filter((x) => String(x.id) !== String(id));
  actions.saveState();
}

export function renderFinanceDebtsList() {
  const container = document.getElementById("financeDebtsList");
  if (!container || !runtime.appState.finance) return;
  const debts = (runtime.appState.finance.debts || [])
    .slice()
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  if (debts.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic p-3 text-center">No hay deudas registradas. Agrega tus tarjetas o préstamos arriba con su fecha límite de pago.</p>`;
    return;
  }

  container.innerHTML = debts
    .map((d) => {
      const daysLeft = actions.daysBetweenTodayAndISO(d.dueDate);
      let urgencyBadge = "";
      if (d.paidThisMonth) {
        urgencyBadge = `<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-black">✅ Pagado este mes</span>`;
      } else if (daysLeft < 0) {
        urgencyBadge = `<span class="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-black animate-pulse">⚠️ Vencido hace ${Math.abs(daysLeft)}d</span>`;
      } else if (daysLeft <= 3) {
        urgencyBadge = `<span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[9px] font-black">🔴 Urgente: Vence en ${daysLeft}d</span>`;
      } else if (daysLeft <= 7) {
        urgencyBadge = `<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-black">🟡 Próximo: Vence en ${daysLeft}d</span>`;
      } else {
        urgencyBadge = `<span class="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 text-[9px] font-black">🔵 En ${daysLeft} días</span>`;
      }

      const progressPct =
        d.totalBalance > 0
          ? Math.min(100, Math.round((d.minPayment / d.totalBalance) * 100))
          : 0;

      return `
          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border ${d.paidThisMonth ? "border-emerald-500/30 opacity-75" : daysLeft <= 3 ? "border-rose-500/50" : "border-slate-200 dark:border-slate-800"} space-y-2 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-sm font-black">${actions.escapeHtmlSafe(d.name)}</span>
                  <span class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[9px] font-bold">${actions.escapeHtmlSafe(d.priority || "Media")}</span>
                  ${urgencyBadge}
                </div>
                <p class="text-[11px] text-slate-400 mt-0.5">
                  📅 Fecha límite de pago: <strong class="text-amber-400">${actions.escapeHtmlSafe(d.dueDate || "--")}</strong>
                  ${d.cutDay ? ` • ✂️ Día de corte: <strong>Día ${Number(d.cutDay)}</strong>` : ""}
                </p>
              </div>
              <div class="text-right">
                <span class="text-[10px] text-slate-400 block">Pago del mes:</span>
                <span class="text-base font-black text-rose-400">${actions.formatMoneyMXN(d.minPayment)}</span>
                <span class="text-[10px] text-slate-400 block">Saldo total: ${actions.formatMoneyMXN(d.totalBalance)}</span>
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <span class="text-[10px] text-slate-400">Este pago cubre el <strong>${progressPct}%</strong> del saldo</span>
              <div class="flex items-center gap-2">
                <button onclick="toggleFinanceDebtPaid(${domain.inlineArgument(d.id)})" class="px-3 py-1 rounded-xl ${d.paidThisMonth ? "bg-slate-200 dark:bg-slate-700 text-slate-400" : "bg-emerald-600 text-white"} text-[10px] font-black transition">
                  ${d.paidThisMonth ? "Anular este pago" : "Registrar pago"}
                </button>
                <button class="text-xs" onclick="advanceDebtPeriod(${domain.inlineArgument(d.id)})">Siguiente periodo</button><button onclick="deleteFinanceDebt(${domain.inlineArgument(d.id)})" class="text-slate-400 hover:text-rose-500 px-1"><i class="fi fi-rr-trash"></i></button>
              </div>
            </div>
          </div>
        `;
    })
    .join("");
}

export function addFinanceDebt() {
  const nameInp = document.getElementById("finDebtNameInput");
  const prioSel = document.getElementById("finDebtPrioritySelect");
  const totInp = document.getElementById("finDebtTotalInput");
  const minInp = document.getElementById("finDebtMinPayInput");
  const cutInp = document.getElementById("finDebtCutDayInput");
  const dueInp = document.getElementById("finDebtDueDateInput");

  const name = (nameInp?.value || "").trim();
  const priority = prioSel?.value || "Alta (Interés Alto)";
  const totalBalance = parseFloat(totInp?.value || "0");
  const minPayment = parseFloat(minInp?.value || "0");
  const cutDay = parseInt(cutInp?.value || "0", 10) || null;
  const dueDate = dueInp?.value || actions.getLocalTodayIso();

  if (!name || !(minPayment > 0)) {
    actions.showToast(
      "Escribe el nombre de la deuda y el pago del mes",
      "warning",
    );
    return;
  }

  runtime.appState.finance.debts.push({
    id: Date.now(),
    name,
    priority,
    totalBalance: totalBalance > 0 ? totalBalance : minPayment,
    minPayment,
    cutDay,
    dueDate,
    paidThisMonth: false,
    notified: "",
  });

  if (nameInp) nameInp.value = "";
  if (totInp) totInp.value = "";
  if (minInp) minInp.value = "";
  if (cutInp) cutInp.value = "";
  actions.saveState();
  actions.scheduleCloudPushViaNtfy(
    `💳 Recordatorio de Pago: ${name} (${actions.formatMoneyMXN(minPayment)})`,
    "09:00",
    `Fecha límite: ${dueDate}`,
  );
  actions.showToast("Deuda registrada con alerta de fecha límite", "success");
}

export function toggleFinanceDebtPaid(id) {
  try {
    domain.toggleDebtPayment(runtime.appState.finance, id);
    actions.saveState();
  } catch (e) {
    actions.showToast(e.message, "warning");
  }
}

export function deleteFinanceDebt(id) {
  runtime.appState.finance.debts = (
    runtime.appState.finance?.debts || []
  ).filter((x) => String(x.id) !== String(id));
  actions.saveState();
}

export function renderFinancePaycheckAllocation() {
  const box = document.getElementById("financePaycheckAllocationBox");
  if (!box || !runtime.appState.finance) return;
  const incomes = (runtime.appState.finance.incomes || [])
    .slice()
    .sort((a, b) => (a.nextDate || "").localeCompare(b.nextDate || ""));
  const unpaidDebts = (runtime.appState.finance.debts || [])
    .filter((d) => !d.paidThisMonth)
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

  if (incomes.length === 0 || unpaidDebts.length === 0) {
    box.innerHTML = `<div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-400">Registra al menos un cobro y una deuda para ver automáticamente con qué quincena conviene pagar cada tarjeta.</div>`;
    return;
  }

  const planRows = unpaidDebts
    .map((debt) => {
      const eligibleIncomes = incomes.filter(
        (inc) => (inc.nextDate || "") <= (debt.dueDate || "9999"),
      );
      const chosenIncome =
        eligibleIncomes.length > 0
          ? eligibleIncomes[eligibleIncomes.length - 1]
          : incomes[0];
      const daysLeft = actions.daysBetweenTodayAndISO(debt.dueDate);
      return `
          <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span class="font-black">💳 ${actions.escapeHtmlSafe(debt.name)}</span>
              <span class="text-[10px] text-slate-400 block">Fecha límite: <strong class="text-amber-400">${actions.escapeHtmlSafe(debt.dueDate)}</strong> (${daysLeft >= 0 ? "en " + daysLeft + "d" : "vencida"})</span>
            </div>
            <span class="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 text-[10px] font-black">
              👉 Apartar ${actions.formatMoneyMXN(debt.minPayment)} del cobro: ${actions.escapeHtmlSafe(chosenIncome.name)} (${actions.escapeHtmlSafe(chosenIncome.nextDate)})
            </span>
          </div>
        `;
    })
    .join("");

  box.innerHTML = `
        <div class="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-2">
          <span class="text-[10px] font-extrabold uppercase text-emerald-400 block">📌 Mapa Automático: ¿Con qué cobro pago cada deuda?</span>
          ${planRows}
        </div>
      `;
}

export async function generateFinancePeacePlanWithAI() {
  if (!actions.isAIReady()) {
    actions.showToast(
      "Inicia sesión y configura el servicio de IA en Ajustes para consultar al Estratega IA",
      "warning",
    );
    actions.switchTab("settings");
    return;
  }
  const btn = document.getElementById("btnGeneratePeacePlanAI");
  const out = document.getElementById("financeAiPeacePlanOutput");
  const orig = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>Diseñando plan anti-presión...</span>`;
  }
  try {
    const prompt = `Propón opciones generales para organizar pagos; no garantices resultados ni inventes tasas o ingresos.
        Analiza los datos reales del usuario:
        COBROS E INGRESOS: ${JSON.stringify(runtime.appState.finance?.incomes || [])}
        GASTOS DEL MES: ${JSON.stringify(runtime.appState.finance?.expenses || [])}
        DEUDAS Y FECHAS LÍMITE: ${JSON.stringify(runtime.appState.finance?.debts || [])}

        Devuelve ÚNICAMENTE un JSON válido con esta estructura:
        {
          "step1": "Estimación de cuánto apartar en su próximo cobro para no sentir presión",
          "step2": "Orden recomendado para liquidar sus deudas (Avalancha/Bola de Nieve) según sus fechas e intereses",
          "step3": "Consejo práctico para administrar su presupuesto diario orientativo sin estrés"
        }`;

    const res = await actions.callGeminiAPI(prompt, null, "finance");
    const parsed = JSON.parse(res);
    const htmlPlan = `
          <div class="space-y-2 text-xs">
            <p><strong class="text-emerald-400">1. Regla para tu Próximo Cobro:</strong> ${actions.escapeHtmlSafe(parsed.step1 || "")}</p>
            <p><strong class="text-sky-400">2. Orden de Ataque a tus Deudas:</strong> ${actions.escapeHtmlSafe(parsed.step2 || "")}</p>
            <p><strong class="text-amber-400">3. Tranquilidad Diaria:</strong> ${actions.escapeHtmlSafe(parsed.step3 || "")}</p>
          </div>
        `;
    runtime.appState.finance.aiPeacePlanHtml = htmlPlan;
    actions.saveState();
    if (out) out.innerHTML = htmlPlan;
    actions.showToast("Plan Anti-Presión generado con éxito", "success");
  } catch (e) {
    actions.showToast("Error IA: " + e.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }
}
