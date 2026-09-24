#!/usr/bin/env node
// Ship "passport": derived combat numbers from raw params (engine defaults + optional INI).
//   node tools/melee-bench/sheet.mjs                          # defaults
//   node tools/melee-bench/sheet.mjs --ini balance-v4.ini     # with a balance set
//   node tools/melee-bench/sheet.mjs --ini v3.ini --vs v4.ini # before → after for changed numbers
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const E = createRequire(import.meta.url)(resolve(HERE, '../../app/starship/engine.js'));
const FIGHTER_CD = 0.45;   // fighter beam interval, hardcoded in engine updateWorld()

function loadSet(path){
  if (!path) return {};
  try { return E.parseIni(readFileSync(path, 'utf8')).ships; }
  catch (_) { console.error(`No such INI: ${path}`); process.exit(1); }
}
// Rough, AI-independent numbers. burst = damage from a full battery; sus = sustained DPS limited by regen.
function derive(d, p){
  const regen = 1 / p.regen + (d.id === 'parrot' ? p.insultGain / Math.max(0.1, p.sCd) : 0);  // battery/s (parrot: insults are free battery)
  const r = {crew:p.crew, speed:p.vmax};
  r.range = d.id === 'blink' ? p.fRange : Math.round((p.fSpd || 0) * (p.fLife || 0));
  const shots = p.fCost > 0 ? Math.floor(p.batt / p.fCost) : 99;
  r.burst = shots * p.fDmg;
  r.burstT = +(shots * p.fCd).toFixed(1);
  r.dpsMax = +(p.fDmg / p.fCd).toFixed(1);
  r.dpsSus = +Math.min(r.dpsMax, p.fCost > 0 ? regen / p.fCost * p.fDmg : r.dpsMax).toFixed(1);
  let spec = '';
  switch (d.id) {
    case 'leviathan': {
      const per = p.fighters * p.fighterLife / FIGHTER_CD * p.fighterDmg;
      r.specPerBatt = +(per / p.sCost).toFixed(1);
      spec = `истребители: до ${per.toFixed(0)} урона за запуск (${p.sCost} бат. + ${p.fighters} экип.), ${r.specPerBatt}/бат. против ${(p.fDmg / p.fCost).toFixed(2)}/бат. у залпа`; break;
    }
    case 'hare': {
      const sus = Math.min(p.sDmg / p.sCd, regen / p.sCost * p.sDmg);
      r.specSus = +sus.toFixed(1);
      spec = `ракеты назад: ${r.specSus} урона/с устойчиво, наведение ${p.homing}°/с`; break;
    }
    case 'bastion': spec = `ПРО: ${p.sRange} радиус, ${p.sCost} бат. за выстрел`; break;
    case 'sting': spec = `взрыв: ${p.gloryDmg} в центре, радиус ${p.gloryR}`; break;
    case 'siren': spec = `песня: ${((p.stealMin + p.stealMax) / 2).toFixed(1)} экип. за ${p.sCost} бат., дальность ${p.sRange}`; break;
    case 'wraith': spec = `маскировка: ${p.sCost} бат., в тени батарея не заряжается`; break;
    case 'blink': spec = `телепорт: ${p.sCost} бат.; лазер не промахивается`; break;
    case 'parrot': spec = `оскорбление: +${p.insultGain} бат. раз в ${p.sCd} с; стреляет в 3 стороны, вперёд летит 1 ствол`; break;
  }
  const dps = Math.max(r.dpsSus, r.specSus || 0);
  r.power = Math.round(p.crew * dps);   // crude "how long I live × how hard I hit"
  r.spec = spec;
  return r;
}
const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i++) if (args[i] === '--ini') opt.ini = args[++i]; else if (args[i] === '--vs') opt.vs = args[++i];
const A = loadSet(opt.ini), B = opt.vs ? loadSet(opt.vs) : null;
const pad = (s, w) => (String(s) + ' '.repeat(w)).slice(0, w);
const COLS = [['crew', 'экип'], ['speed', 'скор'], ['range', 'дальн'], ['burst', 'залп_бат'], ['burstT', 'за_с'], ['dpsMax', 'урон/с_макс'], ['dpsSus', 'урон/с_уст'], ['power', 'сила']];
console.log(`\nПаспорт кораблей — движок v${E.VERSION}${opt.ini ? ' · ' + opt.ini : ' · по умолчанию'}${B ? ' → ' + opt.vs : ''}\n`);
console.log(pad('корабль', 10) + COLS.map(c => pad(c[1], B ? 14 : 12)).join(''));
for (const d of E.SHIPS) {
  const a = derive(d, E.effP(d, A)), b = B ? derive(d, E.effP(d, B)) : null;
  console.log(pad(d.name, 10) + COLS.map(([k]) => pad(b && a[k] !== b[k] ? `${a[k]}→${b[k]}` : a[k], B ? 14 : 12)).join(''));
  console.log(' '.repeat(10) + (b && a.spec !== b.spec ? `${a.spec}\n${' '.repeat(10)}→ ${b.spec}` : a.spec));
}
console.log('\n«сила» = экипаж × лучший устойчивый урон/с: грубая оценка без учёта попаданий, дальности и ИИ.\n');
