// Leave-one-out accuracy of the matcher over a real export.
// node --experimental-strip-types matcher.eval.ts <file.json>
// Accepts the WinForms places.json (PascalCase) or any mobile/backend export: every object with
// name + readings[] anywhere in the tree counts as a sample.
import { readFileSync } from 'node:fs';
import { keep, rank, THRESHOLD_DB, type Sample } from './matcher.ts';

const lowerKeys = (v: any): any =>
  Array.isArray(v) ? v.map(lowerKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k[0].toLowerCase() + k.slice(1), lowerKeys(x)]))
  : v;

function collect(v: any, out: Sample[] = []): Sample[] {
  if (Array.isArray(v)) v.forEach((x) => collect(x, out));
  else if (v && typeof v === 'object') {
    if (typeof v.name === 'string' && Array.isArray(v.readings)) out.push({ ...v, readings: v.readings.filter(keep) });
    else Object.values(v).forEach((x) => collect(x, out));
  }
  return out;
}

const file = process.argv[2];
if (!file) throw new Error('uso: matcher.eval.ts <arquivo.json>');
const samples = collect(lowerKeys(JSON.parse(readFileSync(file, 'utf8'))));

let top1 = 0, top2 = 0, none = 0, sure = 0, sureOk = 0;
const errors: string[] = [];
samples.forEach((s, i) => {
  const r = rank(s.readings, samples.filter((_, j) => j !== i));
  if (!r.length) return void none++;
  if (r[0].name === s.name) top1++;
  else errors.push(`${s.name} -> ${r[0].name} (${r[0].dist.toFixed(1)} dB)`);
  if (r.slice(0, 2).some((m) => m.name === s.name)) top2++;
  if (r[0].dist < THRESHOLD_DB) { sure++; if (r[0].name === s.name) sureOk++; }
});

const n = samples.length, pct = (x: number, d = n) => (d ? ((100 * x) / d).toFixed(0) : '-') + '%';
console.log(`${n} amostras, ${new Set(samples.map((s) => s.name)).size} lugares`);
console.log(`top-1 ${pct(top1)}  top-2 ${pct(top2)}  sem match ${none}`);
console.log(`verde (<${THRESHOLD_DB} dB): ${pct(sure)} das consultas, acerto ${pct(sureOk, sure)}`);
if (errors.length) console.log('erros:\n  ' + errors.join('\n  '));
