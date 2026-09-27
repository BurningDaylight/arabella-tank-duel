#!/usr/bin/env node
// Engine 2.4.0: tiered planner objective (default) instead of a single weighted score.
//   tiers: never die for nothing → win and survive → mutual kill only when weaker → max damage with an
//   acceptable trade (dealt - tradeW * lost > 0) → otherwise close to the preferred distance.
//   PLAN.mode = 'weighted' reproduces 2.3.2 exactly; bench: --plan-mode weighted|tiered; watch links carry it.
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

const METRICS = String.raw`  const me = S.ships[side], en = S.ships[1 - side], alive = me && me.alive, enAlive = en && en.alive;
  const myC = alive ? me.crew : 0, enC = enAlive ? en.crew : 0;
  return {m, dealt:en0 - enC, lost:my0 - myC, kill:!enAlive, died:!alive, myC,
    dist:alive && enAlive ? dist2(me, en) : 0, pref:prefDist(W.ships[side]), batt:alive ? me.batt : 0,
    planet:!!(alive && S.planet && Math.hypot(wd(me.x, PX), wd(me.y, PY)) < PR + me.def.r + 80),
    score:planScore(S, side, my0, en0)};
}
function argmax(list, f){ let b = list[0], bv = f(b); for (const r of list) { const v = f(r); if (v > bv + 1e-9) { b = r; bv = v; } } return b; }
// tiered objective (PLAN.mode = 'tiered'):
//   1) never pick a plan where I die and the enemy survives (unless every plan does)
//   2) a plan that kills the enemy and keeps me alive wins; among those, the one that keeps most crew
//   3) mutual destruction counts as a kill only when I am the weaker side (fewer crew than the enemy)
//   4) otherwise take the most damage dealt, as long as the trade is acceptable: dealt - tradeW * lost > 0
//   5) if no plan hurts the enemy: get to the preferred distance; losses are very expensive, planet forbidden
function pickTiered(W, s, rs){
  const e = other(W, s.side), weaker = !!(e && s.crew < e.crew);
  const safe = rs.filter(r => !r.died || (r.kill && weaker));
  const pool = safe.length ? safe : rs;
  const wins = pool.filter(r => r.kill && !r.died);
  if (wins.length) return argmax(wins, r => r.myC);
  const trades = pool.filter(r => r.kill);
  if (trades.length) return argmax(trades, r => r.dealt);
  const hits = pool.filter(r => r.dealt > 0 && r.dealt - PLAN.tradeW * r.lost > 0);
  if (hits.length) return argmax(hits, r => r.dealt - PLAN.tradeW * r.lost);
  return argmax(pool, r => -Math.abs(r.dist - r.pref) - (r.planet ? 500 : 0) - 50 * r.lost + 0.5 * r.batt);
}
`;

patch('app/starship/engine.js', [
  ["const VERSION = '2.3.2';", "const VERSION = '2.4.0';"],
  ["const PLAN = {seg:0.3, horizon:1.2, lossW:1.1, distW:0.004, pressT:20, farD:1400};",
   "const PLAN = {seg:0.3, horizon:1.2, lossW:1.1, distW:0.004, pressT:20, farD:1400, mode:'tiered', tradeW:0.8};"],
  ["  return planScore(S, side, my0, en0);\n}", METRICS],
  ["  let best = MACROS[0], bs = -Infinity;\n  for (const m of MACROS) { const sc = simulate(W, s.side, m); if (sc > bs + 1e-9) { bs = sc; best = m; } }\n  pl.m = best; pl.k = 0; pl.t = PLAN.seg;",
   "  const rs = MACROS.map(m => simulate(W, s.side, m));\n  const pick = PLAN.mode === 'tiered' ? pickTiered(W, s, rs) : argmax(rs, r => r.score);   // 'weighted' = 2.3.2\n  pl.m = pick.m; pl.k = 0; pl.t = PLAN.seg;"],
]);

patch('app/starship/CHANGELOG.md', [
  ["\n## 2.3.2", "\n## 2.4.0\n- Planner objective is now tiered (`PLAN.mode = 'tiered'`, default): never die for nothing, then win and survive,\n  mutual kill only when weaker, then max damage with an acceptable trade (`PLAN.tradeW` 0.8), then close to\n  the preferred distance. The old weighted score stays as `PLAN.mode = 'weighted'` (identical to 2.3.2).\n  Fixes planner stalls where every even trade scored negative (Blink vs Blink).\n\n## 2.3.2"],
]);

patch('tools/melee-bench/bench.mjs', [
  ["    else if (k === '--ai') a.ai = nx();", "    else if (k === '--ai') a.ai = nx();\n    else if (k === '--plan-mode') a.planMode = nx();"],
  ["seed:a.seed, ai:a.ai};", "seed:a.seed, ai:a.ai, planMode:a.planMode};"],
  ["workers:a.workers, ai:a.ai};", "workers:a.workers, ai:a.ai, planMode:a.planMode};"],
  ["  const {opt} = workerData;", "  const {opt} = workerData;\n  if (opt.planMode) E.PLAN.mode = opt.planMode;   // planner objective override for experiments"],
  ["${a.ai !== 'rule' ? '_' + a.ai : ''}", "${a.ai !== 'rule' ? '_' + a.ai : ''}${a.planMode ? '_' + a.planMode : ''}"],
  ["ИИ: ${a.diff}/${a.ai}, лимит", "ИИ: ${a.diff}/${a.ai}${a.planMode ? ':' + a.planMode : ''}, лимит"],
]);

patch('tools/melee-bench/watch.mjs', [
  ["ai:args.ai || 'rule', expect:", "ai:args.ai || 'rule', pm:args.planMode || '', expect:"],
]);

patch('app/starship-duel.html', [
  ["ai:q.get('ai') || 'rule',", "ai:q.get('ai') || 'rule', pm:q.get('pm') || '',"],
  ["  W = E.createWorld({seed:seed, phys:S.phys", "  if (WATCH.pm) E.PLAN.mode = WATCH.pm;\n  W = E.createWorld({seed:seed, phys:S.phys"],
]);
