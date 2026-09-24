#!/usr/bin/env node
// Engine 2.3.0: planner AI (short-horizon simulation on cloned worlds).
//   - world RNG state lives in W.rs (same mulberry32 sequence) so worlds can be cloned deterministically
//   - cloneWorld(), quiet worlds (no events), per-side pilot: createWorld({ai:['planner', 'rule']})
//   - bench/compare/watch: --ai rule|planner; game menu: robot pilot; watch mode: &ai=planner
//   - tests: planner determinism
// Safe to re-run: an edit is skipped when its result is already present.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
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

const MAKERNG = String.raw`// World RNG keeps its state in W.rs (same sequence as mulberry32) so a world can be cloned for planning.
function makeRng(W){
  return function () {
    let a = W.rs | 0; a = a + 0x6D2B79F5 | 0; W.rs = a;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
`;

const PLANNER = String.raw`// ---------- planner AI: short-horizon simulation ----------
// Every PLAN.seg s the ship tries each macro on a cloned world for PLAN.horizon s: the macro drives turning and
// thrust for the first segment (fire timing and specials still come from the rule AI unless the macro presses spec),
// then both ships fall back to the rule AI. The opponent is always modelled by the rule AI.
// Deterministic: clones carry their own RNG state and never touch the real world.
const PLAN = {seg:0.3, horizon:1.2};
const MACROS = [
  {id:'rule'}, {id:'rule+spec', spec:true},
  {turn:'aim', thrust:1}, {turn:'aim', thrust:0},
  {turn:-1, thrust:1}, {turn:1, thrust:1}, {turn:-1, thrust:0}, {turn:1, thrust:0},
  {turn:'away', thrust:1}, {turn:'away', thrust:1, spec:true},
];
function cloneWorld(W){
  const map = new Map();
  const S = Object.assign({}, W);
  S.ships = W.ships.map(s => { if (!s) return s; const c = Object.assign({}, s, {ai:Object.assign({}, s.ai), plan:null}); map.set(s, c); return c; });
  S.shots = W.shots.map(o => Object.assign({}, o));
  S.fighters = W.fighters.map(f => Object.assign({}, f, {mother:map.get(f.mother) || f.mother}));
  S.pods = W.pods.map(o => Object.assign({}, o));
  S.asteroids = W.asteroids.map(o => Object.assign({}, o));
  S.beams = W.beams.map(o => Object.assign({}, o));
  S.stats = W.stats ? W.stats.map(o => Object.assign({}, o)) : W.stats;
  S.events = [];
  S.rng = makeRng(S);
  return S;
}
function macroCtl(W, s, e, m, k){
  const c = aiCtl(W, s, e, DT);                  // rule decisions: fire timing, specials, default steering
  if (m.spec) c.s = k === 0 || (s.def.id === 'sting' && k === 4);   // Sting needs a double press
  if (m.turn === undefined) return c;
  let dir = 0;
  if (m.turn === 'aim' || m.turn === 'away') {
    if (e) {
      const a = Math.atan2(wd(e.y, s.y), wd(e.x, s.x)) + (m.turn === 'away' ? Math.PI : 0);
      const d = angDiff(a, s.a); dir = d < -0.04 ? -1 : d > 0.04 ? 1 : 0;
    }
  } else dir = m.turn;
  c.l = dir < 0; c.r = dir > 0; c.t = !!m.thrust;
  return c;
}
function planScore(S, side, my0, en0){
  const me = S.ships[side], en = S.ships[1 - side];
  const myC = me && me.alive ? me.crew : 0, enC = en && en.alive ? en.crew : 0;
  let sc = (en0 - enC) - 1.3 * (my0 - myC);
  if (en && !en.alive) sc += 40;
  if (!me || !me.alive) sc -= 60;
  else {
    sc += 0.03 * me.batt;
    if (S.planet && Math.hypot(wd(me.x, PX), wd(me.y, PY)) < PR + me.def.r + 80) sc -= 3;
  }
  return sc;
}
function simulate(W, side, m){
  const S = cloneWorld(W); S.quiet = true; S.ai = null;
  const e0 = other(S, side), my0 = S.ships[side].crew, en0 = e0 ? e0.crew : 0;
  const seg = Math.round(PLAN.seg / DT), H = Math.round(PLAN.horizon / DT), ctls = [null, null];
  for (let k = 0; k < H; k++) {
    const me = S.ships[side], e = other(S, side);
    if (!me.alive || !e) break;
    ctls[side] = k < seg ? macroCtl(S, me, e, m, k) : null;
    step(S, ctls);
  }
  return planScore(S, side, my0, en0);
}
function plannerCtl(W, s, e){
  if (!e) return aiCtl(W, s, e, DT);
  const pl = s.plan || (s.plan = {t:0, m:MACROS[0], k:0});
  if (pl.t <= 0) {
    let best = MACROS[0], bs = -Infinity;
    for (const m of MACROS) { const sc = simulate(W, s.side, m); if (sc > bs + 1e-9) { bs = sc; best = m; } }
    pl.m = best; pl.k = 0; pl.t = PLAN.seg;
  }
  pl.t -= DT;
  return macroCtl(W, s, e, pl.m, pl.k++);
}

`;

patch('app/starship/engine.js', [
  ["const VERSION = '2.2.0';", "const VERSION = '2.3.0';"],
  ["const rnd = (W, a, b) => a + W.rng() * (b - a);", MAKERNG + "const rnd = (W, a, b) => a + W.rng() * (b - a);"],
  ["  const W = {rng:mulberry(seed), seed, phys:", "  const W = {rs:seed, seed, ai:o.ai || null, phys:"],
  ["  const na = o.asteroids !== undefined ? o.asteroids : W.phys.asteroids;",
   "  W.rng = makeRng(W);\n  const na = o.asteroids !== undefined ? o.asteroids : W.phys.asteroids;"],
  ["function emit(W, type, props){ const e = props || {};", "function emit(W, type, props){ if (W.quiet) return; const e = props || {};"],
  ["    const c = ctls && ctls[side] ? ctls[side] : aiCtl(W, s, other(W, side), DT);",
   "    const c = ctls && ctls[side] ? ctls[side]\n      : W.ai && W.ai[side] === 'planner' ? plannerCtl(W, s, other(W, side)) : aiCtl(W, s, other(W, side), DT);"],
  ["// ---------- шаг ----------", PLANNER + "// ---------- шаг ----------"],
  ["  effP, shipKeys, fmt, parseIni, createWorld, spawn, placeShip, other, step};",
   "  effP, shipKeys, fmt, parseIni, createWorld, cloneWorld, spawn, placeShip, other, step, PLAN, MACROS};"],
]);

patch('app/starship/CHANGELOG.md', [
  ["\n## 2.2.0", "\n## 2.3.0\n- Planner AI: every 0.3 s tries 10 manoeuvres on cloned worlds for 1.2 s and picks the best by crew exchange.\n  Opt-in per side: `createWorld({ai:['planner', 'rule']})`; the rule AI stays the default.\n- World RNG state moved to `W.rs` (same mulberry32 sequence: rule-AI results are unchanged), `cloneWorld()`,\n  quiet worlds emit no events.\n\n## 2.2.0"],
]);

patch('tools/melee-bench/bench.mjs', [
  ["seed:0, compare:null, note:''};", "seed:0, compare:null, note:'', ai:'rule'};"],
  ["    else if (k === '--note') a.note = nx();", "    else if (k === '--note') a.note = nx();\n    else if (k === '--ai') a.ai = nx();"],
  ["phys:{}, ships:{}, planet:a.planet, seed:a.seed};", "phys:{}, ships:{}, planet:a.planet, seed:a.seed, ai:a.ai};"],
  ["planet:opt.planet, diff:[opt.diff, opt.diff]});", "planet:opt.planet, diff:[opt.diff, opt.diff], ai:[opt.ai, opt.ai]});"],
  ["ИИ: ${a.diff}, лимит", "ИИ: ${a.diff}/${a.ai}, лимит"],
  ["seed:a.seed, ships:a.ships, workers:a.workers};", "seed:a.seed, ships:a.ships, workers:a.workers, ai:a.ai};"],
  ["_${tag.replace(/[^\\w.-]+/g, '_')}`);", "_${tag.replace(/[^\\w.-]+/g, '_')}${a.ai !== 'rule' ? '_' + a.ai : ''}`);"],
]);

patch('tools/melee-bench/compare.mjs', [
  ["· n=${R.n} · ИИ ${R.d.args.diff} · сиды", "· n=${R.n} · ИИ ${R.d.args.diff}/${R.d.args.ai || 'rule'} · сиды"],
  ["  if (A.d.args.diff !== B.d.args.diff) w.push(`разный уровень ИИ: ${A.d.args.diff} → ${B.d.args.diff}`);",
   "  if (A.d.args.diff !== B.d.args.diff) w.push(`разный уровень ИИ: ${A.d.args.diff} → ${B.d.args.diff}`);\n  if ((A.d.args.ai || 'rule') !== (B.d.args.ai || 'rule')) w.push(`разный пилот ИИ: ${A.d.args.ai || 'rule'} → ${B.d.args.ai || 'rule'}`);"],
]);

patch('tools/melee-bench/watch.mjs', [
  ["planet:args.planet === false ? '0' : '1', expect:k + ':' + e.t});", "planet:args.planet === false ? '0' : '1', ai:args.ai || 'rule', expect:k + ':' + e.t});"],
]);

patch('app/starship-duel.html', [
  ["  {k:'diff', label:'Сложность робота', opts:[['easy','Легко'],['normal','Средне'],['hard','Сложно']]},",
   "  {k:'diff', label:'Сложность робота', opts:[['easy','Легко'],['normal','Средне'],['hard','Сложно']]},\n  {k:'pilot', label:'Пилот робота', opts:[['rule','Правила (быстрый)'],['planner','Планировщик (умнее)']]},"],
  ["const DEFAULT_GAME = {mode:'ai', diff:'normal', fleet:'5', planet:'on', sound:'on'};", "const DEFAULT_GAME = {mode:'ai', diff:'normal', pilot:'rule', fleet:'5', planet:'on', sound:'on'};"],
  ["planet:cfg.planet === 'on', diff:[cfg.diff, cfg.diff]});", "planet:cfg.planet === 'on', diff:[cfg.diff, cfg.diff], ai:[null, cfg.pilot]});"],
  ["planet:WATCH.planet, diff:[WATCH.diff, WATCH.diff]});", "planet:WATCH.planet, diff:[WATCH.diff, WATCH.diff], ai:[WATCH.ai, WATCH.ai]});"],
  ["expect:q.get('expect'),", "expect:q.get('expect'), ai:q.get('ai') || 'rule',"],
  ["' · ИИ ' + WATCH.diff +", "' · ИИ ' + WATCH.diff + '/' + WATCH.ai +"],
]);

const TEST = resolve(ROOT, 'tools/melee-bench/planner.test.mjs');
if (!existsSync(TEST)) {
  writeFileSync(TEST, String.raw`// Planner AI: deterministic and exception-free on representative pairs. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const E = createRequire(import.meta.url)(resolve(dirname(fileURLToPath(import.meta.url)), '../../app/starship/engine.js'));

function fight(i, j, seed){
  const W = E.createWorld({seed, planet:true, diff:['hard', 'hard'], ai:['planner', 'planner']});
  E.spawn(W, 0, i); E.spawn(W, 1, j);
  for (let k = 0; k < 30 / E.DT; k++) { E.step(W, null); W.events.length = 0; if (!W.ships[0].alive || !W.ships[1].alive) break; }
  return W.ships.map(s => [s.alive, s.crew, s.x.toFixed(6), s.y.toFixed(6)]).concat([W.time.toFixed(6), W.rs]);
}

test('planner is deterministic and never throws', () => {
  for (const [i, j] of [[0, 1], [3, 7], [2, 4], [6, 5]]) assert.deepEqual(fight(i, j, 7), fight(i, j, 7), E.SHIPS[i].id + ' vs ' + E.SHIPS[j].id);
});
`);
  console.log('tools/melee-bench/planner.test.mjs: created');
}
