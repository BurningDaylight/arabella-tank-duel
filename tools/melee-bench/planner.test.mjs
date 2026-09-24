// Planner AI: deterministic and exception-free on representative pairs. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const E = createRequire(import.meta.url)(resolve(dirname(fileURLToPath(import.meta.url)), '../../app/starship/engine.js'));

function fight(i, j, seed){
  const W = E.createWorld({seed, planet:true, diff:['hard', 'hard'], ai:['planner', 'planner']});
  E.spawn(W, 0, i); E.spawn(W, 1, j);
  for (let k = 0; k < 30 / E.DT; k++) { E.step(W, null); W.events.length = 0; if (!W.ships[0].alive || !W.ships[1].alive) break; }
  return W.ships.map(s => [s.alive, s.crew, s.x.toFixed(6), s.y.toFixed(6)]).concat([W.time.toFixed(6), W.rs]);
}

test('planner is deterministic and never throws', () => {
  for (const [i, j] of [[0, 1], [3, 7], [2, 4], [6, 5]]) assert.deepEqual(fight(i, j, 7), fight(i, j, 7), E.SHIPS[i].id + ' vs ' + E.SHIPS[j].id);
});
