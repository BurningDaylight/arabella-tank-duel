#!/usr/bin/env node
// Google Analytics hooks for Tank Duel, Chopper Duel, Mud Cup (car-duel) and Warlords (realm-duel);
// analytics.js: GA.RESULT.SPECTATE and GA.start(params, {leaveIsQuit:false}) for long campaigns with saves.
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
const inc = game => ['<div id="err"></div>', '<div id="err"></div>\n<script src="analytics.js" data-game="' + game + '"></script>'];

patch('app/analytics.js', [
  ["var RESULT = Object.freeze({WIN:'win', LOSE:'lose', DRAW:'draw', PVP:'pvp', QUIT:'quit'});",
   "var RESULT = Object.freeze({WIN:'win', LOSE:'lose', DRAW:'draw', PVP:'pvp', QUIT:'quit', SPECTATE:'spectate'});   // spectate: robots only"],
  ["    start: function (params) {\n      if (level) GA.end(RESULT.QUIT, {reason:'restart'});\n      level = {t0:Date.now(), params:params || {}};",
   "    // opts.leaveIsQuit = false: closing the tab is not a quit (long campaigns with saves)\n    start: function (params, opts) {\n      if (level) GA.end(RESULT.QUIT, {reason:'restart'});\n      level = {t0:Date.now(), params:params || {}, leaveIsQuit:!(opts && opts.leaveIsQuit === false)};"],
  ["if (level) GA.end(RESULT.QUIT, {reason:'leave', transport_type:'beacon'});", "if (level && level.leaveIsQuit) GA.end(RESULT.QUIT, {reason:'leave', transport_type:'beacon'});"],
]);

patch('app/tank-duel.html', [
  inc('tank-duel'),
  ["function newGame(){\n  players = cfg.players.map((p, i) => ({",
   "// analytics: a level is one round (rounds go on until the player leaves); game start is its own event\nconst TANK_EVENT = window.GA ? GA.defineEvents({GAME_START:'tank_game_start'}) : {};\nfunction newGame(){\n  players = cfg.players.map((p, i) => ({"],
  ["  round = 0;\n  $('menu').classList.remove('show');\n  startRound();",
   "  round = 0;\n  $('menu').classList.remove('show');\n  if (window.GA) GA.event(TANK_EVENT.GAME_START, {players:players.length, humans:players.filter(p => !p.ai).length});\n  startRound();"],
  ["  turn = (round - 1) % tanks.length;\n  startTurn();",
   "  turn = (round - 1) % tanks.length;\n  if (window.GA) GA.start({round:round, players:tanks.length, humans:players.filter(p => !p.ai).length});\n  startTurn();"],
  ["  if (winner && !skipped) winner.p.wins++;\n  const humans = players.filter(p => !p.ai).length;",
   "  if (winner && !skipped) winner.p.wins++;\n  const humans = players.filter(p => !p.ai).length;\n  if (window.GA) GA.end(skipped ? GA.RESULT.QUIT : !humans ? GA.RESULT.SPECTATE : !winner ? GA.RESULT.DRAW\n      : humans > 1 ? GA.RESULT.PVP : winner.ai ? GA.RESULT.LOSE : GA.RESULT.WIN,\n    {round:round, reason:skipped ? 'skip' : undefined, winner_type:winner ? (winner.ai ? 'ai' : 'human') : undefined});"],
]);

patch('app/chopper-duel.html', [
  inc('chopper-duel'),
  ["  pushMsg(`Арена: ${arenaName}`, '#fff', 2);",
   "  pushMsg(`Арена: ${arenaName}`, '#fff', 2);\n  if (window.GA) GA.start({mode:cfg.mode, difficulty:cfg.diff, arena:arenaName});"],
  ["function showOver(){\n  state = 'over';\n  const [a, b] = helis;",
   "function showOver(){\n  state = 'over';\n  const [a, b] = helis;\n  if (window.GA) GA.end(cfg.mode === 'pvp' ? GA.RESULT.PVP : winner.ai ? GA.RESULT.LOSE : GA.RESULT.WIN, {kills:a.kills + ':' + b.kills});"],
]);

patch('app/car-duel.html', [
  inc('car-duel'),
  ["function newSeason(){",
   "// analytics: a level is one race (champ) or one duel; the championship has its own start/end events\nconst CAR_EVENT = window.GA ? GA.defineEvents({CHAMP_START:'car_champ_start', CHAMP_END:'car_champ_end'}) : {};\nfunction newSeason(){"],
  ["  season = {tracks:Array.from({length:n}, (_, i) => trackSeed(i)), cur:0, drivers, laps:+cfg.laps};",
   "  season = {tracks:Array.from({length:n}, (_, i) => trackSeed(i)), cur:0, drivers, laps:+cfg.laps};\n  if (window.GA) GA.event(CAR_EVENT.CHAMP_START, {races:n, humans:humans, difficulty:cfg.diff, laps:+cfg.laps});"],
  ["  race = {mode:'champ', track:tr, cars, state:'countdown', t:3.2, finishCount:0, pick:[], pickT:rnd(3, 6), endT:0, lastBeep:4};",
   "  race = {mode:'champ', track:tr, cars, state:'countdown', t:3.2, finishCount:0, pick:[], pickT:rnd(3, 6), endT:0, lastBeep:4};\n  if (window.GA) GA.start({mode:'champ', track:tr.name, race:i + 1, races:season.tracks.length, humans:+cfg.humans, difficulty:cfg.diff});"],
  ["  r.state = 'done';\n  const ord = order();",
   "  r.state = 'done';\n  const ord = order();\n  if (window.GA) { const hp = ord.map((c, k) => c.d.human ? k + 1 : 0).filter(Boolean);\n    GA.end(hp.length > 1 ? GA.RESULT.PVP : hp[0] === 1 ? GA.RESULT.WIN : GA.RESULT.LOSE, {place:hp.join(',')}); }"],
  ["  const champ = st[0];",
   "  const champ = st[0];\n  if (window.GA) GA.event(CAR_EVENT.CHAMP_END, {place:st.map((d, k) => d.human ? k + 1 : 0).filter(Boolean).join(','), champion:champ.human ? 'human' : 'ai'});"],
  ["  race = {mode:'duel', track:tr, cars, state:'countdown', t:3.2, pick:[], pickT:rnd(3, 6), score:[0, 0], freeze:0, lastBeep:4};",
   "  race = {mode:'duel', track:tr, cars, state:'countdown', t:3.2, pick:[], pickT:rnd(3, 6), score:[0, 0], freeze:0, lastBeep:4};\n  if (window.GA) GA.start({mode:'duel', track:tr.name, humans:two ? 2 : 1, difficulty:cfg.diff});"],
  ["function showDuelEnd(w){",
   "function showDuelEnd(w){\n  if (window.GA) GA.end(race.cars.every(c => c.human) ? GA.RESULT.PVP : w.human ? GA.RESULT.WIN : GA.RESULT.LOSE, {score:race.score[0] + ':' + race.score[1]});"],
]);

patch('app/realm-duel.html', [
  inc('realm-duel'),
  ["function gameOver(winner, lost){",
   "// analytics: a level is the whole campaign; loading a save starts it again (loaded:true); leaving the tab is not a quit\nconst REALM_EVENT = window.GA ? GA.defineEvents({CITY_CAPTURED:'realm_city_captured', GAME_LOAD:'realm_game_load'}) : {};\nfunction gameOver(winner, lost){"],
  ["  S.over = true; driver = null; mover = null;",
   "  S.over = true; driver = null; mover = null;\n  if (window.GA) { const humans = S.factions.filter(f => f.human).length;\n    GA.end(lost ? GA.RESULT.LOSE : !winner ? GA.RESULT.DRAW : !humans ? GA.RESULT.SPECTATE : !winner.human ? GA.RESULT.LOSE\n      : humans > 1 ? GA.RESULT.PVP : GA.RESULT.WIN, {turn:S.turn}); }"],
  ["  closeMenu();\n  beginTurn();\n}",
   "  closeMenu();\n  if (window.GA) GA.start({players:nf, humans:S.factions.filter(f => f.human).length, size:cfg.size, difficulty:cfg.diff, fog:cfg.fog}, {leaveIsQuit:false});\n  beginTurn();\n}"],
  ["  S = o; buildCityGrid(); renderTerrain();",
   "  S = o; buildCityGrid(); renderTerrain();\n  if (window.GA) { GA.event(REALM_EVENT.GAME_LOAD, {turn:S.turn});\n    GA.start({loaded:true, turn:S.turn, players:S.factions.length, humans:S.factions.filter(f => f.human).length}, {leaveIsQuit:false}); }"],
  ["    c.owner = s.owner; c.prod = null; c.progress = 0;",
   "    c.owner = s.owner; c.prod = null; c.progress = 0;\n    if (window.GA && S.factions[s.owner].human) GA.event(REALM_EVENT.CITY_CAPTURED, {turn:S.turn, cities:S.cities.filter(q => q.owner === s.owner).length});"],
]);
