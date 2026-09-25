#!/usr/bin/env node
// Engine 2.3.2: planner time pressure and far-away shortcut.
//   - engagement shaping grows with fight time (PLAN.pressT): careful pilots cannot stall until the time limit
//   - no simulation while the enemy is farther than PLAN.farD: the rule AI approaches just as well, much cheaper
// Rule AI is untouched: rule-only runs must stay identical.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function patch(rel, edits){
  const f = resolve(ROOT, rel); let s = readFileSync(f, 'utf8'), n = 0;
  for (const [from, to] of edits) {
    if (s.includes(to)) continue;
    const k = s.split(from).length - 1;
    if (k !== 1) { console.error(`  ! ${rel}: expected exactly 1 match, found ${k}:\n      ${from.slice(0, 110)}`); process.exitCode = 1; continue; }
    s = s.replace(from, () => to); n++;
  }
  if (n) { copyFileSync(f, f + '.bak'); writeFileSync(f, s); }
  console.log(`${rel}: ${n} edit(s) applied`);
}

patch('app/starship/engine.js', [
  ["const VERSION = '2.3.1';", "const VERSION = '2.3.2';"],
  ["const PLAN = {seg:0.3, horizon:1.2, lossW:1.1, distW:0.004};", "const PLAN = {seg:0.3, horizon:1.2, lossW:1.1, distW:0.004, pressT:20, farD:1400};"],
  ["    if (en && en.alive) sc -= PLAN.distW * Math.abs(dist2(me, en) - prefDist(me));",
   "    // pressure grows with fight time so careful pilots cannot stall until the time limit\n    if (en && en.alive) sc -= PLAN.distW * (1 + S.time / PLAN.pressT) * Math.abs(dist2(me, en) - prefDist(me));"],
  ["  if (!e || pl.t > 0) return;",
   "  if (!e || pl.t > 0) return;\n  // far away there is nothing to plan: the rule AI approaches just as well and much cheaper\n  if (dist2(s, e) > PLAN.farD) { pl.m = MACROS[0]; pl.k = 0; pl.t = PLAN.seg; return; }"],
]);

patch('app/starship/CHANGELOG.md', [
  ["\n## 2.3.1", "\n## 2.3.2\n- Planner: engagement pressure grows with fight time (`PLAN.pressT`, x2 at 20 s, x3 at 40 s) to stop\n  planner-vs-planner stalls (2.3.1: Blink timed out in 75% of fights).\n- Planner: no simulation while the enemy is farther than `PLAN.farD` (1400); the rule AI drives the approach.\n\n## 2.3.1"],
]);
