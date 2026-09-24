#!/usr/bin/env node
// Replay links for bench matches: opens starship-duel.html in watch mode with the exact seed and settings.
//   node tools/melee-bench/watch.mjs siren bastion                    # latest run, every outcome kind
//   node tools/melee-bench/watch.mjs prev leviathan blink --kind upset
//   node tools/melee-bench/watch.mjs 20260924-151210_e2.0.3_balance-v4 hare wraith --port 8080
// Serve the repo root (not app/) so the INI under tools/ is reachable:  python3 -m http.server 8000
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..'), RUNS = join(HERE, 'runs');
const E = createRequire(import.meta.url)(resolve(ROOT, 'app/starship/engine.js'));

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
const shipIdx = s => { const q = String(s).toLowerCase(); return E.SHIPS.findIndex(d => d.id === q || d.name.toLowerCase() === q); };

const argv = process.argv.slice(2), pos = [];
let kind = 'all', port = 8000;
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--kind') kind = argv[++i]; else if (argv[i] === '--port') port = +argv[++i]; else pos.push(argv[i]); }
const run = pos.length === 3 ? pos.shift() : 'latest';
if (pos.length !== 2) {
  console.log('Использование: node tools/melee-bench/watch.mjs [прогон] <корабль A> <корабль B> [--kind all|upset|a|b|mutual|timeout] [--port 8000]');
  console.log('Корабли: ' + E.SHIPS.map(d => d.id + ' (' + d.name + ')').join(', '));
  process.exit(1);
}
let ia = shipIdx(pos[0]), ib = shipIdx(pos[1]);
if (ia < 0 || ib < 0) { console.error('Неизвестный корабль. Есть: ' + E.SHIPS.map(d => d.id).join(', ')); process.exit(1); }
let file, d;
try { file = findFile(run); d = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(e.message); process.exit(1); }
if (!d.examples) { console.error('В этом прогоне нет примеров боёв (он сделан до режима зрителя) — перезапустите стенд.'); process.exit(1); }

// examples are stored once per unordered pair, "i" = lower-index ship won
const lo = Math.min(ia, ib), hi = Math.max(ia, ib), ex = d.examples[E.SHIPS[lo].id + ',' + E.SHIPS[hi].id];
if (!ex) { console.error('Эта пара в прогоне не участвовала.'); process.exit(1); }
// replay must follow bench orientation: bench always puts the lower-index ship first ("i"), so A = lower index
if (ia !== lo) { console.log(`\n(порядок как на стенде: A — ${E.SHIPS[lo].name}, B — ${E.SHIPS[hi].name})`); ia = lo; ib = hi; }
const byKind = {a:ex.i || [], b:ex.j || [], mutual:ex.mutual || [], timeout:ex.timeout || []};
const cA = d.matrix[ia + ',' + ib] || {}, cB = d.matrix[ib + ',' + ia] || {};
const upset = (cA.win || 0) >= (cB.win || 0) ? 'b' : 'a';
const kinds = kind === 'all' ? ['a', 'b', 'mutual', 'timeout'] : kind === 'upset' ? [upset] : [kind];

const m = d.meta || {}, args = d.args || {};
const iniRel = args.ini ? relative(join(ROOT, 'app'), resolve(ROOT, args.ini)).split('\\').join('/') : null;
const base = `http://localhost:${port}/app/starship-duel.html`;
const url = (k, e) => {
  const q = new URLSearchParams({a:E.SHIPS[ia].id, b:E.SHIPS[ib].id, seed:String(e.seed), diff:args.diff || 'hard',
    time:String(args.time || 90), planet:args.planet === false ? '0' : '1', expect:k + ':' + e.t});
  if (iniRel) q.set('ini', iniRel);
  if (m.ini && m.ini.sha) q.set('ish', m.ini.sha);
  if (m.engine) q.set('ev', m.engine);
  return base + '?watch&' + q.toString();
};
const A = E.SHIPS[ia].name, B = E.SHIPS[ib].name;
const label = {a:`победил A (${A})`, b:`победил B (${B})`, mutual:'взаимное уничтожение', timeout:'таймаут'};
console.log(`\nПрогон: ${file}`);
console.log(`  движок v${m.engine || '?'} · git ${(m.git && m.git.commit) || '—'} · INI ${m.ini ? m.ini.file : 'по умолчанию'} · ИИ ${args.diff} · n=${args.n}`);
console.log(`  A: ${A} — побед ${((cA.win || 0) * 100).toFixed(0)}%, B: ${B} — побед ${((cB.win || 0) * 100).toFixed(0)}%, ничьих ${((cA.draw || 0) * 100).toFixed(0)}%`);
if (m.engine && m.engine !== E.VERSION) console.log(`  ⚠ сейчас движок v${E.VERSION}, прогон был на v${m.engine} — для точного повтора: git checkout ${(m.git && m.git.commit) || '<commit>'}`);
for (const k of kinds) {
  const list = byKind[k] || [];
  console.log(`\n${label[k]}${k === upset ? ' — неожиданный исход' : ''}: ${list.length ? '' : 'примеров нет'}`);
  for (const e of list) console.log(`  ${e.t.toFixed(1).padStart(5)} с  ${url(k, e)}`);
}
console.log(`\nСервер из корня репозитория:  cd ${ROOT} && python3 -m http.server ${port}`);
console.log('Повтор точный в Chrome/Chromium (тот же V8, что и у Node); в Firefox бой может разойтись.\n');
