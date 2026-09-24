#!/usr/bin/env node
// Стенд «Звёздной схватки»: матчи 1 на 1 каждый-с-каждым, ИИ против ИИ.
//   node tools/melee-bench/bench.mjs [--n 1000] [--ini набор.ini] [--compare prev] [--note "текст"]
// Прогон сохраняется в tools/melee-bench/runs/<дата>_e<версия>_<набор>/, ссылка runs/latest — на последний,
// история — runs/index.csv. В results.json — версия движка, хеш, коммит, INI и итоговые параметры кораблей.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus, hostname } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, symlinkSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const RUNS = join(HERE, 'runs');
const ENGINE = resolve(ROOT, 'app/starship/engine.js');
const E = require(ENGINE);
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 12);

function runMatch(i, j, seed, opt){
  const W = E.createWorld({seed, phys:opt.phys, ships:opt.ships, planet:opt.planet, diff:[opt.diff, opt.diff]});
  const A = seed & 1, B = 1 - A;                       // стороны чередуются
  if (seed & 2) { E.spawn(W, A, i); E.spawn(W, B, j); } else { E.spawn(W, B, j); E.spawn(W, A, i); }
  const sa = W.ships[A], sb = W.ships[B];              // честный старт: оба смотрят друг на друга
  sa.a = Math.atan2(E.wd(sb.y, sa.y), E.wd(sb.x, sa.x)); sb.a = Math.atan2(E.wd(sa.y, sb.y), E.wd(sa.x, sb.x));
  // attach per-side damage stats (engine >= 2.0.3; empty for older engines)
  const fin = r => Object.assign(r, {sa:(W.stats && W.stats[A]) || {}, sb:(W.stats && W.stats[B]) || {}});
  const steps = Math.round(opt.time / E.DT);
  for (let k = 0; k < steps; k++) {
    E.step(W, null); W.events.length = 0;
    const a = W.ships[A], b = W.ships[B];
    if (!a.alive || !b.alive) {
      if (!a.alive && !b.alive) return fin({w:-1, t:W.time, mutual:true});
      return fin(a.alive ? {w:0, t:W.time, crew:a.crew / a.p.crewMax} : {w:1, t:W.time, crew:b.crew / b.p.crewMax});
    }
  }
  return fin({w:-1, t:opt.time, timeout:true});
}
function seedOf(i, j, k, base){ return (((i + 1) * 73856093) ^ ((j + 1) * 19349663) ^ ((k + 1 + (base || 0) * 1000003) * 83492791)) >>> 0 || 1; }

if (!isMainThread) {
  const {jobs, opt} = workerData;
  for (const [i, j] of jobs) {
    const r = {i, j, wi:0, wj:0, draw:0, mutual:0, timeout:0, tSum:0, crewI:0, crewJ:0, si:{}, sj:{}};
    for (let k = 0; k < opt.n; k++) {
      const m = runMatch(i, j, seedOf(i, j, k, opt.seed), opt);
      r.tSum += m.t;
      for (const k in m.sa) r.si[k] = (r.si[k] || 0) + m.sa[k];
      for (const k in m.sb) r.sj[k] = (r.sj[k] || 0) + m.sb[k];
      if (m.w === 0) { r.wi++; r.crewI += m.crew; }
      else if (m.w === 1) { r.wj++; r.crewJ += m.crew; }
      else { r.draw++; if (m.timeout) r.timeout++; if (m.mutual) r.mutual++; }
    }
    parentPort.postMessage(r);
  }
  parentPort.postMessage({done:true});
} else main();

function parseArgs(){
  const a = {n:200, time:90, diff:'hard', ini:null, out:null, workers:Math.max(1, cpus().length - 1), planet:true, ships:null, seed:0, compare:null, note:''};
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    const k = v[i], nx = () => v[++i];
    if (k === '--n') a.n = +nx();
    else if (k === '--time') a.time = +nx();
    else if (k === '--diff') a.diff = nx();
    else if (k === '--ini') a.ini = nx();
    else if (k === '--out') a.out = resolve(nx());
    else if (k === '--workers') a.workers = +nx();
    else if (k === '--no-planet') a.planet = false;
    else if (k === '--ships') a.ships = nx().split(',');
    else if (k === '--seed') a.seed = +nx();
    else if (k === '--compare') a.compare = nx();
    else if (k === '--note') a.note = nx();
    else if (k === '-h' || k === '--help') {
      console.log('Опции: --n 200 --time 90 --diff easy|normal|hard --ini набор.ini --ships id1,id2 --no-planet --seed 0 --workers N --out папка --compare prev|latest|папка --note "текст"');
      console.log('Корабли: ' + E.SHIPS.map(d => d.id + ' (' + d.name + ')').join(', '));
      process.exit(0);
    }
  }
  return a;
}
function gitInfo(){
  const run = c => execSync(c, {cwd:ROOT, stdio:['ignore', 'pipe', 'ignore']}).toString().trim();
  try {
    const commit = run('git rev-parse --short HEAD');
    const files = run('git status --porcelain -- app/starship tools/melee-bench').split('\n').filter(Boolean)
      .map(l => l.slice(3)).filter(f => !f.includes('melee-bench/runs') && !f.includes('melee-bench/results'));
    return {commit, dirty:files.length > 0, dirtyFiles:files};
  } catch (_) { return {commit:null, dirty:null, dirtyFiles:[]}; }
}
function main(){
  const a = parseArgs();
  const opt = {n:a.n, time:a.time, diff:a.diff, phys:{}, ships:{}, planet:a.planet, seed:a.seed};
  let ini = null;
  if (a.ini) {
    let txt; try { txt = readFileSync(a.ini, 'utf8'); } catch (_) { console.error(`Нет файла настроек: ${a.ini}`); process.exit(1); }
    const r = E.parseIni(txt);
    opt.phys = r.phys; opt.ships = r.ships;
    if (r.game.planet) opt.planet = r.game.planet !== 'off';
    ini = {path:a.ini, file:basename(a.ini), sha:sha(txt), values:r.n, meta:r.meta || {}};
  }
  const meta = {engine:E.VERSION || '?', engineSha:sha(readFileSync(ENGINE)), git:gitInfo(), ini,
    node:process.version, host:hostname(), date:new Date().toISOString(), note:a.note,
    params:{phys:Object.assign({}, E.DEFAULT_PHYS, opt.phys), ships:Object.fromEntries(E.SHIPS.map(d => [d.id, E.effP(d, opt.ships)]))}};
  if (!a.out) {
    const st = meta.date.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const tag = (ini && ((ini.meta && ini.meta.version) || ini.file.replace(/\.[^.]+$/, ''))) || 'default';
    a.out = join(RUNS, `${st}_e${meta.engine}_${tag.replace(/[^\w.-]+/g, '_')}`);
  }
  console.log(`Движок v${meta.engine} (${meta.engineSha}) · git ${meta.git.commit || '—'}${meta.git.dirty ? ' + незакоммиченные правки: ' + meta.git.dirtyFiles.join(', ') : ''}`);
  if (ini) {
    console.log(`INI: ${ini.path}${ini.meta.version ? ' «' + ini.meta.version + '»' : ''} (${ini.sha}), значений: ${ini.values}`);
    if (ini.meta.engine && ini.meta.engine !== meta.engine) console.log(`  ⚠ INI выгружен из движка v${ini.meta.engine}, а считаем на v${meta.engine}`);
  }
  let ids = E.SHIPS.map((_, i) => i);
  if (a.ships) ids = a.ships.map(s => E.SHIPS.findIndex(d => d.id === s)).filter(i => i >= 0);
  const jobs = [];
  for (const i of ids) for (const j of ids) if (i <= j) jobs.push([i, j]);
  const per = Math.max(1, a.workers), buckets = Array.from({length:per}, () => []);
  jobs.forEach((jb, k) => buckets[k % per].push(jb));
  const total = jobs.length; let got = 0, alive = 0; const res = [], t0 = Date.now();
  console.log(`Кораблей: ${ids.length}, пар: ${total}, матчей на пару: ${a.n}, потоков: ${per}, ИИ: ${a.diff}, лимит: ${a.time} с, сиды: серия ${a.seed}`);
  for (const b of buckets) {
    if (!b.length) continue;
    alive++;
    const w = new Worker(fileURLToPath(import.meta.url), {workerData:{jobs:b, opt}});
    w.on('message', m => {
      if (m.done) { if (--alive === 0) finish(a, ids, res, t0, meta); return; }
      res.push(m); got++;
      process.stdout.write(`\r  пар готово: ${got}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
    });
    w.on('error', e => { console.error('\nОшибка потока:', e); process.exit(1); });
  }
}
function finish(a, ids, res, t0, meta){
  const secs = (Date.now() - t0) / 1000;
  console.log(`\nГотово за ${secs.toFixed(1)} с\n`);
  const n = a.n, name = i => E.SHIPS[i].name, M = {};
  const cell = (i, j) => M[i + ',' + j];
  const per = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, v / n]));
  for (const r of res) {
    const base = {draw:r.draw / n, mutual:r.mutual / n, timeout:r.timeout / n, t:r.tSum / n};
    M[r.i + ',' + r.j] = Object.assign({win:r.wi / n, lose:r.wj / n, crew:r.wi ? r.crewI / r.wi : 0, dmg:per(r.si)}, base);
    if (r.i !== r.j) M[r.j + ',' + r.i] = Object.assign({win:r.wj / n, lose:r.wi / n, crew:r.wj ? r.crewJ / r.wj : 0, dmg:per(r.sj)}, base);
  }
  const score = i => { const o = ids.filter(j => j !== i); if (!o.length) return 0.5; return o.reduce((s, j) => s + cell(i, j).win + cell(i, j).draw * 0.5, 0) / o.length; };
  const rank = ids.slice().sort((x, y) => score(y) - score(x));
  const pad = (s, w) => (s + ' '.repeat(w)).slice(0, w);
  console.log('Процент побед строки над столбцом (ничьи отдельно):\n');
  console.log(pad('', 11) + ids.map(j => pad(name(j).slice(0, 7), 8)).join(''));
  for (const i of ids) console.log(pad(name(i), 11) + ids.map(j => pad((cell(i, j).win * 100).toFixed(0) + '%', 8)).join(''));
  // per-ship summary over non-mirror opponents: timeouts, fight length, damage per match by source
  const KINDS = ['fire', 'spec', 'fighter', 'planet', 'steal'];
  const shipStat = i => {
    const o = ids.filter(j => j !== i), s = {to:0, t:0, fire:0, spec:0, fighter:0, planet:0, steal:0};
    for (const j of o) { const c = cell(i, j); s.to += c.timeout; s.t += c.t; for (const k of KINDS) s[k] += (c.dmg && c.dmg[k]) || 0; }
    for (const k in s) s[k] /= Math.max(1, o.length);
    return s;
  };
  console.log('\nРейтинг (ничья = пол-победы), таймауты, длина боя и урон за бой по источникам:');
  console.log('     ' + pad('корабль', 11) + pad('рейтинг', 9) + pad('таймаут', 9) + pad('бой,с', 7) + pad('оружие', 8) + pad('спец', 7) + pad('истреб', 8) + pad('планета', 9) + 'украл');
  rank.forEach((i, k) => {
    const s = shipStat(i), f = v => v.toFixed(1);
    console.log(`  ${pad(k + 1 + '.', 3)}${pad(name(i), 11)}${pad((score(i) * 100).toFixed(1) + '%', 9)}${pad((s.to * 100).toFixed(0) + '%' + (s.to > 0.2 ? ' ⚠' : ''), 9)}${pad(f(s.t), 7)}${pad(f(s.fire), 8)}${pad(f(s.spec), 7)}${pad(f(s.fighter), 8)}${pad(f(s.planet), 9)}${f(s.steal)}`);
  });
  const stuck = rank.filter(i => shipStat(i).to > 0.2).map(name);
  if (stuck.length) console.log(`  ⚠ много таймаутов (>20%): ${stuck.join(', ')} — скорее всего, ИИ не может сблизиться или достать, а не баланс`);
  let mw = 0, mwName = '';
  for (const i of ids) { const c = cell(i, i); if (c && Math.abs(c.win - c.lose) > mw) { mw = Math.abs(c.win - c.lose); mwName = name(i); } }
  console.log(`\nПроверка зеркал: макс. перекос сторон — ${(mw * 100).toFixed(0)}%${mwName ? ' (' + mwName + ')' : ''}`);

  mkdirSync(a.out, {recursive:true});
  const args = {n:a.n, time:a.time, diff:a.diff, ini:a.ini, planet:a.planet, seed:a.seed, ships:a.ships, workers:a.workers};
  const data = {meta, date:meta.date, args, seconds:secs, ships:ids.map(i => ({i, id:E.SHIPS[i].id, name:name(i), score:score(i), stat:shipStat(i)})), matrix:M};
  writeFileSync(join(a.out, 'results.json'), JSON.stringify(data, null, 1));
  const csv = ['A,B,win,lose,draw,mutual,timeout,avg_time,avg_crew_left'];
  for (const i of ids) for (const j of ids) { const c = cell(i, j); csv.push([E.SHIPS[i].id, E.SHIPS[j].id, c.win.toFixed(3), c.lose.toFixed(3), c.draw.toFixed(3), c.mutual.toFixed(3), c.timeout.toFixed(3), c.t.toFixed(1), c.crew.toFixed(2)].join(',')); }
  writeFileSync(join(a.out, 'results.csv'), csv.join('\n') + '\n');
  writeFileSync(join(a.out, 'report.html'), reportHTML(data, ids, cell, score));

  if (resolve(dirname(a.out)) === resolve(RUNS)) {
    const idx = join(RUNS, 'index.csv');
    if (!existsSync(idx)) writeFileSync(idx, 'run,date,engine,engine_sha,commit,dirty,ini,ini_version,ini_sha,n,diff,seed,note,top3\n');
    const q = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
    const top3 = rank.slice(0, 3).map(i => `${E.SHIPS[i].id}:${(score(i) * 100).toFixed(0)}`).join(' ');
    appendFileSync(idx, [basename(a.out), meta.date, meta.engine, meta.engineSha, meta.git.commit || '', meta.git.dirty ? 1 : 0,
      meta.ini ? meta.ini.file : '', meta.ini && meta.ini.meta.version || '', meta.ini ? meta.ini.sha : '', a.n, a.diff, a.seed, q(a.note), q(top3)].join(',') + '\n');
    try { rmSync(join(RUNS, 'latest'), {force:true}); symlinkSync(basename(a.out), join(RUNS, 'latest')); } catch (_) {}
  }
  console.log(`\nПрогон: ${a.out}`);
  if (a.compare) import('./compare.mjs').then(m => m.compareDirs(a.compare, a.out)).catch(e => console.error(e.message));
}
function reportHTML(data, ids, cell, score){
  const m = data.meta, name = i => E.SHIPS[i].name;
  const col = v => `hsl(${Math.round(v * 120)},55%,${22 + Math.abs(v - 0.5) * 30}%)`;
  let rows = '';
  for (const i of ids) {
    rows += `<tr><th>${name(i)}</th>`;
    for (const j of ids) { const c = cell(i, j); rows += `<td style="background:${col(c.win + c.draw * 0.5)}" title="победы ${(c.win * 100).toFixed(1)}%, ничьи ${(c.draw * 100).toFixed(1)}% (взаимные ${(c.mutual * 100).toFixed(1)}%), среднее время ${c.t.toFixed(1)} с">${(c.win * 100).toFixed(0)}<small>${c.draw > 0.005 ? ' / ' + (c.draw * 100).toFixed(0) : ''}</small></td>`; }
    rows += `<td class="sc">${(score(i) * 100).toFixed(1)}%</td></tr>`;
  }
  const iniTxt = m.ini ? `${m.ini.file}${m.ini.meta.version ? ' «' + m.ini.meta.version + '»' : ''} (${m.ini.sha})${m.ini.meta.note ? ' — ' + m.ini.meta.note : ''}` : 'по умолчанию';
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Стенд: Звёздная схватка</title>
<style>body{background:#0c0c18;color:#ddd;font-family:monospace;padding:20px}table{border-collapse:collapse}td,th{padding:6px 8px;border:1px solid #334;text-align:center}
th{color:#8cf}td small{color:#ccc}.sc{color:#fc6;font-weight:bold}.m{color:#9ab;line-height:1.6}</style></head><body>
<h2>Звёздная схватка — стенд</h2>
<p class="m">${data.date} · движок v${m.engine} (${m.engineSha}) · git ${m.git.commit || '—'}${m.git.dirty ? ' + правки' : ''}<br>
INI: ${iniTxt}<br>матчей на пару: ${data.args.n} · ИИ: ${data.args.diff} · лимит: ${data.args.time} с · сиды: серия ${data.args.seed}${m.note ? '<br>заметка: ' + m.note : ''}</p>
<p>Ячейка — % побед строки над столбцом (после «/» — % ничьих). Наведите на ячейку для подробностей.</p>
<table><tr><th></th>${ids.map(j => `<th>${name(j)}</th>`).join('')}<th>Рейтинг</th></tr>${rows}</table></body></html>`;
}
