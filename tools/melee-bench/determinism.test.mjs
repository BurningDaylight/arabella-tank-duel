// Engine determinism: the same seed and settings must always produce the same fight.
// Watch mode and bench comparisons rely on this. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const E = createRequire(import.meta.url)(resolve(dirname(fileURLToPath(import.meta.url)), '../../app/starship/engine.js'));

function fight(i, j, seed){
  const W = E.createWorld({seed, planet:true, diff:['hard', 'hard']});
  const A = seed & 1, B = 1 - A;
  if (seed & 2) { E.spawn(W, A, i); E.spawn(W, B, j); } else { E.spawn(W, B, j); E.spawn(W, A, i); }
  const trace = [];
  for (let k = 0; k < 90 / E.DT; k++) {
    E.step(W, null); W.events.length = 0;
    if (k % 120 === 0) for (const s of W.ships) trace.push(s.x.toFixed(6), s.y.toFixed(6), s.crew);
    if (!W.ships[A].alive || !W.ships[B].alive) break;
  }
  return {t:W.time.toFixed(6), crew:W.ships.map(s => s.crew), trace:trace.join(',')};
}

test('same seed gives identical fights for every pair', () => {
  for (let i = 0; i < E.SHIPS.length; i++) for (let j = i; j < E.SHIPS.length; j++)
    for (const seed of [1, 2, 3, 12345]) assert.deepEqual(fight(i, j, seed), fight(i, j, seed), `${E.SHIPS[i].id} vs ${E.SHIPS[j].id}, seed ${seed}`);
});

test('mirror matches never throw (Leviathan fighters regression)', () => {
  for (let i = 0; i < E.SHIPS.length; i++) for (let seed = 1; seed <= 50; seed++) assert.doesNotThrow(() => fight(i, i, seed));
});
