import fs from "node:fs";
import path from "node:path";
import { parse } from "acorn";
import * as walk from "acorn-walk";
import { parseHTML } from "linkedom";
const files = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    );
const sources = [
  ...files("src"),
  ...files("functions").filter((f) => !f.includes("node_modules")),
].filter((f) => f.endsWith(".js"));
const exports = new Set(["closeMobileMenu", "runtimeUid"]),
  refs = new Set();
for (const file of sources) {
  const source = fs.readFileSync(file, "utf8"),
    ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  walk.simple(ast, {
    ExportNamedDeclaration(n) {
      if (n.declaration?.id) exports.add(n.declaration.id.name);
      for (const d of n.declaration?.declarations || []) exports.add(d.id.name);
    },
    MemberExpression(n) {
      if (n.object.name === "actions" && !n.computed) refs.add(n.property.name);
    },
  });
  if (
    file.startsWith("src/") &&
    /generativelanguage\.googleapis\.com/.test(source)
  )
    throw Error("La IA debe usar el servidor.");
}
for (const ref of refs)
  if (!exports.has(ref)) throw Error("Acción inexistente: " + ref);
const html = files("src/views")
  .filter((f) => f.endsWith(".html"))
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("");
const { document } = parseHTML("<html><body>" + html + "</body></html>");
const ids = new Set();
for (const el of document.querySelectorAll("[id]")) {
  if (ids.has(el.id)) throw Error("ID duplicado: " + el.id);
  ids.add(el.id);
}
for (const el of document.querySelectorAll("*"))
  for (const attr of el.attributes)
    if (attr.name.startsWith("on"))
      parse(attr.value, {
        ecmaVersion: "latest",
        allowReturnOutsideFunction: true,
      });
console.log(
  `Sintaxis, ${exports.size} acciones y ${ids.size} IDs revisados. Configuración Firebase: control-tcc.`,
);
