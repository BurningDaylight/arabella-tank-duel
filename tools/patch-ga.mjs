#!/usr/bin/env node
// Google Analytics hooks: Star Melee and Blue & Grey. Other games get theirs once their entry points are confirmed.
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

patch('app/starship-duel.html', [
  ['<script src="starship/engine.js"></script>', '<script src="analytics.js" data-game="star-melee"></script>\n<script src="starship/engine.js"></script>'],
  ["function startMatch(){",
   "// analytics: game-specific events (GA.EVENT / GA.RESULT come from analytics.js)\nconst MELEE_EVENT = window.GA ? GA.defineEvents({SHIP_PICK:'melee_ship_pick'}) : {};\nfunction startMatch(){\n  if (window.GA) GA.start({mode:cfg.mode, difficulty:cfg.diff, pilot:cfg.pilot, budget:cfg.budget, fleet:cfg.fleet, engine:E.VERSION});"],
  ["function endMatch(winner){\n  state = 'over';",
   "function endMatch(winner){\n  state = 'over';\n  if (window.GA) GA.end(cfg.mode === 'pvp' ? GA.RESULT.PVP : !winner ? GA.RESULT.DRAW : winner.ai ? GA.RESULT.LOSE : GA.RESULT.WIN,\n    {winner:winner ? winner.label : '', kills:sides[0].kills + ':' + sides[1].kills});"],
  ["function deploy(sd, ti){\n  sd.used.push(ti);",
   "function deploy(sd, ti){\n  sd.used.push(ti);\n  if (window.GA && !sd.ai) GA.event(MELEE_EVENT.SHIP_PICK, {ship:SHIPS[ti].id});"],
]);

patch('app/tactical-duel.html', [
  ['<body>\n<div id="err"></div>', '<body>\n<script src="analytics.js" data-game="blue-grey" data-version="1.0"></script>\n<div id="err"></div>'],
  ["  buildTouch(); sfx('bugle');\n}",
   "  buildTouch(); sfx('bugle');\n  if (window.GA) GA.start({mode:cfg.mode, difficulty:cfg.diff, cannons:+cfg.cannons, corps:+cfg.corps, men:+cfg.men, cav:+cfg.cav});\n}"],
  ["function showOver(){\n  state = 'over';",
   "function showOver(){\n  state = 'over';\n  if (window.GA) GA.end(cfg.mode === 'pvp' ? GA.RESULT.PVP : winner < 0 ? GA.RESULT.DRAW : winner === 0 ? GA.RESULT.WIN : GA.RESULT.LOSE);"],
]);
