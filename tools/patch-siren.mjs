#!/usr/bin/env node
// Siren fixes in two measurable steps:
//   node tools/patch-siren.mjs 1  → engine 2.0.4: song pods spawn outside the victim's hull and the victim cannot
//                                   re-collect them for 1.2 s (bug fix); bench shows crew picked up per fight
//   node tools/patch-siren.mjs 2  → engine 2.1.0: crew magnet (magnetR / magnetF params); Siren AI stops chasing
//                                   pods that the magnet will bring anyway or that sit next to the enemy
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

const step = process.argv[2];
if (step === '1') {
  patch('app/starship/engine.js', [
    ["const VERSION = '2.0.3';", "const VERSION = '2.0.4';"],
    ["    stats:[{fire:0, spec:0, fighter:0, planet:0, steal:0}, {fire:0, spec:0, fighter:0, planet:0, steal:0}]};",
     "    stats:[{fire:0, spec:0, fighter:0, planet:0, steal:0, pick:0}, {fire:0, spec:0, fighter:0, planet:0, steal:0, pick:0}]};"],
    ["        W.pods.push({x:e.x, y:e.y, vx:Math.cos(a) * sp + e.vx * 0.4, vy:Math.sin(a) * sp + e.vy * 0.4, life:9});",
     "        // spawn just outside the victim's hull; the victim cannot re-collect its own crew for a moment\n        W.pods.push({x:wrapW(e.x + Math.cos(a) * (e.def.r + 10)), y:wrapW(e.y + Math.sin(a) * (e.def.r + 10)),\n          vx:Math.cos(a) * sp + e.vx * 0.4, vy:Math.sin(a) * sp + e.vy * 0.4, life:9, from:e.side, grace:1.2});"],
    ["    q.life -= dt; q.vx *= 1 - 0.6 * dt; q.vy *= 1 - 0.6 * dt;",
     "    q.life -= dt; q.grace = (q.grace || 0) - dt; q.vx *= 1 - 0.6 * dt; q.vy *= 1 - 0.6 * dt;"],
    ["dist2(q, s) < s.def.r + 8) { if (s.crew < s.p.crewMax) s.crew++;",
     "dist2(q, s) < s.def.r + 8 && !(q.grace > 0 && s.side === q.from)) { if (s.crew < s.p.crewMax) { s.crew++; W.stats[s.side].pick++; }"],
  ]);
  patch('app/starship/CHANGELOG.md', [
    ["\n## 2.0.3", "\n## 2.0.4\n- Fix: Siren song pods spawned inside the victim's hull, so the victim re-collected its own crew on the next step\n  and the song did almost nothing. Pods now spawn outside the hull; the victim cannot pick them up for 1.2 s.\n- Bench stats: crew picked up per side (`pick`).\n\n## 2.0.3"],
  ]);
  patch('tools/melee-bench/bench.mjs', [
    ["  const KINDS = ['fire', 'spec', 'fighter', 'planet', 'steal'];", "  const KINDS = ['fire', 'spec', 'fighter', 'planet', 'steal', 'pick'];"],
    ["s = {to:0, t:0, fire:0, spec:0, fighter:0, planet:0, steal:0};", "s = {to:0, t:0, fire:0, spec:0, fighter:0, planet:0, steal:0, pick:0};"],
    ["pad('планета', 9) + 'украл');", "pad('планета', 9) + pad('украл', 7) + 'подобрал');"],
    ["${pad(f(s.planet), 9)}${f(s.steal)}`);", "${pad(f(s.planet), 9)}${pad(f(s.steal), 7)}${f(s.pick)}`);"],
  ]);
} else if (step === '2') {
  patch('app/starship/engine.js', [
    ["const VERSION = '2.0.4';", "const VERSION = '2.1.0';"],
    ["  insultGain:'Оскорбление: + батареи', rebirth:'Шанс перерождения, %',",
     "  insultGain:'Оскорбление: + батареи', rebirth:'Шанс перерождения, %',\n  magnetR:'Магнит экипажа: радиус', magnetF:'Магнит экипажа: сила',"],
    ["  stealMin:[0,20,1], stealMax:[0,20,1], insultGain:[0,20,1], rebirth:[0,100,5],",
     "  stealMin:[0,20,1], stealMax:[0,20,1], insultGain:[0,20,1], rebirth:[0,100,5], magnetR:[0,1500,10], magnetF:[0,2000,10],"],
    ["sCost:5, sCd:1.0, sRange:360, stealMin:2, stealMax:6},", "sCost:5, sCd:1.0, sRange:360, stealMin:2, stealMax:6, magnetR:420, magnetF:260},"],
    ["   keys:['fCost','fCd','fDmg','fSpd','fLife','sCost','sCd','sRange','stealMin','stealMax'],",
     "   keys:['fCost','fCd','fDmg','fSpd','fLife','sCost','sCd','sRange','stealMin','stealMax','magnetR','magnetF'],"],
    ["экипажа врага вылетают в космос. Подберите их к себе (до {crewMax}).'",
     "экипажа врага вылетают в космос; экипаж в радиусе {magnetR} сам притягивается к Сирене (до {crewMax}).'"],
    ["    q.life -= dt; q.grace = (q.grace || 0) - dt; q.vx *= 1 - 0.6 * dt; q.vy *= 1 - 0.6 * dt;",
     "    q.life -= dt; q.grace = (q.grace || 0) - dt; q.vx *= 1 - 0.6 * dt; q.vy *= 1 - 0.6 * dt;\n    // Siren crew magnet: pods inside magnetR accelerate toward the magnet ship\n    for (const s of W.ships) {\n      if (!s || !s.alive || !s.p.magnetF) continue;\n      const dx = wd(s.x, q.x), dy = wd(s.y, q.y), d = Math.hypot(dx, dy);\n      if (d < s.p.magnetR && d > 1) { q.vx += dx / d * s.p.magnetF * dt; q.vy += dy / d * s.p.magnetF * dt; }\n    }"],
    ["    let best = null, bd = 500;\n    for (const q of W.pods) { const pd = dist2(q, s); if (pd < bd) { bd = pd; best = q; } }",
     "    // pods inside the magnet come by themselves; fetch only far ones that are not in the enemy's face\n    let best = null, bd = 600;\n    for (const q of W.pods) {\n      const pd = dist2(q, s);\n      if (pd < (p.magnetR || 0) || (eAlive && dist2(q, e) < 150)) continue;\n      if (pd < bd) { bd = pd; best = q; }\n    }"],
  ]);
  patch('app/starship/CHANGELOG.md', [
    ["\n## 2.0.4", "\n## 2.1.0\n- Siren crew magnet: pods within `magnetR` (default 420) accelerate toward her at `magnetF` (default 260).\n  Both are tunable ship params (game UI and INI).\n- Siren AI no longer chases pods the magnet will bring anyway, nor pods sitting next to the enemy.\n\n## 2.0.4"],
  ]);
} else {
  console.log('Usage: node tools/patch-siren.mjs 1|2');
  process.exit(1);
}
