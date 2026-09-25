#!/usr/bin/env node
// Bench: dynamic work queue. Every pair is split into seed chunks; threads take the next chunk when free,
// so heavy pairs no longer leave most threads idle at the end. Chunks are merged in seed order (deterministic).
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

const MERGE = String.raw`// merge seed-chunk results of one pair in seed order (keeps sums and examples deterministic)
function mergeParts(parts){
  parts.sort((x, y) => x.k0 - y.k0);
  const r = {i:parts[0].i, j:parts[0].j, wi:0, wj:0, draw:0, mutual:0, timeout:0, tSum:0, crewI:0, crewJ:0, si:{}, sj:{}, ex:{i:[], j:[], mutual:[], timeout:[]}};
  for (const q of parts) {
    for (const k of ['wi', 'wj', 'draw', 'mutual', 'timeout', 'tSum', 'crewI', 'crewJ']) r[k] += q[k];
    for (const s of ['si', 'sj']) for (const k in q[s]) r[s][k] = (r[s][k] || 0) + q[s][k];
    for (const k in r.ex) r.ex[k] = r.ex[k].concat(q.ex[k] || []).slice(0, 5);
  }
  return r;
}
`;

patch('tools/melee-bench/bench.mjs', [
  // worker: serve chunks from the main thread instead of a fixed job list
  ["  const {jobs, opt} = workerData;\n  for (const [i, j] of jobs) {\n    const r = {i, j,",
   "  // dynamic queue: the main thread hands out chunks (pair + seed range) as threads become free\n  const {opt} = workerData;\n  parentPort.on('message', job => {\n    if (!job) process.exit(0);\n    const [i, j, k0, k1] = job;\n    const r = {i, j, k0,"],
  ["    for (let k = 0; k < opt.n; k++) {", "    for (let k = k0; k < k1; k++) {"],
  ["    parentPort.postMessage(r);\n  }\n  parentPort.postMessage({done:true});", "    parentPort.postMessage(r);\n  });\n  parentPort.postMessage({ready:true});"],
  // main: build the chunk queue and hand chunks out on demand
  ["  const per = Math.max(1, a.workers), buckets = Array.from({length:per}, () => []);\n  jobs.forEach((jb, k) => buckets[k % per].push(jb));",
   "  // split every pair into seed chunks so threads stay busy until the end\n  const chunk = Math.max(5, Math.ceil(a.n / 5)), queue = [], parts = {};\n  for (const [i, j] of jobs) for (let k0 = 0; k0 < a.n; k0 += chunk) queue.push([i, j, k0, Math.min(a.n, k0 + chunk)]);\n  const per = Math.max(1, Math.min(a.workers, queue.length));"],
  ["  const total = jobs.length; let got = 0, alive = 0;", "  const total = jobs.length; let got = 0;"],
  ["  for (const b of buckets) {\n    if (!b.length) continue;\n    alive++;\n    const w = new Worker(fileURLToPath(import.meta.url), {workerData:{jobs:b, opt}});\n    w.on('message', m => {\n      if (m.done) { if (--alive === 0) finish(a, ids, res, t0, meta); return; }\n      res.push(m); got++;",
   "  for (let t = 0; t < per; t++) {\n    const w = new Worker(fileURLToPath(import.meta.url), {workerData:{opt}});\n    w.on('message', m => {\n      w.postMessage(queue.length ? queue.shift() : null);\n      if (m.ready) return;\n      const key = m.i + ',' + m.j; (parts[key] = parts[key] || []).push(m);\n      if (parts[key].length < Math.ceil(a.n / chunk)) return;\n      res.push(mergeParts(parts[key])); got++;\n      if (got === total) { finish(a, ids, res, t0, meta); return; }"],
  ["function finish(a, ids, res, t0, meta){", MERGE + "function finish(a, ids, res, t0, meta){"],
]);
