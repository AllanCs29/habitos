import { runtime, actions } from "../core/context.js";
import { validateResult, ALLOWED_MODELS } from "../../functions/schemas.js";
let reviewResolve;
export const isAIReady = () => !!runtime.fbUser && !!runtime.fbFunctions;
export function reviewAIResult(title, description) {
  reviewResolve?.(false);
  const dialog = document.getElementById("reviewDialog");
  document.getElementById("reviewTitle").textContent = title;
  document.getElementById("reviewDescription").textContent = description;
  dialog.showModal();
  return new Promise((resolve) => {
    reviewResolve = resolve;
    dialog.onclose = () => {
      resolve(dialog.returnValue === "accept");
      reviewResolve = null;
      dialog.returnValue = "";
    };
  });
}
export function cancelAIRequest() {
  for (const job of runtime.pendingAI.values()) job.cancel();
  runtime.pendingAI.clear();
  reviewResolve?.(false);
  document.getElementById("reviewDialog")?.close("cancel");
  renderPending();
}
function renderPending() {
  const node = document.getElementById("aiActivity");
  if (node) {
    node.classList.toggle("hidden", runtime.pendingAI.size === 0);
    node.querySelector("span").textContent =
      `Preparando ${runtime.pendingAI.size} propuesta(s)…`;
  }
}
export async function callGeminiAPI(prompt, image = null, task = "connection") {
  if (!isAIReady())
    throw new Error(
      "Inicia sesión y configura el servicio de IA. Consulta docs/FIREBASE.md incluido en el proyecto.",
    );
  const model = runtime.appState.selectedModel;
  if (!ALLOWED_MODELS.includes(model))
    throw new Error(
      "Elige un modelo de texto e imagen en Ajustes. Los modelos Live se reservan para voz.",
    );
  const epoch = runtime.authEpoch,
    id = crypto.randomUUID();
  let cancel, timer;
  const aborted = new Promise((_, reject) => {
    cancel = () =>
      reject(new Error("Solicitud cancelada. No se guardó ningún resultado."));
    timer = setTimeout(
      () => reject(new Error("La IA tardó demasiado. Puedes reintentar.")),
      65000,
    );
  });
  runtime.pendingAI.set(id, { cancel });
  renderPending();
  try {
    const result = await Promise.race([
      runtime.fbFunctions.httpsCallable("aiGenerate", { timeout: 60000 })({
        prompt,
        image,
        task,
        model,
        thinkingLevel: runtime.appState.thinkingLevel || "LOW",
      }),
      aborted,
    ]);
    if (epoch !== runtime.authEpoch)
      throw new Error("La cuenta cambió durante la solicitud.");
    validateResult(task, result.data.result);
    runtime.lastSuccessfulModelEndpoint = result.data.model;
    runtime.lastSuccessfulProtocol = "Servicio autenticado";
    return JSON.stringify(result.data.result);
  } catch (e) {
    if (e.code?.includes("not-found") || e.code?.includes("internal"))
      throw new Error(
        "El servicio de IA no está disponible. Revisa su despliegue en Firebase; los registros manuales siguen funcionando.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
    runtime.pendingAI.delete(id);
    renderPending();
  }
}
export async function verifyActiveModelConnection() {
  const box = document.getElementById("modelVerificationResultBox");
  box.classList.remove("hidden");
  box.textContent = "Comprobando…";
  try {
    const start = performance.now();
    await callGeminiAPI(
      "Devuelve un mensaje breve indicando que la conexión funciona.",
      null,
      "connection",
    );
    box.textContent = `Conexión correcta · ${runtime.lastSuccessfulModelEndpoint} · ${((performance.now() - start) / 1000).toFixed(1)} s`;
  } catch (e) {
    box.textContent = e.message;
  }
}
