#!/usr/bin/env node
// One-shot patch: watch mode in starship-duel.html (replay of a bench match by seed),
// bench stores replayable examples per pair. Engine is untouched (stays 2.0.3).
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

const CSS = String.raw`#watchBar{position:fixed;top:max(6px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:12;display:flex;gap:6px;align-items:center;
  flex-wrap:wrap;justify-content:center;background:rgba(0,0,20,.82);border:1px solid #446;border-radius:10px;padding:6px 10px;font-size:13px;max-width:96vw}
#watchBar button{font-size:15px;padding:3px 9px;touch-action:manipulation}
#watchBar .wl{color:#8cf}
#watchBar .wr{color:#fc6}
#wRes{flex-basis:100%;text-align:center}
#wRes.ok{color:#6d6}
#wRes.bad{color:#f66}
`;

const BAR = String.raw`<div id="watchBar" style="display:none">
  <span class="wl" id="wTitle"></span>
  <button id="wRestart" title="Сначала (R)">⏮</button>
  <button id="wPlay" title="Пауза / пуск (пробел)">⏸</button>
  <button id="wStep" title="Кадр вперёд (.)">⏭</button>
  <button id="wSlow" title="Медленнее ([)">−</button><span id="wSpeed">×1</span><button id="wFast" title="Быстрее (])">+</button>
  <span class="wr" id="wTime"></span>
  <button id="wIni" title="Выбрать INI вручную">📂</button>
  <button id="wExit" title="Выйти (Esc)">✕</button>
  <span id="wRes"></span>
</div>
<input type="file" id="wFile" accept=".ini,.txt,text/plain" style="display:none">
`;

const BLOCK = String.raw`// ================= WATCH MODE: replay of a bench match =================
// URL: starship-duel.html?watch&a=siren&b=bastion&seed=123&diff=hard&time=90&planet=1
//      &ini=../tools/melee-bench/balance/balance-v4.ini&ish=<ini sha, 12 hex>&ev=<engine version>&expect=a:23.456
// Rebuilds the world exactly like bench runMatch(): same options, side and spawn order from seed bits,
// both ships facing each other, both sides driven by the engine AI. Links come from tools/melee-bench/watch.mjs.
let WATCH = null;
const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4, 8];
function watchInit(){
  const q = new URLSearchParams(location.search);
  if (!q.has('watch')) return;
  const idx = v => SHIPS.findIndex(d => d.id === v || d.name.toLowerCase() === String(v || '').toLowerCase());
  const ia = idx(q.get('a') || 'bastion'), ib = idx(q.get('b') || 'leviathan');
  if (ia < 0 || ib < 0) { showErr('Режим зрителя: неизвестный корабль в a= или b='); return; }
  const seed = (Number(q.get('seed')) >>> 0) || ((Math.random() * 4294967296) >>> 0);
  WATCH = {ia:ia, ib:ib, seed:seed, diff:q.get('diff') || 'hard', time:Number(q.get('time')) || 90,
    planet:q.get('planet') !== '0', ini:q.get('ini'), ish:q.get('ish'), ev:q.get('ev'), expect:q.get('expect'),
    si:3, speed:1, paused:false, done:false, set:null, note:'', result:null};
  menuOpen = false; state = 'watch';
  $('menu').classList.remove('show'); $('menuBtn').style.display = 'none'; $('watchBar').style.display = 'flex';
  bindWatchBar(); watchInfo();
  if (!WATCH.ini) { WATCH.set = {meta:{}, game:{}, phys:{}, ships:{}}; watchStart(); return; }
  fetch(WATCH.ini).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(watchSetIni)
    .catch(() => { WATCH.note = 'INI не загрузился по ссылке — откройте страницу через сервер из корня репозитория или выберите файл кнопкой 📂'; watchInfo(); });
}
function watchSetIni(txt){
  WATCH.set = E.parseIni(txt);
  if (WATCH.ish && window.crypto && crypto.subtle && window.TextEncoder) {
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)).then(buf => {
      const h = Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 12);
      if (h !== WATCH.ish) { WATCH.note = 'INI изменился после прогона (' + h + ' вместо ' + WATCH.ish + ')'; watchInfo(); }
    }).catch(() => {});
  }
  watchStart();
}
function watchStart(){
  const S = WATCH.set, seed = WATCH.seed, A = seed & 1, B = 1 - A;
  W = E.createWorld({seed:seed, phys:S.phys, ships:S.ships, planet:WATCH.planet, diff:[WATCH.diff, WATCH.diff]});
  sides = [0, 1].map(i => ({i:i, ai:true, label:i === A ? 'A' : 'B', color:i === A ? '#3fa9ff' : '#ff5a4a', fleet:[], used:[], ship:null, kills:0}));
  if (seed & 2) { E.spawn(W, A, WATCH.ia); E.spawn(W, B, WATCH.ib); } else { E.spawn(W, B, WATCH.ib); E.spawn(W, A, WATCH.ia); }
  const sa = W.ships[A], sb = W.ships[B];
  sa.a = Math.atan2(wd(sb.y, sa.y), wd(sb.x, sa.x)); sb.a = Math.atan2(wd(sa.y, sb.y), wd(sa.x, sb.x));
  for (const s of W.ships) { s.captain = s.def.captains[0]; sides[s.side].ship = s; }
  WATCH.A = A; WATCH.steps = 0; WATCH.maxSteps = Math.round(WATCH.time / DT); WATCH.done = false; WATCH.result = null;
  particles = []; bubbles = []; msgs = []; time = 0; shake = 0;
  cam.x = sa.x + wd(sb.x, sa.x) / 2; cam.y = sa.y + wd(sb.y, sa.y) / 2;
  handleEvents(); watchInfo();
}
function watchTick(dt){
  if (!W || !WATCH.set) return;
  if (!WATCH.done) {
    E.step(W, null); WATCH.steps++; time += dt;
    for (const s of W.ships) if (s && s.alive && s.thr && s.def.id !== 'blink' && Math.random() < dt * 40)
      particles.push({type:'spark', x:s.x - Math.cos(s.a) * s.def.r, y:s.y - Math.sin(s.a) * s.def.r, vx:-Math.cos(s.a) * 80, vy:-Math.sin(s.a) * 80, life:0.3, max:0.3, col:'#fa4', size:2});
    for (const sh of W.shots) if ((sh.kind === 'nuke' || sh.kind === 'missile') && Math.random() < dt * 40)
      particles.push({type:'smoke', x:sh.x, y:sh.y, vx:0, vy:0, life:0.5, max:0.5, r:2, grow:6});
    const a = W.ships[WATCH.A], b = W.ships[1 - WATCH.A];
    if (!a.alive || !b.alive || WATCH.steps >= WATCH.maxSteps) {
      WATCH.done = true;
      WATCH.result = {w:a.alive && !b.alive ? 'a' : b.alive && !a.alive ? 'b' : a.alive ? 'timeout' : 'mutual', t:a.alive && b.alive ? WATCH.time : W.time};
      watchInfo();
    } else if (WATCH.steps % 12 === 0) watchInfo();
  }
  handleEvents(); updateCam(dt);
  if (shake > 0) shake *= Math.pow(0.02, dt);
}
function watchInfo(){
  if (!WATCH) return;
  const na = SHIPS[WATCH.ia].name, nb = SHIPS[WATCH.ib].name;
  const txt = r => r.w === 'a' ? 'победил A (' + na + ')' : r.w === 'b' ? 'победил B (' + nb + ')' : r.w === 'mutual' ? 'взаимное уничтожение' : 'таймаут';
  $('wTitle').textContent = 'A: ' + na + ' × B: ' + nb + ' · сид ' + WATCH.seed + ' · ИИ ' + WATCH.diff + (WATCH.ini ? ' · ' + WATCH.ini.split('/').pop() : '');
  $('wPlay').textContent = WATCH.paused ? '▶' : '⏸';
  $('wSpeed').textContent = WATCH.paused ? 'пауза' : '×' + SPEEDS[WATCH.si];
  $('wTime').textContent = W ? W.time.toFixed(1) + ' / ' + WATCH.time + ' с' : '';
  let res = '', cls = '';
  const exp = WATCH.expect ? {w:WATCH.expect.split(':')[0], t:Number(WATCH.expect.split(':')[1])} : null;
  if (WATCH.result) {
    res = txt(WATCH.result) + ' за ' + WATCH.result.t.toFixed(2) + ' с';
    if (exp) {
      const ok = exp.w === WATCH.result.w && Math.abs(exp.t - WATCH.result.t) < 0.01;
      cls = ok ? 'ok' : 'bad';
      res += ok ? ' ✓ как на стенде' : ' ✗ на стенде: ' + txt(exp) + ' за ' + exp.t.toFixed(2) + ' с';
    }
  } else if (exp) res = 'на стенде: ' + txt(exp) + ' за ' + exp.t.toFixed(2) + ' с';
  const warn = [];
  if (WATCH.ev && WATCH.ev !== E.VERSION) warn.push('прогон был на движке v' + WATCH.ev + ', сейчас v' + E.VERSION);
  if (WATCH.note) warn.push(WATCH.note);
  const el = $('wRes'); el.className = cls; el.textContent = res + (warn.length ? ' · ⚠ ' + warn.join('; ') : '');
}
function watchSpeed(){ WATCH.speed = WATCH.paused ? 0 : SPEEDS[WATCH.si]; watchInfo(); }
function bindWatchBar(){
  const on = (id, fn) => $(id).addEventListener('click', e => { e.currentTarget.blur(); fn(); });
  on('wRestart', () => { if (WATCH.set) watchStart(); });
  on('wPlay', () => { WATCH.paused = !WATCH.paused; watchSpeed(); });
  on('wStep', () => { if (!WATCH.paused) { WATCH.paused = true; watchSpeed(); } for (let k = 0; k < 6; k++) update(DT); watchInfo(); });
  on('wSlow', () => { WATCH.si = Math.max(0, WATCH.si - 1); watchSpeed(); });
  on('wFast', () => { WATCH.si = Math.min(SPEEDS.length - 1, WATCH.si + 1); watchSpeed(); });
  on('wIni', () => $('wFile').click());
  on('wExit', () => { location.href = location.pathname; });
  $('wFile').addEventListener('change', () => {
    const f = $('wFile').files && $('wFile').files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { WATCH.note = ''; watchSetIni(String(rd.result)); };
    rd.readAsText(f, 'utf-8'); $('wFile').value = '';
  });
}
function watchKey(e){
  const act = {Space:'wPlay', KeyR:'wRestart', Period:'wStep', BracketLeft:'wSlow', Minus:'wSlow', BracketRight:'wFast', Equal:'wFast', Escape:'wExit'}[e.code];
  if (!act) return false;
  e.preventDefault(); $(act).click(); return true;
}

`;

patch('app/starship-duel.html', [
  [".pcard .sinfo{margin-top:2px;font-size:11px}\n</style>", ".pcard .sinfo{margin-top:2px;font-size:11px}\n" + CSS + "</style>"],
  ['<div id="menu" class="overlay show">', BAR + '<div id="menu" class="overlay show">'],
  ["  if (menuOpen || !W || (state !== 'fight' && state !== 'inter')) return;",
   "  if (WATCH) { watchTick(dt); return; }   // watch mode: replay a bench match\n  if (menuOpen || !W || (state !== 'fight' && state !== 'inter')) return;"],
  ["    acc += el; let n = 0;", "    acc += el * (WATCH ? WATCH.speed : 1); let n = 0;"],
  ["window.addEventListener('keydown', e => {\n  const tg = e.target;", "window.addEventListener('keydown', e => {\n  if (WATCH && watchKey(e)) return;\n  const tg = e.target;"],
  ["// ================= ЗАПУСК =================", BLOCK + "// ================= ЗАПУСК ================="],
  ["fit();\nrequestAnimationFrame(frame);", "try { watchInit(); } catch (e) { showErr(e); }\nfit();\nrequestAnimationFrame(frame);"],
]);

patch('tools/melee-bench/bench.mjs', [
  ["si:{}, sj:{}};", "si:{}, sj:{}, ex:{i:[], j:[], mutual:[], timeout:[]}};"],
  ["      const m = runMatch(i, j, seedOf(i, j, k, opt.seed), opt);",
   "      const seed = seedOf(i, j, k, opt.seed), m = runMatch(i, j, seed, opt);\n      // keep a few replayable examples of every outcome for watch mode (watch.mjs)\n      const kind = m.w === 0 ? 'i' : m.w === 1 ? 'j' : m.timeout ? 'timeout' : 'mutual';\n      if (r.ex[kind].length < 5) r.ex[kind].push({seed, t:+m.t.toFixed(3)});"],
  ["  mkdirSync(a.out, {recursive:true});",
   "  // replayable examples per pair, keyed 'idI,idJ' with i <= j in ship order\n  const examples = Object.fromEntries(res.map(r => [E.SHIPS[r.i].id + ',' + E.SHIPS[r.j].id, r.ex || {}]));\n  mkdirSync(a.out, {recursive:true});"],
  ["matrix:M};", "matrix:M, examples};"],
  ["    if (r.game.planet) opt.planet = r.game.planet !== 'off';", "    if (r.game.planet) opt.planet = a.planet = r.game.planet !== 'off';"],
]);
