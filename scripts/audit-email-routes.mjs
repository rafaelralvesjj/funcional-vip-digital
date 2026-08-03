import fs from "node:fs";
import path from "node:path";

const roots = ["app/api", "lib"];
const hits = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      const count = (text.match(/sendEmail\s*\(/g) || []).length;
      if (count) hits.push({ file: full, count, hasEventType: text.includes("eventType:") });
    }
  }
}

roots.forEach(walk);
console.table(hits);
const withoutMetadata = hits.filter((item) => !item.hasEventType);
if (withoutMetadata.length) {
  console.warn("Rotas com envio sem metadados explícitos:");
  withoutMetadata.forEach((item) => console.warn(`- ${item.file}`));
}
