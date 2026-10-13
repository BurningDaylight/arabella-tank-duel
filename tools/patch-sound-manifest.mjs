#!/usr/bin/env node
// Games read app/sounds/manifest.js (window.SOUND_MANIFEST) and request only existing sound files;
// without a manifest they fall back to probing name1, name2, ... until the first 404 (old behaviour).
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
const INCLUDE = ['<div id="err"></div>', '<div id="err"></div>\n<script src="sounds/manifest.js"></script>'];

// template-style loaders (Star Melee, Blue & Grey, and the older games built from the same template)
const LOADER = ["    try { bank(1); } catch (_) {}",
  "    // manifest: request only files that exist; no manifest -> probe name1, name2, ... until the first miss\n"
  + "    const M = window.SOUND_MANIFEST;\n"
  + "    try {\n"
  + "      if (M && M[n] !== undefined) {\n"
  + "        for (let k = 1; k <= M[n]; k++) probe(`sounds/${n}${k}.ogg`, a => addSample(n, a), () => {});\n"
  + "        if (!M[n] && M.single && M.single[n]) probe(`sounds/${n}.${M.single[n]}`, a => addSample(n, a), () => {});\n"
  + "      } else bank(1);\n"
  + "    } catch (_) {}"];

for (const f of ['app/starship-duel.html', 'app/tactical-duel.html', 'app/tank-duel.html', 'app/chopper-duel.html', 'app/car-duel.html'])
  patch(f, [INCLUDE, LOADER]);

// Warlords: the inline sound block (ES5 style)
patch('app/realm-duel.html', [INCLUDE,
  ["      bank(1);\n    });",
   "      // manifest: request only files that exist; no manifest -> probe until the first miss\n"
   + "      var M = window.SOUND_MANIFEST;\n"
   + "      if (M && M[n] !== undefined) {\n"
   + "        for (var k = 1; k <= M[n]; k++) probe('sounds/' + n + k + '.ogg', function (a) { add(n, a); }, function () {});\n"
   + "        if (!M[n] && M.single && M.single[n]) probe('sounds/' + n + '.' + M.single[n], function (a) { add(n, a); }, function () {});\n"
   + "      } else bank(1);\n    });"],
]);
