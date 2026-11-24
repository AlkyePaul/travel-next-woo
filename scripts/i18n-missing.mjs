#!/usr/bin/env node
// Lists the message keys each non-default locale still needs translated.
// Source of truth: messages/{defaultLocale}.json (locales read from i18n/routing.ts).
// A key needs work when it is missing, empty, or still holds its key-path placeholder
// (e.g. "Home.hero.title"). Keys present only in a target locale are reported as extra.
//
// Usage: node scripts/i18n-missing.mjs [locale...]   (default: all non-default locales)
// Output: JSON { source, targets: { [locale]: { todo: { key: sourceText }, extra: [key] } } }

import fs from "node:fs";

const routing = fs.readFileSync("i18n/routing.ts", "utf8");
const source = routing.match(/defaultLocale:\s*["'](\w+)["']/)[1];
const locales = [...routing.match(/locales:\s*\[([^\]]*)\]/)[1].matchAll(/["'](\w+)["']/g)].map((m) => m[1]);
const targets = process.argv.slice(2).length ? process.argv.slice(2) : locales.filter((l) => l !== source);

const read = (l) => JSON.parse(fs.readFileSync(`messages/${l}.json`, "utf8"));
const flat = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));

const src = Object.fromEntries(flat(read(source)));
const out = { source, targets: {} };
for (const t of targets) {
  const tgt = Object.fromEntries(flat(read(t)));
  const todo = {};
  for (const [k, v] of Object.entries(src)) if (!(k in tgt) || tgt[k] === "" || tgt[k] === k) todo[k] = v;
  out.targets[t] = { todo, extra: Object.keys(tgt).filter((k) => !(k in src)) };
}
console.log(JSON.stringify(out, null, 2));
