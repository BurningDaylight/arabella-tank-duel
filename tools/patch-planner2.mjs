#!/usr/bin/env node
// Engine 2.3.1: planner fixes.
//   - symmetric planning: every planner side decides at the start of a tick, on the same untouched world
//   - engagement shaping: small penalty for being far from own preferred distance (breaks planner-vs-planner stalls)
//   - loss weight 1.3 → 1.1 (less timid); PLAN.lossW / PLAN.distW are tunable
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
  ["const VERSION = '2.3.0';", "const VERSION = '2.3.1';"],
  ["const PLAN = {seg:0.3, horizon:1.2};",
   "const PLAN = {seg:0.3, horizon:1.2, lossW:1.1, distW:0.004};\n// preferred fighting distance, same formula as the rule AI (weapon range from current params)\nfunction prefDist(s){\n  const d = s.def, p = s.p;\n  const frange = d.id === 'blink' ? p.fRange : (p.fSpd && p.fLife ? p.fSpd * p.fLife : d.frange);\n  return d.pref > 0 ? Math.min(d.pref, frange * 0.8) : 0;\n}"],
  ["  let sc = (en0 - enC) - 1.3 * (my0 - myC);", "  let sc = (en0 - enC) - PLAN.lossW * (my0 - myC);"],
  ["  else {\n    sc += 0.03 * me.batt;",
   "  else {\n    sc += 0.03 * me.batt;\n    // engagement shaping: stay near own preferred distance, otherwise two careful planners never meet\n    if (en && en.alive) sc -= PLAN.distW * Math.abs(dist2(me, en) - prefDist(me));"],
  ["function plannerCtl(W, s, e){\n  if (!e) return aiCtl(W, s, e, DT);\n  const pl = s.plan || (s.plan = {t:0, m:MACROS[0], k:0});\n  if (pl.t <= 0) {\n    let best = MACROS[0], bs = -Infinity;\n    for (const m of MACROS) { const sc = simulate(W, s.side, m); if (sc > bs + 1e-9) { bs = sc; best = m; } }\n    pl.m = best; pl.k = 0; pl.t = PLAN.seg;\n  }\n  pl.t -= DT;\n  return macroCtl(W, s, e, pl.m, pl.k++);\n}",
   "// choose a macro when due; runs for every planner side at the start of a tick, before anyone moves\nfunction planAhead(W, s, e){\n  const pl = s.plan || (s.plan = {t:0, m:MACROS[0], k:0});\n  if (!e || pl.t > 0) return;\n  let best = MACROS[0], bs = -Infinity;\n  for (const m of MACROS) { const sc = simulate(W, s.side, m); if (sc > bs + 1e-9) { bs = sc; best = m; } }\n  pl.m = best; pl.k = 0; pl.t = PLAN.seg;\n}\nfunction plannerCtl(W, s, e){\n  if (!e || !s.plan) return aiCtl(W, s, e, DT);\n  s.plan.t -= DT;\n  return macroCtl(W, s, e, s.plan.m, s.plan.k++);\n}"],
  ["function step(W, ctls){\n  W.time += DT;",
   "function step(W, ctls){\n  // planners decide first, on the same untouched world, so neither side sees the other's move of this tick\n  if (W.ai) for (let side = 0; side < 2; side++) {\n    const s = W.ships[side];\n    if (W.ai[side] === 'planner' && s && s.alive && !(ctls && ctls[side])) planAhead(W, s, other(W, side));\n  }\n  W.time += DT;"],
]);

patch('app/starship/CHANGELOG.md', [
  ["\n## 2.3.0", "\n## 2.3.1\n- Planner: symmetric decisions (both sides plan at the start of a tick on the same world; 2.3.0 let side 1 see\n  side 0's move of the current tick).\n- Planner: engagement shaping (`PLAN.distW`) toward the preferred distance and loss weight 1.3 → 1.1 (`PLAN.lossW`)\n  to break planner-vs-planner stalls. Rule AI unchanged.\n\n## 2.3.0"],
]);
