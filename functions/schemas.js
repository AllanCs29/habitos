const text = { type: "string", maxLength: 24000 };
const num = { type: "number", minimum: 0, maximum: 20000 };
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const array = (items, maxItems = 100) => ({ type: "array", items, maxItems });
const meal = object(
  { name: text, kcal: num, p: num, c: num, f: num, assumptions: text },
  ["name", "kcal", "p", "c", "f"],
);
export const schemas = {
  connection: object({ message: text }),
  meal,
  chef: object({
    macroMathSummary: text,
    avoidWarning: text,
    proposals: array(
      object({
        mealTime: text,
        title: text,
        instructions: text,
        kcal: num,
        p: num,
        c: num,
        f: num,
      }),
      5,
    ),
  }),
  targets: object({
    targetKcal: { ...num, minimum: 800, maximum: 6000 },
    targetWater: { ...num, minimum: 500, maximum: 6000 },
    targetProt: { ...num, maximum: 500 },
    targetCarb: { ...num, maximum: 1000 },
    targetFat: { ...num, maximum: 300 },
  }),
  routine: array(
    object({
      dayName: text,
      focus: text,
      exercises: array(object({ name: text, weight: text }, ["name"]), 25),
    }),
    7,
  ),
  grocery: object({
    groceries: array(object({ text })),
    mealPlan: array(
      object({ day: text, breakfast: text, lunch: text, dinner: text }),
      31,
    ),
  }),
  schedule: object({
    blocks: array(
      object({
        startTime: text,
        endTime: text,
        type: { type: "string", enum: ["ticket", "session", "task", "break"] },
        code: text,
        title: text,
      }),
      40,
    ),
  }),
  inbox: object({
    items: array(
      object({
        category: { type: "string", enum: ["ticket", "session", "task"] },
        code: text,
        title: text,
        time: text,
        sender: text,
        source: text,
        priority: text,
      }),
      60,
    ),
  }),
  finance: object({ step1: text, step2: text, step3: text }),
  lesson: object({
    category: { type: "string", enum: ["code", "math", "language", "general"] },
    lessonTitle: text,
    summaryBanner: text,
    explanation: text,
    visualDiagram: object({
      diagramTitle: text,
      steps: array(object({ badge: text, title: text, detail: text }), 10),
    }),
    formulas: array(
      object({ name: text, expression: text, variables: text, example: text }),
      15,
    ),
    codeLanguage: text,
    codeBlock: text,
    codeOutput: text,
    keyTerms: array(text, 20),
    flashcards: array(object({ front: text, back: text }), 20),
    interactiveChallenge: object({ prompt: text, hint: text, solution: text }),
    homeworkFeedback: text,
    quizQuestion: text,
    quizOptions: { ...array(text, 4), minItems: 4 },
    correctOptionIndex: { type: "integer", minimum: 0, maximum: 3 },
    quizExplanation: text,
  }),
};
function assert(value, schema, path = "respuesta") {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`${path}: se esperaba un objeto.`);
    for (const key of schema.required || [])
      if (!(key in value)) throw new Error(`${path}: falta ${key}.`);
    for (const [key, v] of Object.entries(value)) {
      if (
        ["__proto__", "prototype", "constructor"].includes(key) ||
        !schema.properties[key]
      )
        throw new Error(`${path}: campo no permitido.`);
      assert(v, schema.properties[key], `${path}.${key}`);
    }
  } else if (schema.type === "array") {
    if (
      !Array.isArray(value) ||
      value.length > (schema.maxItems ?? 100) ||
      value.length < (schema.minItems ?? 0)
    )
      throw new Error(`${path}: lista inválida.`);
    value.forEach((v, i) => assert(v, schema.items, `${path}[${i}]`));
  } else if (schema.type === "string") {
    if (typeof value !== "string" || value.length > (schema.maxLength ?? 24000))
      throw new Error(`${path}: texto inválido.`);
  } else if (
    !Number.isFinite(value) ||
    (schema.type === "integer" && !Number.isInteger(value)) ||
    value < (schema.minimum ?? -Infinity) ||
    value > (schema.maximum ?? Infinity)
  )
    throw new Error(`${path}: número inválido.`);
  if (schema.enum && !schema.enum.includes(value))
    throw new Error(`${path}: opción inválida.`);
}
export function validateResult(task, value) {
  if (!Object.hasOwn(schemas, task))
    throw new Error("Tipo de solicitud no admitido.");
  assert(value, schemas[task]);
  return value;
}
export const ALLOWED_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-4-argon",
];
