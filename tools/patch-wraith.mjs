#!/usr/bin/env node
// Engine 2.2.0: Wraith cloak rework.
//   - cloaked ship is immune to all weapons (shots pass through; laser, song, fighters, glory do nothing); planet still hurts
//   - cloak drains battery (cloakDrain per second); at zero battery the ship drops out of the shadow
//   - ambush: for ambushT seconds after leaving the shadow the flamer deals ambushMul x damage
//   - AI does not waste shots on a cloaked (immune) target
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
  ["const VERSION = '2.1.0';", "const VERSION = '2.2.0';"],
  // params
  ["  magnetR:'Магнит экипажа: радиус', magnetF:'Магнит экипажа: сила',",
   "  magnetR:'Магнит экипажа: радиус', magnetF:'Магнит экипажа: сила',\n  cloakDrain:'Маскировка: расход батареи в секунду', ambushMul:'Засада: множитель урона', ambushT:'Засада: длительность, с',"],
  ["magnetR:[0,1500,10], magnetF:[0,2000,10],", "magnetR:[0,1500,10], magnetF:[0,2000,10], cloakDrain:[0,20,0.1], ambushMul:[1,10,0.1], ambushT:[0,5,0.1],"],
  ["fSpd:360, fLife:0.38, sCost:3, sCd:0.4},", "fSpd:360, fLife:0.38, sCost:3, sCd:0.4, cloakDrain:1.5, ambushMul:2, ambushT:0.8},"],
  ["   keys:['fCost','fCd','fDmg','fSpd','fLife','sCost','sCd'],", "   keys:['fCost','fCd','fDmg','fSpd','fLife','sCost','sCd','cloakDrain','ambushMul','ambushT'],"],
  ["special:'Маскировка (цена {sCost}): почти невидим, робот теряет цель, батарея не заряжается. Выстрел или повторное нажатие снимает маскировку.',",
   "special:'Маскировка (цена {sCost}, расход {cloakDrain}/с): невидим и неуязвим для оружия, батарея не заряжается. Выстрел или повторное нажатие снимает маскировку; первые {ambushT} с после выхода из тени урон ×{ambushMul}.',"],
  // wraith fire / spec: leaving the shadow opens the ambush window
  ["      s.cloak = false;\n      shoot(W, s, {speed:p.fSpd, ang:rnd(W, -0.12, 0.12), dmg:p.fDmg,",
   "      if (s.cloak) { s.cloak = false; s.ambush = p.ambushT || 0; }   // leaving the shadow opens the ambush window\n      shoot(W, s, {speed:p.fSpd, ang:rnd(W, -0.12, 0.12), dmg:p.fDmg * (s.ambush > 0 ? (p.ambushMul || 1) : 1),"],
  ["      if (s.cloak) { s.cloak = false; return true; }", "      if (s.cloak) { s.cloak = false; s.ambush = p.ambushT || 0; return true; }"],
  // immunity
  ["if (d > p.fRange || (e.cloak && d > 90)) return false;", "if (d > p.fRange || e.cloak) return false;   // cloaked ships are immune to weapons"],
  ["if (!e || e.crew <= 1 || dist2(e, s) > p.sRange || !pay(s, p.sCost)) return false;", "if (!e || e.cloak || e.crew <= 1 || dist2(e, s) > p.sRange || !pay(s, p.sCost)) return false;"],
  ["function damage(W, s, dmg, src){\n  if (!s || !s.alive || s.inv > 0 || dmg <= 0) return;",
   "function damage(W, s, dmg, src){\n  if (!s || !s.alive || s.inv > 0 || dmg <= 0) return;\n  if (s.cloak && src !== 'planet') return;   // cloaked: immune to all weapons, the planet still hurts"],
  ["    if (!dead && e && dist2(sh, e) < e.def.r + sh.r) {", "    if (!dead && e && !e.cloak && dist2(sh, e) < e.def.r + sh.r) {   // shots pass through a cloaked ship"],
  // timers and battery drain
  ["  s.inv = Math.max(0, s.inv - dt); s.cdF -= dt; s.cdS -= dt; s.hitCd -= dt;",
   "  s.inv = Math.max(0, s.inv - dt); s.cdF -= dt; s.cdS -= dt; s.hitCd -= dt; s.ambush = Math.max(0, (s.ambush || 0) - dt);"],
  ["  while (s.regenT >= p.regen) { s.regenT -= p.regen; if (!(d.id === 'wraith' && s.cloak)) s.batt = Math.min(p.batt, s.batt + 1); }",
   "  while (s.regenT >= p.regen) { s.regenT -= p.regen; if (!(d.id === 'wraith' && s.cloak)) s.batt = Math.min(p.batt, s.batt + 1); }\n  // cloak drains battery; when it runs dry the ship drops out of the shadow\n  if (s.cloak && p.cloakDrain) {\n    s.drainT = (s.drainT || 0) + p.cloakDrain * dt;\n    while (s.drainT >= 1) { s.drainT -= 1; s.batt = Math.max(0, s.batt - 1); }\n    if (s.batt <= 0) { s.cloak = false; s.ambush = p.ambushT || 0; }\n  }"],
  // AI: do not waste shots on an immune target
  ["  if (id === 'wraith') st.fire = st.fire && dist < frange;",
   "  if (id === 'wraith') st.fire = st.fire && dist < frange;\n  if (eAlive && e.cloak) st.fire = false;   // no point shooting at a cloaked (immune) target"],
]);

patch('app/starship/CHANGELOG.md', [
  ["\n## 2.1.0", "\n## 2.2.0\n- Wraith cloak rework: while cloaked the ship is immune to all weapons (shots pass through; Blink laser, Siren song,\n  fighters and Sting glory do nothing); the planet still hurts.\n- Cloak drains battery (`cloakDrain`, default 1.5/s); at zero battery the ship drops out of the shadow.\n- Ambush: for `ambushT` s (default 0.8) after leaving the shadow the flamer deals `ambushMul` x damage (default 2).\n- AI does not fire at a cloaked target.\n\n## 2.1.0"],
]);
