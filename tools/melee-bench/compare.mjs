#!/usr/bin/env node
// Сравнение двух прогонов: что было → что стало.
//   node tools/melee-bench/compare.mjs prev latest     — два последних прогона
//   node tools/melee-bench/compare.mjs results-base runs/20260925-…
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, 'runs');
let LABELS = {};
try { LABELS = createRequire(import.meta.url)(resolve(HERE, '../../app/starship/engine.js')).LABELS || {}; } catch (_) {}
const TTY = process.stdout.isTTY;
const paint = code => s => TTY ? `\x1b[${code}m${s}\x1b[0m` : s;
const C = {g:paint(32), r:paint(31), d:paint(2), b:paint(1), y:paint(33)};
const pad = (s, w) => { s = String(s); const vis = s.replace(/\x1b\[[0-9;]*m/g, ''); return s + ' '.repeat(Math.max(0, w - vis.length)); };

function fromIndex(k){
  const f = join(RUNS, 'index.csv'); if (!existsSync(f)) return null;
  const lines = readFileSync(f, 'utf8').trim().split('\n').slice(1);
  const l = lines[lines.length - k]; return l ? l.split(',')[0] : null;
}
function findFile(p){
  if (p === 'prev') p = fromIndex(2) || p;
  if (p === 'last') p = fromIndex(1) || 'latest';
  for (const base of [process.cwd(), HERE, RUNS]) for (const c of [resolve(base, p), resolve(base, p, 'results.json')])
    if (c.endsWith('.json') && existsSync(c)) return realpathSync(c);
  throw new Error(`Не нашёл results.json для «${p}»`);
}
function load(p){
  const file = findFile(p), d = JSON.parse(readFileSync(file, 'utf8'));
  const byI = {}; for (const s of d.ships) byI[s.i] = s;
  const M = {};
  for (const k in d.matrix) { const [i, j] = k.split(',').map(Number); if (byI[i] && byI[j]) (M[byI[i].id] = M[byI[i].id] || {})[byI[j].id] = d.matrix[k]; }
  return {file, d, ships:d.ships, M, n:d.args.n, meta:d.meta || null};
}
const val = c => c.win + c.draw * 0.5;
const noise = (pa, na, pb, nb) => 2 * Math.sqrt(pa * (1 - pa) / na + pb * (1 - pb) / nb) + 0.005;
// pilot label: rule, planner, or planner:<objective> when a non-default objective was forced
const pilotOf = R => (R.d.args.ai || "rule") + (R.d.args.planMode ? ":" + R.d.args.planMode : "");
function metaLine(R){
  const m = R.meta;
  if (!m) return `без сведений о версиях (старый прогон) · n=${R.n} · ИИ ${R.d.args.diff}${R.d.args.ini ? ' · ' + R.d.args.ini : ''}`;
  const ini = m.ini ? `${m.ini.file}${m.ini.meta.version ? ' «' + m.ini.meta.version + '»' : ''} (${m.ini.sha})` : 'по умолчанию';
  return `${m.date.slice(0, 16).replace('T', ' ')} · движок v${m.engine} (${m.engineSha}) · git ${m.git.commit || '—'}${m.git.dirty ? '+правки' : ''} · INI ${ini} · n=${R.n} · ИИ ${R.d.args.diff}/${pilotOf(R)} · сиды ${R.d.args.seed || 0}`;
}
function warnings(A, B){
  const w = [], a = A.meta, b = B.meta;
  if (!a || !b) { w.push('у одного из прогонов нет сведений о версиях — что именно менялось, не проверить'); }
  else {
    const codeSame = a.engineSha === b.engineSha, iniSame = (a.ini && a.ini.sha) === (b.ini && b.ini.sha);
    if (!codeSame) w.push(`код движка разный (v${a.engine} → v${b.engine}): изменения идут и от кода, и от баланса`);
    if (!codeSame && a.engine === b.engine) w.push(`код менялся, а версия та же (v${a.engine}) — поднимите VERSION и запишите в CHANGELOG.md`);
    if (b.git && b.git.dirty) w.push(`«стало» посчитано с незакоммиченными правками (${b.git.dirtyFiles.join(', ')}) — по коммиту не воспроизвести`);
    if (codeSame && iniSame && (A.d.args.seed || 0) === (B.d.args.seed || 0) && A.n === B.n && A.d.args.diff === B.d.args.diff && pilotOf(A) === pilotOf(B))
      w.push('одинаковые код, настройки, сиды и n — результаты должны совпасть один в один');
  }
  if (A.d.args.diff !== B.d.args.diff) w.push(`разный уровень ИИ: ${A.d.args.diff} → ${B.d.args.diff}`);
  if (pilotOf(A) !== pilotOf(B)) w.push(`разный пилот ИИ: ${pilotOf(A)} → ${pilotOf(B)}`);
  return w;
}
function paramChanges(A, B, name){
  const out = [];
  if (!A.meta || !B.meta || !A.meta.params || !B.meta.params) return null;
  const pa = A.meta.params, pb = B.meta.params;
  for (const k in pb.phys) if (pa.phys[k] !== pb.phys[k]) out.push({who:'Физика', k, a:pa.phys[k], b:pb.phys[k]});
  for (const id in pb.ships) { const sa = pa.ships[id] || {}, sb = pb.ships[id]; for (const k in sb) if (sa[k] !== sb[k]) out.push({who:name(id), k, a:sa[k] === undefined ? '—' : sa[k], b:sb[k]}); }
  return out;
}

export function compareDirs(pa, pb, opts = {}){
  const A = load(pa), B = load(pb);
  const ids = A.ships.map(s => s.id).filter(id => B.ships.some(t => t.id === id));
  const name = id => { const s = B.ships.find(q => q.id === id) || A.ships.find(q => q.id === id); return s ? s.name : id; };
  const score = (R, id) => { const o = ids.filter(j => j !== id); return o.length ? o.reduce((s, j) => s + val(R.M[id][j]), 0) / o.length : 0.5; };
  console.log(C.b('\nСравнение прогонов'));
  console.log(`  было:  ${A.file}\n         ${C.d(metaLine(A))}`);
  console.log(`  стало: ${B.file}\n         ${C.d(metaLine(B))}`);
  for (const w of warnings(A, B)) console.log(C.y('  ⚠ ' + w));

  const ch = paramChanges(A, B, name);
  if (ch === null) console.log(C.d('\nИзменения параметров: неизвестно (в старом прогоне нет сведений)'));
  else if (!ch.length) console.log(C.d('\nПараметры кораблей и физики не менялись'));
  else {
    console.log(C.b('\nЧто поменялось в параметрах:'));
    let who = '';
    for (const c of ch) { if (c.who !== who) { who = c.who; console.log('  ' + C.b(who)); } console.log(`    ${pad(LABELS[c.k] || c.k, 34)} ${c.a} → ${C.y(c.b)}`); }
  }

  const rankA = ids.slice().sort((x, y) => score(A, y) - score(A, x)), rankB = ids.slice().sort((x, y) => score(B, y) - score(B, x));
  const nPair = Math.max(1, ids.length - 1);
  // timeout share per ship (stored since engine 2.0.3); a jump usually means the AI got stuck, not balance
  const toOf = (R, id) => { const s = R.ships.find(q => q.id === id); return s && s.stat ? s.stat.to : null; };
  const toStr = id => {
    const a = toOf(A, id), b = toOf(B, id); if (a == null && b == null) return '';
    const f = v => v == null ? '—' : (v * 100).toFixed(0) + '%', s = `таймаут ${f(a)} → ${f(b)}`;
    return b != null && b > 0.2 ? C.y(s + ' ⚠') : C.d(s);
  };
  console.log(C.b('\nРейтинг (средний % побед, ничья = ½):'));
  console.log(C.d('   ' + pad('корабль', 11) + pad('было', 8) + pad('стало', 8) + pad('Δ', 9) + 'место'));
  rankB.forEach((id, k) => {
    const a = score(A, id), b = score(B, id), dl = b - a, nz = noise(a, A.n * nPair, b, B.n * nPair);
    const ds = (dl >= 0 ? '+' : '') + (dl * 100).toFixed(1);
    const dc = Math.abs(dl) < nz ? C.d(ds) : dl > 0 ? C.g('▲' + ds) : C.r('▼' + ds);
    const was = rankA.indexOf(id) + 1, mv = was - (k + 1);
    console.log(`${pad(k + 1 + '.', 3)}${pad(name(id), 11)}${pad((a * 100).toFixed(1) + '%', 8)}${pad((b * 100).toFixed(1) + '%', 8)}${pad(dc, 9)}${mv > 0 ? C.g('↑' + mv) : mv < 0 ? C.r('↓' + -mv) : C.d('=')} ${pad(C.d('(было ' + was + ')'), 10)} ${toStr(id)}`);
  });

  console.log(C.b('\nСтало (Δ к «было»): % побед строки над столбцом'));
  console.log(pad('', 11) + ids.map(j => pad(name(j).slice(0, 7), 11)).join(''));
  const changes = [];
  for (const i of ids) {
    let line = pad(name(i), 11);
    for (const j of ids) {
      const a = val(A.M[i][j]), b = val(B.M[i][j]), dl = b - a, sig = Math.abs(dl) >= noise(a, A.n, b, B.n);
      const rr = Math.round(dl * 100) || 0, ds = (rr >= 0 ? '+' : '') + rr;
      line += pad(`${Math.round(B.M[i][j].win * 100)}`.padStart(3) + ' ' + (sig ? (dl > 0 ? C.g(ds) : C.r(ds)) : C.d(ds)), 11);
      if (i !== j && sig) changes.push({i, j, a, b, dl});
    }
    console.log(line);
  }
  const seen = new Set();
  const top = changes.sort((x, y) => Math.abs(y.dl) - Math.abs(x.dl)).filter(c => { const k = [c.i, c.j].sort().join(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
  if (top.length) {
    console.log(C.b('\nСамые заметные сдвиги:'));
    for (const c of top) console.log(`  ${pad(name(c.i) + ' — ' + name(c.j), 24)} ${(c.a * 100).toFixed(0)}% → ${(c.b * 100).toFixed(0)}%  ${c.dl > 0 ? C.g('+' + (c.dl * 100).toFixed(0)) : C.r((c.dl * 100).toFixed(0))}`);
  } else console.log(C.d('\nЗначимых сдвигов нет — всё в пределах шума.'));

  const out = opts.html || join(dirname(B.file), 'compare.html');
  writeFileSync(out, html(A, B, ids, name, score, ch));
  console.log(`\nНаглядно: ${out}\n`);
}

function html(A, B, ids, name, score, ch){
  const heat = v => `hsl(${Math.round(v * 120)},55%,${22 + Math.abs(v - 0.5) * 30}%)`;
  const dheat = (d, sig) => !sig ? '#2a2a34' : `rgba(${d > 0 ? '40,200,80' : '230,60,60'},${Math.min(0.9, 0.25 + Math.abs(d) * 1.5)})`;
  const table = (title, fn) => `<div><h3>${title}</h3><table><tr><th></th>${ids.map(j => `<th>${name(j).slice(0, 7)}</th>`).join('')}</tr>${ids.map(i => `<tr><th>${name(i)}</th>${ids.map(j => fn(i, j)).join('')}</tr>`).join('')}</table></div>`;
  const before = table('Было', (i, j) => `<td style="background:${heat(val(A.M[i][j]))}">${Math.round(A.M[i][j].win * 100)}</td>`);
  const after = table('Стало', (i, j) => `<td style="background:${heat(val(B.M[i][j]))}">${Math.round(B.M[i][j].win * 100)}</td>`);
  const delta = table('Разница (серое — в пределах шума)', (i, j) => { const a = val(A.M[i][j]), b = val(B.M[i][j]), d = b - a, sig = Math.abs(d) >= noise(a, A.n, b, B.n); return `<td style="background:${dheat(d, sig)}" title="${(a * 100).toFixed(1)}% → ${(b * 100).toFixed(1)}%">${d >= 0 ? '+' : ''}${Math.round(d * 100)}</td>`; });
  const rank = ids.slice().sort((x, y) => score(B, y) - score(B, x)).map((id, k) => { const a = score(A, id), b = score(B, id), d = b - a; return `<tr><td>${k + 1}</td><th>${name(id)}</th><td>${(a * 100).toFixed(1)}%</td><td>${(b * 100).toFixed(1)}%</td><td style="color:${d > 0.01 ? '#6d6' : d < -0.01 ? '#f66' : '#888'}">${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}</td></tr>`; }).join('');
  const params = ch === null ? '<p>Изменения параметров неизвестны (старый прогон).</p>' : !ch.length ? '<p>Параметры не менялись.</p>'
    : `<table><tr><th>кто</th><th>параметр</th><th>было</th><th>стало</th></tr>${ch.map(c => `<tr><td>${c.who}</td><td style="text-align:left">${LABELS[c.k] || c.k}</td><td>${c.a}</td><td style="color:#fc6">${c.b}</td></tr>`).join('')}</table>`;
  const warn = warnings(A, B).map(w => `<p style="color:#fc6">⚠ ${w}</p>`).join('');
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Сравнение прогонов</title>
<style>body{background:#0c0c18;color:#ddd;font-family:monospace;padding:16px}.row{display:flex;gap:24px;flex-wrap:wrap}
table{border-collapse:collapse}td,th{padding:5px 7px;border:1px solid #334;text-align:center}th{color:#8cf}h3{color:#fc6;margin:12px 0 6px}.m{color:#9ab}</style></head><body>
<h2>Сравнение прогонов</h2><p class="m">было: ${metaLine(A)}<br>стало: ${metaLine(B)}</p>${warn}
<div class="row"><div><h3>Рейтинг</h3><table><tr><th>#</th><th>корабль</th><th>было</th><th>стало</th><th>Δ</th></tr>${rank}</table></div>
<div><h3>Что поменялось в параметрах</h3>${params}</div></div>
<div class="row">${before}${after}${delta}</div></body></html>`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) { console.log('Использование: node tools/melee-bench/compare.mjs <было> <стало>   (можно prev / latest)'); process.exit(1); }
  try { compareDirs(a, b); } catch (e) { console.error(e.message); process.exit(1); }
}
