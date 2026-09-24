#!/usr/bin/env node
// Разовый патч: VERSION в движке, [meta] в INI, версия в меню игры.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function patch(rel, edits){
  const f = resolve(ROOT, rel); let s = readFileSync(f, 'utf8'), n = 0;
  for (const [marker, from, to] of edits) {
    if (s.includes(marker)) { console.log(`  = уже есть: ${marker}`); continue; }
    const k = s.split(from).length - 1;
    if (k !== 1) { console.error(`  ! ожидал ровно 1 вхождение, нашёл ${k}:\n      ${from.slice(0, 100)}`); process.exitCode = 1; continue; }
    s = s.replace(from, () => to); n++;
  }
  if (n) { copyFileSync(f, f + '.bak'); writeFileSync(f, s); }
  console.log(`${rel}: внесено правок ${n}`);
}

patch('app/starship/engine.js', [
  ["const VERSION =", "'use strict';\n",
   "'use strict';\n\n// Версия движка. Поднимать при любом изменении логики боя, физики или ИИ:\n// мажор — механики несовместимы, минор — новые механики/корабли, патч — исправления. Журнал: CHANGELOG.md.\nconst VERSION = '2.0.1';\n"],
  ["meta:{}, game:{}", "const out = {game:{}, phys:{}, ships:{}, n:0};", "const out = {meta:{}, game:{}, phys:{}, ships:{}, n:0};"],
  ["sec === 'meta'", "    if (sec === 'game') { out.game[k] = v; out.n++; }",
   "    if (sec === 'meta') out.meta[k] = v;\n    else if (sec === 'game') { out.game[k] = v; out.n++; }"],
  ["return {VERSION,", "return {WW, PX,", "return {VERSION, WW, PX,"],
]);

patch('app/starship-duel.html', [
  ['id="ver"', "<p>дуэль кораблей по мотивам Star Control</p>",
   "<p>дуэль кораблей по мотивам Star Control · <span id=\"ver\" style=\"color:#8cf\"></span></p>"],
  ["$('ver').textContent", "try { buildMenu(); } catch (e) { showErr(e); }",
   "try { buildMenu(); } catch (e) { showErr(e); }\n$('ver').textContent = 'движок v' + (E.VERSION || '?');"],
  ["'[meta]'", "const L = ['; Звёздная схватка — настройки', '; Строки, начинающиеся с «;», — комментарии.', '', '[game]'];",
   "const L = ['; Звёздная схватка — настройки', '; Строки, начинающиеся с «;», — комментарии.', '', '[meta]', '; version — имя этого набора, например balance-v3; based_on — от какого набора; note — что меняли', 'version = ', 'based_on = ', 'note = ', `engine = ${E.VERSION}`, `exported = ${new Date().toISOString()}`, '', '[game]'];"],
  ["Файл выгружен из движка", "saveCfg(); buildMenu(); $('ioMsg').textContent = `Загружено значений: ${r.n}.`;",
   "saveCfg(); buildMenu(); $('ioMsg').textContent = `Загружено значений: ${r.n}.` + (r.meta && r.meta.engine ? ` Файл выгружен из движка v${r.meta.engine}${r.meta.engine !== E.VERSION ? ' (у вас v' + E.VERSION + ')' : ''}${r.meta.version ? ', набор «' + r.meta.version + '»' : ''}.` : '');"],
]);
