// Lists translation keys used in src/ that are missing from src/i18n/ar.ts (dynamic keys excluded).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const src = readFileSync('src/i18n/ar.ts', 'utf8').replace(/export default ar;[\s\S]*$/, '').replace(/^const ar = /m, 'return ');
const ar = new Function(src)();
const has = (key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), ar) !== undefined;
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && !p.includes('tests') && files.push(p); } };
walk('src');
const missing = new Set();
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) if (!has(m[1])) missing.add(m[1]);
  for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*`([a-zA-Z0-9_.]+)\.\$\{/g)) if (!has(m[1])) missing.add(m[1] + '.*');
}
console.log([...missing].sort().join('\n') || 'none missing');
