#!/usr/bin/env node
// Стенд «Звёздной схватки»: матчи 1 на 1 каждый-с-каждым, ИИ против ИИ.
// Примеры:
//   node tools/melee-bench/bench.mjs                    # 200 матчей на пару, «сложный» ИИ
//   node tools/melee-bench/bench.mjs --n 1000
//   node tools/melee-bench/bench.mjs --ini star-melee-settings.ini --n 500
//   node tools/melee-bench/bench.mjs --ships hare,blink,siren --n 1000
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const E = require(resolve(HERE, '../../app/starship/engine.js'));

function runMatch(i, j, seed, opt){
  const W = E.createWorld({seed, phys:opt.phys, ships:opt.ships, planet:opt.planet, diff:[opt.diff, opt.diff]});
  const A = seed & 1, B = 1 - A;               // корабль i — на стороне A (стороны чередуются)
  if (seed & 2) { E.spawn(W, A, i); E.spawn(W, B, j); } else { E.spawn(W, B, j); E.spawn(W, A, i); }
  const sa = W.ships[A], sb = W.ships[B];      // оба смотрят друг на друга — без форы тому, кто появился вторым
  sa.a = Math.atan2(E.wd(sb.y, sa.y), E.wd(sb.x, sa.x)); sb.a = Math.atan2(E.wd(sa.y, sb.y), E.wd(sa.x, sb.x));
  const steps = Math.round(opt.time / E.DT);
  for (let k = 0; k < steps; k++) {
    E.step(W, null); W.events.length = 0;
    const a = W.ships[A], b = W.ships[B];
    if (!a.alive || !b.alive) {
      if (!a.alive && !b.alive) return {w:-1, t:W.time};
      return a.alive ? {w:0, t:W.time, crew:a.crew / a.p.crewMax} : {w:1, t:W.time, crew:b.crew / b.p.crewMax};
    }
  }
  return {w:-1, t:opt.time, timeout:true};
}
function seedOf(i, j, k){ return (((i + 1) * 73856093) ^ ((j + 1) * 19349663) ^ ((k + 1) * 83492791)) >>> 0 || 1; }

if (!isMainThread) {
  const {jobs, opt} = workerData;
  for (const [i, j] of jobs) {
    const r = {i, j, wi:0, wj:0, draw:0, timeout:0, tSum:0, crewI:0, crewJ:0};
    for (let k = 0; k < opt.n; k++) {
      const m = runMatch(i, j, seedOf(i, j, k), opt);
      r.tSum += m.t;
      if (m.w === 0) { r.wi++; r.crewI += m.crew; } else if (m.w === 1) { r.wj++; r.crewJ += m.crew; } else { r.draw++; if (m.timeout) r.timeout++; }
    }
    parentPort.postMessage(r);
  }
  parentPort.postMessage({done:true});
} else main();

function parseArgs(){
  const a = {n:200, time:90, diff:'hard', ini:null, out:join(HERE, 'results'), workers:Math.max(1, cpus().length - 1), planet:true, ships:null};
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    const k = v[i], nx = () => v[++i];
    if (k === '--n') a.n = +nx();
    else if (k === '--time') a.time = +nx();
    else if (k === '--diff') a.diff = nx();
    else if (k === '--ini') a.ini = nx();
    else if (k === '--out') a.out = nx();
    else if (k === '--workers') a.workers = +nx();
    else if (k === '--no-planet') a.planet = false;
    else if (k === '--ships') a.ships = nx().split(',');
    else if (k === '-h' || k === '--help') {
      console.log('Опции: --n 200 --time 90 --diff easy|normal|hard --ini файл.ini --ships id1,id2 --no-planet --workers N --out папка');
      console.log('Корабли: ' + E.SHIPS.map(d => d.id + ' (' + d.name + ')').join(', '));
      process.exit(0);
    }
  }
  return a;
}
function main(){
  const a = parseArgs();
  const opt = {n:a.n, time:a.time, diff:a.diff, phys:{}, ships:{}, planet:a.planet};
  if (a.ini) {
    const r = E.parseIni(readFileSync(a.ini, 'utf8'));
    opt.phys = r.phys; opt.ships = r.ships;
    if (r.game.planet) opt.planet = r.game.planet !== 'off';
    console.log(`INI: ${a.ini}, значений: ${r.n}`);
  }
  let ids = E.SHIPS.map((_, i) => i);
  if (a.ships) ids = a.ships.map(s => E.SHIPS.findIndex(d => d.id === s)).filter(i => i >= 0);
  const jobs = [];
  for (const i of ids) for (const j of ids) if (i <= j) jobs.push([i, j]);
  const per = Math.max(1, a.workers), buckets = Array.from({length:per}, () => []);
  jobs.forEach((jb, k) => buckets[k % per].push(jb));
  const total = jobs.length; let got = 0, alive = 0; const res = [];
  const t0 = Date.now();
  console.log(`Кораблей: ${ids.length}, пар: ${total}, матчей на пару: ${a.n}, потоков: ${per}, ИИ: ${a.diff}, лимит: ${a.time} с`);
  for (const b of buckets) {
    if (!b.length) continue;
    alive++;
    const w = new Worker(fileURLToPath(import.meta.url), {workerData:{jobs:b, opt}});
    w.on('message', m => {
      if (m.done) { if (--alive === 0) finish(a, ids, res, t0); return; }
      res.push(m); got++;
      process.stdout.write(`\r  пар готово: ${got}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
    });
    w.on('error', e => { console.error('\nОшибка потока:', e); process.exit(1); });
  }
}
function finish(a, ids, res, t0){
  console.log(`\nГотово за ${((Date.now() - t0) / 1000).toFixed(1)} с\n`);
  const n = a.n, name = i => E.SHIPS[i].name, M = {};
  const cell = (i, j) => M[i + ',' + j];
  for (const r of res) {
    M[r.i + ',' + r.j] = {win:r.wi / n, lose:r.wj / n, draw:r.draw / n, timeout:r.timeout / n, t:r.tSum / n, crew:r.wi ? r.crewI / r.wi : 0};
    if (r.i !== r.j) M[r.j + ',' + r.i] = {win:r.wj / n, lose:r.wi / n, draw:r.draw / n, timeout:r.timeout / n, t:r.tSum / n, crew:r.wj ? r.crewJ / r.wj : 0};
  }
  const score = i => { const o = ids.filter(j => j !== i); if (!o.length) return 0.5; return o.reduce((s, j) => s + cell(i, j).win + cell(i, j).draw * 0.5, 0) / o.length; };
  const rank = ids.slice().sort((x, y) => score(y) - score(x));
  const pad = (s, w) => (s + ' '.repeat(w)).slice(0, w);
  console.log('Процент побед строки над столбцом (ничьи отдельно):\n');
  console.log(pad('', 11) + ids.map(j => pad(name(j).slice(0, 7), 8)).join(''));
  for (const i of ids) console.log(pad(name(i), 11) + ids.map(j => pad((cell(i, j).win * 100).toFixed(0) + '%', 8)).join(''));
  console.log('\nРейтинг (средний % побед, ничья = пол-победы):');
  rank.forEach((i, k) => console.log(`  ${k + 1}. ${pad(name(i), 10)} ${(score(i) * 100).toFixed(1)}%`));
  const hot = [];
  for (const i of ids) for (const j of ids) if (i !== j && cell(i, j).win >= 0.7) hot.push(`${name(i)} > ${name(j)}: ${(cell(i, j).win * 100).toFixed(0)}%`);
  if (hot.length) console.log('\nПерекосы (≥70%):\n  ' + hot.join('\n  '));
  const mir = ids.map(i => cell(i, i)).filter(Boolean).map(c => Math.abs(c.win - c.lose)).reduce((s, v) => Math.max(s, v), 0);
  console.log(`\nПроверка зеркал: макс. перекос сторон в A против A — ${(mir * 100).toFixed(0)}% (должно быть небольшим)`);
  mkdirSync(a.out, {recursive:true});
  const data = {date:new Date().toISOString(), args:a, ships:ids.map(i => ({i, id:E.SHIPS[i].id, name:name(i), score:score(i)})), matrix:M};
  writeFileSync(join(a.out, 'results.json'), JSON.stringify(data, null, 1));
  const csv = ['A,B,win,lose,draw,timeout,avg_time,avg_crew_left'];
  for (const i of ids) for (const j of ids) { const c = cell(i, j); csv.push([E.SHIPS[i].id, E.SHIPS[j].id, c.win.toFixed(3), c.lose.toFixed(3), c.draw.toFixed(3), c.timeout.toFixed(3), c.t.toFixed(1), c.crew.toFixed(2)].join(',')); }
  writeFileSync(join(a.out, 'results.csv'), csv.join('\n') + '\n');
  writeFileSync(join(a.out, 'report.html'), reportHTML(data, ids, cell, score));
  console.log(`\nФайлы: ${join(a.out, 'results.json')}, results.csv, report.html`);
}
function reportHTML(data, ids, cell, score){
  const name = i => E.SHIPS[i].name;
  const col = v => `hsl(${Math.round(v * 120)},55%,${22 + Math.abs(v - 0.5) * 30}%)`;
  let rows = '';
  for (const i of ids) {
    rows += `<tr><th>${name(i)}</th>`;
    for (const j of ids) { const c = cell(i, j); rows += `<td style="background:${col(c.win + c.draw * 0.5)}" title="победы ${(c.win * 100).toFixed(1)}%, ничьи ${(c.draw * 100).toFixed(1)}%, среднее время ${c.t.toFixed(1)} с">${(c.win * 100).toFixed(0)}<small>${c.draw > 0.005 ? ' / ' + (c.draw * 100).toFixed(0) : ''}</small></td>`; }
    rows += `<td class="sc">${(score(i) * 100).toFixed(1)}%</td></tr>`;
  }
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Стенд: Звёздная схватка</title>
<style>body{background:#0c0c18;color:#ddd;font-family:monospace;padding:20px}table{border-collapse:collapse}td,th{padding:6px 8px;border:1px solid #334;text-align:center}
th{color:#8cf}td small{color:#ccc}.sc{color:#fc6;font-weight:bold}</style></head><body>
<h2>Звёздная схватка — стенд</h2><p>${data.date} · матчей на пару: ${data.args.n} · ИИ: ${data.args.diff} · лимит: ${data.args.time} с${data.args.ini ? ' · INI: ' + data.args.ini : ''}</p>
<p>Ячейка — % побед строки над столбцом (после «/» — % ничьих). Цвет: зелёный — строка сильнее, красный — слабее. Наведите на ячейку для подробностей.</p>
<table><tr><th></th>${ids.map(j => `<th>${name(j)}</th>`).join('')}<th>Рейтинг</th></tr>${rows}</table></body></html>`;
}
