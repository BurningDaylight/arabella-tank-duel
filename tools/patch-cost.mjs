#!/usr/bin/env node
// Engine 2.5.0: ship cost (fleet points) as a regular ship param; game: fleet by budget with a fleet builder;
// sheet shows cost. Costs do not affect combat: bench runs must stay identical.
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

// provisional costs; tools/melee-bench/costs.mjs computes fair ones from a bench run
const COSTS = [
  ['p:{crew:18, crewMax:18, batt:18,', 14], ['p:{crew:42, crewMax:42, batt:42,', 22], ['p:{crew:20, crewMax:20, batt:14,', 18],
  ['p:{crew:22, crewMax:22, batt:16,', 16], ['p:{crew:6, crewMax:6, batt:20,', 16], ['p:{crew:6, crewMax:6, batt:4,', 6],
  ['p:{crew:12, crewMax:42, batt:16,', 15], ['p:{crew:8, crewMax:8, batt:12,', 15],
];

patch('app/starship/engine.js', [
  ["const VERSION = '2.4.0';", "const VERSION = '2.5.0';"],
  ["const LABELS = {\n  crew:'Экипаж на старте',", "const LABELS = {\n  cost:'Цена во флоте, очков', crew:'Экипаж на старте',"],
  ["const RANGES = {\n  crew:[1,99,1],", "const RANGES = {\n  cost:[1,99,1], crew:[1,99,1],"],
  ["const COMMON = ['crew','crewMax','batt','regen','turn','thrust','vmax','mass'];", "const COMMON = ['cost','crew','crewMax','batt','regen','turn','thrust','vmax','mass'];"],
  ...COSTS.map(([from, c]) => [from, from.replace('p:{', 'p:{cost:' + c + ', ')]),
]);

patch('app/starship/CHANGELOG.md', [
  ["\n## 2.4.0", "\n## 2.5.0\n- Ship `cost` (fleet points) as a regular ship param (editor, INI). No effect on combat.\n  Provisional defaults; fair costs come from `tools/melee-bench/costs.mjs`.\n\n## 2.4.0"],
]);

patch('tools/melee-bench/sheet.mjs', [
  ["const COLS = [['crew', 'экип'],", "const COLS = [['cost', 'цена'], ['crew', 'экип'],"],
  ["  const r = {crew:p.crew, speed:p.vmax};", "  const r = {cost:p.cost, crew:p.crew, speed:p.vmax};"],
]);

const BUILDER = String.raw`// ================= FLEET BUILDER (budget mode) =================
// With «Флот по очкам» every side gets a fleet within the budget: robots a random one, humans build theirs
// (starting from a random proposal). Costs are ship params (cost), editable in the ship editor and INI.
let buildQueue = [];
const shipCost = t => effP(SHIPS[t]).cost || 10;
function budgetFleet(B){
  const idx = SHIPS.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = irnd(0, i), x = idx[i]; idx[i] = idx[j]; idx[j] = x; }
  const out = []; let sum = 0;
  for (const t of idx) { const c = shipCost(t); if (sum + c <= B) { out.push(t); sum += c; } }
  if (!out.length) { let best = 0; for (let t = 1; t < SHIPS.length; t++) if (shipCost(t) < shipCost(best)) best = t; out.push(best); }
  return out.sort((a, b) => a - b);
}
function showBuilder(){
  const sd = sides[buildQueue[0]], B = +cfg.budget, sel = new Set(sd.fleet), g = $('pickGrid');
  const draw = () => {
    const used = Array.from(sel).reduce((s, t) => s + shipCost(t), 0);
    $('pickTitle').textContent = sd.label + ': соберите флот — ' + used + ' из ' + B + ' очков';
    $('pickTitle').style.color = sd.color;
    g.textContent = '';
    for (let ti = 0; ti < SHIPS.length; ti++) {
      const d = SHIPS[ti], p = effP(d), on = sel.has(ti), fits = on || used + shipCost(ti) <= B;
      const b = document.createElement('button'); b.className = 'pcard' + (on ? ' on' : '') + (fits ? '' : ' dis');
      const cv = document.createElement('canvas'); cv.width = 180; cv.height = 110; cv.style.width = '90px'; cv.style.height = '55px';
      const c = cv.getContext('2d'); c.scale(2, 2); c.translate(45, 27); c.rotate(-0.3); drawShipAt(c, d, sd.color, 8 + d.r * 0.6, false);
      const nm = document.createElement('b'); nm.innerHTML = d.name + ' <em>— ' + d.role + ' · ' + shipCost(ti) + ' очк.</em>';
      const st = document.createElement('i'); st.textContent = statLine(p);
      const info = document.createElement('div'); info.className = 'sinfo'; info.innerHTML = infoHTML(d, p);
      b.append(cv, nm, st, info);
      b.addEventListener('click', () => { if (on) sel.delete(ti); else if (fits) sel.add(ti); draw(); });
      g.appendChild(b);
    }
    const row = document.createElement('div'); row.className = 'bld'; row.style.gridColumn = '1 / -1';
    const again = document.createElement('button'); again.className = 'small'; again.textContent = 'Случайный флот';
    again.addEventListener('click', () => { sel.clear(); for (const t of budgetFleet(B)) sel.add(t); draw(); });
    const ok = document.createElement('button'); ok.className = 'small'; ok.textContent = 'Готово'; ok.disabled = !sel.size;
    ok.addEventListener('click', () => {
      sd.fleet = Array.from(sel).sort((a, b) => a - b); buildQueue.shift();
      if (buildQueue.length) { showBuilder(); return; }
      $('pick').classList.remove('show'); state = 'pick'; pickQueue = [0, 1]; nextPick();
    });
    row.append(again, ok); g.appendChild(row);
  };
  draw();
  $('pick').classList.add('show'); $('touch').innerHTML = '';
}

`;

patch('app/starship-duel.html', [
  ["  {k:'fleet', label:'Кораблей во флоте', opts:[['3','3'],['5','5'],['8','Все 8']]},",
   "  {k:'fleet', label:'Кораблей во флоте', opts:[['3','3'],['5','5'],['8','Все 8']]},\n  {k:'budget', label:'Флот по очкам', opts:[['off','Нет (по числу)'],['60','60'],['90','90'],['120','120']]},"],
  ["pilot:'rule', fleet:'5',", "pilot:'rule', fleet:'5', budget:'off',"],
  ["fleet:pickFleet(+cfg.fleet),", "fleet:cfg.budget !== 'off' ? budgetFleet(+cfg.budget) : pickFleet(+cfg.fleet),"],
  ["  state = 'pick'; pickQueue = [0, 1];\n  nextPick();",
   "  if (cfg.budget !== 'off') {   // humans build their fleet first, robots keep the random one\n    buildQueue = sides.filter(sd => !sd.ai).map(sd => sd.i);\n    if (buildQueue.length) { state = 'build'; showBuilder(); return; }\n  }\n  state = 'pick'; pickQueue = [0, 1];\n  nextPick();"],
  ["· Скорость ${p.vmax}`;", "· Скорость ${p.vmax}${p.cost ? ' · ' + p.cost + ' очк.' : ''}`;"],
  [".pcard .sinfo{margin-top:2px;font-size:11px}\n", ".pcard .sinfo{margin-top:2px;font-size:11px}\n.pcard.on{border-color:#fc6;background:#2a2818}\n.pcard.dis{opacity:.45}\n.bld{display:flex;gap:8px;justify-content:center;margin-top:10px}\n"],
  ["// ================= ВЫБОР КОРАБЛЯ =================", BUILDER + "// ================= ВЫБОР КОРАБЛЯ ================="],
]);
