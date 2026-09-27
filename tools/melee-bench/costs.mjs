#!/usr/bin/env node
// Fair fleet costs from a bench run.
//   node tools/melee-bench/costs.mjs [run] [--mean 15]            table (run: latest by default, prev / folder / path)
//   node tools/melee-bench/costs.mjs [run] --merge balance-v9.ini   print that INI with the suggested costs merged in
// Two views of the same matrix (mirrors excluded):
//   - Bradley-Terry strength (draws count as half wins), shown as Elo points
//   - exchange-fair cost: for every ship the expected enemy points destroyed per duel equal its own points lost
//     (win: enemy cost destroyed; loss: own cost lost; mutual kill: both; timeout: nothing). Fixed point, mean = --mean.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), RUNS = join(HERE, 'runs');
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
  throw new Error(`No results.json for "${p}"`);
}

const argv = process.argv.slice(2);
let run = 'latest', mean = 15, merge = null;
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--mean') mean = +argv[++i]; else if (argv[i] === '--merge') merge = argv[++i]; else run = argv[i]; }
let file, d;
try { file = findFile(run); d = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(e.message); process.exit(1); }
const S = d.ships, n = S.length, cell = (a, b) => d.matrix[S[a].i + ',' + S[b].i];
const mut = x => x.mutual || 0;

// Bradley-Terry via minorization-maximization; every pair played "one unit" of games (fractions sum to 1)
let p = S.map(() => 1);
for (let it = 0; it < 500; it++) {
  const np = p.map((pa, a) => {
    let w = 0, den = 0;
    for (let b = 0; b < n; b++) if (a !== b) { const c = cell(a, b); w += c.win + 0.5 * c.draw; den += 1 / (pa + p[b]); }
    return Math.max(1e-6, w / den);
  });
  const g = Math.exp(np.reduce((s, v) => s + Math.log(v), 0) / n); p = np.map(v => v / g);
}
const elo = p.map(v => 400 * Math.log10(v));

// exchange-fair costs: c_a = sum_b (win + mutual) c_b / sum_b (lose + mutual), damped, clamped, mean-normalised
let c = S.map(() => mean);
for (let it = 0; it < 2000; it++) {
  const nc = c.map((ca, a) => {
    let gain = 0, loss = 0;
    for (let b = 0; b < n; b++) if (a !== b) { const x = cell(a, b); gain += (x.win + mut(x)) * c[b]; loss += x.lose + mut(x); }
    return Math.min(mean * 5, Math.max(mean / 10, loss > 1e-6 ? gain / loss : ca * 2));
  });
  const damp = nc.map((v, a) => Math.sqrt(v * c[a])), m = damp.reduce((s, v) => s + v, 0) / n;
  c = damp.map(v => v * mean / m);
}
const suggested = c.map(v => Math.max(1, Math.round(v)));
const current = S.map(s => d.meta && d.meta.params && d.meta.params.ships[s.id] && d.meta.params.ships[s.id].cost);
// average points won per duel at given costs: positive = underpriced, negative = overpriced
const balance = cost => S.map((_, a) => {
  let s = 0;
  for (let b = 0; b < n; b++) if (a !== b) { const x = cell(a, b); s += (x.win + mut(x)) * cost[b] - (x.lose + mut(x)) * cost[a]; }
  return s / (n - 1);
});

if (merge) {
  const costs = Object.fromEntries(S.map((s, a) => [s.id, suggested[a]]));
  let text; try { text = readFileSync(merge, 'utf8'); } catch (_) { console.error(`No such INI: ${merge}`); process.exit(1); }
  const out = [], seen = new Set(); let sec = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^\[(.+)\]$/);
    if (m) {
      sec = m[1].trim().toLowerCase(); out.push(line);
      if (sec.startsWith('ship.') && costs[sec.slice(5)] !== undefined) { out.push('cost = ' + costs[sec.slice(5)]); seen.add(sec.slice(5)); }
      continue;
    }
    if (sec && sec.startsWith('ship.') && /^\s*cost\s*=/.test(line)) continue;
    out.push(line);
  }
  for (const id in costs) if (!seen.has(id)) out.push('', '[ship.' + id + ']', 'cost = ' + costs[id]);
  process.stdout.write(out.join('\n').replace(/\n*$/, '\n'));
  process.exit(0);
}

const m = d.meta || {}, pad = (s, w) => (String(s) + ' '.repeat(w)).slice(0, w);
const bCur = current.every(v => v) ? balance(current) : null, bSug = balance(suggested);
console.log(`\nЦены по прогону: ${basename(dirname(file))}`);
console.log(`  движок v${m.engine || '?'} · INI ${m.ini ? m.ini.file : 'по умолчанию'} · ИИ ${d.args.diff}/${d.args.ai || 'rule'}${d.args.planMode ? ':' + d.args.planMode : ''} · n=${d.args.n}`);
if (d.args.n < 200) console.log(`  ⚠ n=${d.args.n}: цены будут шумными, лучше прогон на 300+ боёв на пару`);
console.log('\n' + pad('корабль', 11) + pad('рейтинг', 9) + pad('Эло', 7) + pad('цена сейчас', 13) + pad('баланс', 9) + pad('→ цена', 9) + 'баланс');
const order = S.map((_, a) => a).sort((x, y) => suggested[y] - suggested[x]);
for (const a of order) {
  const f = v => (v >= 0 ? '+' : '') + v.toFixed(1);
  console.log(pad(S[a].name, 11) + pad((S[a].score * 100).toFixed(1) + '%', 9) + pad(Math.round(elo[a]), 7)
    + pad(current[a] || '—', 13) + pad(bCur ? f(bCur[a]) : '—', 9) + pad(suggested[a], 9) + f(bSug[a]));
}
console.log(`\n«баланс» — сколько очков корабль в среднем выигрывает за дуэль: плюс — недооценён, минус — переоценён.`);
console.log(`Средняя цена ${mean}. Вписать цены в набор:  node tools/melee-bench/costs.mjs ${run} --merge <набор.ini> > <новый.ini>\n`);
