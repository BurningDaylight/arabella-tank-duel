#!/usr/bin/env node
// One-shot patch to engine 2.0.3: AI approach distance capped by weapon range,
// per-source damage stats in W.stats; bench/compare print timeouts and damage breakdown.
// Safe to re-run: an edit is skipped when its result is already present.
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
  ["const VERSION = '2.0.2';", "const VERSION = '2.0.3';"],
  ["    shots:[], fighters:[], pods:[], asteroids:[], beams:[], events:[]};",
   "    shots:[], fighters:[], pods:[], asteroids:[], beams:[], events:[],\n    // per-side damage dealt by source; 'planet' is damage taken; 'steal' is crew stolen by song\n    stats:[{fire:0, spec:0, fighter:0, planet:0, steal:0}, {fire:0, spec:0, fighter:0, planet:0, steal:0}]};"],
  ["    dmg:o.dmg, life:o.life, max:o.life, r:o.r || 3, kind:o.kind, col:o.col, side:s.side, age:0});",
   "    dmg:o.dmg, life:o.life, max:o.life, r:o.r || 3, kind:o.kind, col:o.col, side:s.side, age:0, src:o.src || 'fire'});"],
  ["damage(W, e, p.fDmg);", "damage(W, e, p.fDmg, 'fire');"],
  ["else damage(W, best, p.sDmg);", "else damage(W, best, p.sDmg, 'spec');"],
  ["kind:'missile', col:'#9f9'}", "kind:'missile', col:'#9f9', src:'spec'}"],
  ["Math.round(s.p.gloryDmg * (1 - d / R))));", "Math.round(s.p.gloryDmg * (1 - d / R))), 'spec');"],
  ["    e.crew -= steal;", "    e.crew -= steal; W.stats[s.side].steal += steal;"],
  ["function damage(W, s, dmg){\n  if (!s || !s.alive || s.inv > 0 || dmg <= 0) return;\n  s.crew -= dmg;",
   "function damage(W, s, dmg, src){\n  if (!s || !s.alive || s.inv > 0 || dmg <= 0) return;\n  // bench accounting: credited to the opponent by source; planet hits are counted as taken by the victim\n  const st = src === 'planet' ? W.stats[s.side] : W.stats[1 - s.side];\n  if (src && st) st[src] = (st[src] || 0) + Math.min(dmg, s.crew);\n  s.crew -= dmg;"],
  ["damage(W, s, ph.planetDmg);", "damage(W, s, ph.planetDmg, 'planet');"],
  ["damage(W, e, sh.dmg); dead = true;", "damage(W, e, sh.dmg, sh.src); dead = true;"],
  ["damage(W, e, f.dmg); }", "damage(W, e, f.dmg, 'fighter'); }"],
  ["  else if (dist > pref * 1.15 + 40) thrust = Math.abs(angDiff(desA, s.a)) < 0.7;",
   "  // approach until inside both the preferred distance and the real weapon range (never park out of range)\n  else if (dist > Math.min(pref * 1.15 + 40, frange * 0.95)) thrust = Math.abs(angDiff(desA, s.a)) < 0.7;"],
]);

patch('app/starship/CHANGELOG.md', [
  ["\n## 2.0.2", "\n## 2.0.3\n- AI never parks outside its own weapon range: approach distance is capped by the actual weapon range\n  (2.0.2 still let Blink hover at ~205 with a 180 laser, producing timeouts).\n- Per-source damage accounting in `W.stats` (fire / spec / fighter / planet taken / crew stolen) for the bench.\n  No gameplay change.\n\n## 2.0.2"],
]);

patch('tools/melee-bench/bench.mjs', [
  ["  const steps = Math.round(opt.time / E.DT);",
   "  // attach per-side damage stats (engine >= 2.0.3; empty for older engines)\n  const fin = r => Object.assign(r, {sa:(W.stats && W.stats[A]) || {}, sb:(W.stats && W.stats[B]) || {}});\n  const steps = Math.round(opt.time / E.DT);"],
  ["      if (!a.alive && !b.alive) return {w:-1, t:W.time, mutual:true};",
   "      if (!a.alive && !b.alive) return fin({w:-1, t:W.time, mutual:true});"],
  ["      return a.alive ? {w:0, t:W.time, crew:a.crew / a.p.crewMax} : {w:1, t:W.time, crew:b.crew / b.p.crewMax};",
   "      return fin(a.alive ? {w:0, t:W.time, crew:a.crew / a.p.crewMax} : {w:1, t:W.time, crew:b.crew / b.p.crewMax});"],
  ["  return {w:-1, t:opt.time, timeout:true};", "  return fin({w:-1, t:opt.time, timeout:true});"],
  ["    const r = {i, j, wi:0, wj:0, draw:0, mutual:0, timeout:0, tSum:0, crewI:0, crewJ:0};",
   "    const r = {i, j, wi:0, wj:0, draw:0, mutual:0, timeout:0, tSum:0, crewI:0, crewJ:0, si:{}, sj:{}};"],
  ["      r.tSum += m.t;",
   "      r.tSum += m.t;\n      for (const k in m.sa) r.si[k] = (r.si[k] || 0) + m.sa[k];\n      for (const k in m.sb) r.sj[k] = (r.sj[k] || 0) + m.sb[k];"],
  ["  const cell = (i, j) => M[i + ',' + j];",
   "  const cell = (i, j) => M[i + ',' + j];\n  const per = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, v / n]));"],
  ["crew:r.wi ? r.crewI / r.wi : 0}, base);", "crew:r.wi ? r.crewI / r.wi : 0, dmg:per(r.si)}, base);"],
  ["crew:r.wj ? r.crewJ / r.wj : 0}, base);", "crew:r.wj ? r.crewJ / r.wj : 0, dmg:per(r.sj)}, base);"],
  ["  console.log('\\nРейтинг (средний % побед, ничья = пол-победы):');\n  rank.forEach((i, k) => console.log(`  ${k + 1}. ${pad(name(i), 10)} ${(score(i) * 100).toFixed(1)}%`));",
   "  // per-ship summary over non-mirror opponents: timeouts, fight length, damage per match by source\n  const KINDS = ['fire', 'spec', 'fighter', 'planet', 'steal'];\n  const shipStat = i => {\n    const o = ids.filter(j => j !== i), s = {to:0, t:0, fire:0, spec:0, fighter:0, planet:0, steal:0};\n    for (const j of o) { const c = cell(i, j); s.to += c.timeout; s.t += c.t; for (const k of KINDS) s[k] += (c.dmg && c.dmg[k]) || 0; }\n    for (const k in s) s[k] /= Math.max(1, o.length);\n    return s;\n  };\n  console.log('\\nРейтинг (ничья = пол-победы), таймауты, длина боя и урон за бой по источникам:');\n  console.log('     ' + pad('корабль', 11) + pad('рейтинг', 9) + pad('таймаут', 9) + pad('бой,с', 7) + pad('оружие', 8) + pad('спец', 7) + pad('истреб', 8) + pad('планета', 9) + 'украл');\n  rank.forEach((i, k) => {\n    const s = shipStat(i), f = v => v.toFixed(1);\n    console.log(`  ${pad(k + 1 + '.', 3)}${pad(name(i), 11)}${pad((score(i) * 100).toFixed(1) + '%', 9)}${pad((s.to * 100).toFixed(0) + '%' + (s.to > 0.2 ? ' ⚠' : ''), 9)}${pad(f(s.t), 7)}${pad(f(s.fire), 8)}${pad(f(s.spec), 7)}${pad(f(s.fighter), 8)}${pad(f(s.planet), 9)}${f(s.steal)}`);\n  });\n  const stuck = rank.filter(i => shipStat(i).to > 0.2).map(name);\n  if (stuck.length) console.log(`  ⚠ много таймаутов (>20%): ${stuck.join(', ')} — скорее всего, ИИ не может сблизиться или достать, а не баланс`);"],
  ["name:name(i), score:score(i)}))", "name:name(i), score:score(i), stat:shipStat(i)}))"],
]);

patch('tools/melee-bench/compare.mjs', [
  ["  const nPair = Math.max(1, ids.length - 1);",
   "  const nPair = Math.max(1, ids.length - 1);\n  // timeout share per ship (stored since engine 2.0.3); a jump usually means the AI got stuck, not balance\n  const toOf = (R, id) => { const s = R.ships.find(q => q.id === id); return s && s.stat ? s.stat.to : null; };\n  const toStr = id => {\n    const a = toOf(A, id), b = toOf(B, id); if (a == null && b == null) return '';\n    const f = v => v == null ? '—' : (v * 100).toFixed(0) + '%', s = `таймаут ${f(a)} → ${f(b)}`;\n    return b != null && b > 0.2 ? C.y(s + ' ⚠') : C.d(s);\n  };"],
  ["${C.d('(было ' + was + ')')}`);", "${pad(C.d('(было ' + was + ')'), 10)} ${toStr(id)}`);"],
]);
