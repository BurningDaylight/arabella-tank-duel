#!/usr/bin/env node
// Game UI: range hints (dashed circles) around human-controlled ships: Siren song and magnet, Sting glory,
// Bastion point defence, Blink laser, Wraith flamer. Menu toggle «Подсказки дальности». Engine untouched.
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

const HINTS = String.raw`  // range hints for human-controlled ships (menu: «Подсказки дальности»); robots and watch mode get none
  if (W && cfg.hints !== 'off') for (const s of V.ships) {
    if (!s || !s.alive) continue;
    const sd = sides[s.side]; if (!sd || sd.ai) continue;
    const p = s.p, rings = [];   // [radius, ready, faint]
    if (s.def.id === 'siren') { rings.push([p.sRange, s.batt >= p.sCost]); if (p.magnetR) rings.push([p.magnetR, false, true]); }
    else if (s.def.id === 'sting') rings.push([p.gloryR, s.armed > 0]);
    else if (s.def.id === 'bastion') rings.push([p.sRange, s.batt >= p.sCost]);
    else if (s.def.id === 'blink') rings.push([p.fRange, s.batt >= p.fCost]);
    else if (s.def.id === 'wraith') rings.push([p.fSpd * p.fLife, s.batt >= p.fCost]);
    const [hx, hy] = S(s.x, s.y);
    for (const [r, ready, faint] of rings) {
      ctx.setLineDash([6, 6]); ctx.lineWidth = 1;
      ctx.strokeStyle = faint ? 'rgba(140,255,140,.3)' : ready ? sd.color : 'rgba(255,255,255,.22)';
      ctx.globalAlpha = faint || !ready ? 1 : 0.75;
      ctx.beginPath(); ctx.arc(hx, hy, r * z, 0, 6.283); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
`;

patch('app/starship-duel.html', [
  ["  {k:'sound', label:'Звук', opts:[['on','Вкл'],['off','Выкл']]},",
   "  {k:'hints', label:'Подсказки дальности', opts:[['on','Показывать'],['off','Скрыть']]},\n  {k:'sound', label:'Звук', opts:[['on','Вкл'],['off','Выкл']]},"],
  ["pilot:'rule', fleet:'5', planet:'on', sound:'on'};", "pilot:'rule', fleet:'5', planet:'on', hints:'on', sound:'on'};"],
  ["  for (const b of V.beams) {", HINTS + "  for (const b of V.beams) {"],
]);
