/* Звёздная схватка — движок: корабли, физика, ИИ, бой. Без DOM и звука.
   Подключается игрой (<script src>) и стендом (node). */
(function (root, factory) {
  const M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.MeleeEngine = M;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

// Версия движка. Поднимать при любом изменении логики боя, физики или ИИ:
// мажор — механики несовместимы, минор — новые механики/корабли, патч — исправления. Журнал: CHANGELOG.md.
const VERSION = '2.1.0';

const WW = 3200, PX = WW / 2, PY = WW / 2, PR = 110, DT = 1 / 120, DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wd = (a, b) => { let d = a - b; d -= Math.round(d / WW) * WW; return d; };
const wrapW = v => ((v % WW) + WW) % WW;
const angDiff = (a, b) => { let d = a - b; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; return d; };
const dist2 = (a, b) => Math.hypot(wd(a.x, b.x), wd(a.y, b.y));
function mulberry(a){
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = (W, a, b) => a + W.rng() * (b - a);
const irnd = (W, a, b) => Math.floor(rnd(W, a, b + 1));

// ---------- параметры ----------
const LABELS = {
  crew:'Экипаж на старте', crewMax:'Экипаж максимум', batt:'Батарея (макс.)', regen:'Регенерация: сек на 1 ед.',
  turn:'Поворот, °/с', thrust:'Тяга (ускорение)', vmax:'Макс. скорость', mass:'Масса (столкновения)',
  fCost:'Оружие: цена', fCd:'Оружие: перезарядка, с', fDmg:'Оружие: урон', fSpd:'Оружие: скорость снаряда',
  fLife:'Оружие: жизнь снаряда, с', fRange:'Оружие: дальность', homing:'Самонаведение, °/с',
  sCost:'Спец: цена', sCd:'Спец: перезарядка, с', sRange:'Спец: дальность', sDmg:'Спец: урон',
  sSpd:'Спец: скорость снаряда', sLife:'Спец: жизнь снаряда, с',
  fighters:'Истребителей за запуск', fighterLife:'Истребитель: время полёта, с', fighterDmg:'Истребитель: урон',
  gloryDmg:'Взрыв: урон в центре', gloryR:'Взрыв: радиус', stealMin:'Песня: мин. экипажа', stealMax:'Песня: макс. экипажа',
  insultGain:'Оскорбление: + батареи', rebirth:'Шанс перерождения, %',
  magnetR:'Магнит экипажа: радиус', magnetF:'Магнит экипажа: сила',
};
const RANGES = {
  crew:[1,99,1], crewMax:[1,99,1], batt:[1,99,1], regen:[0.02,5,0.01], turn:[20,720,1], thrust:[0,2000,10], vmax:[50,1000,10], mass:[0.5,50,0.5],
  fCost:[0,50,1], fCd:[0.02,5,0.01], fDmg:[0,50,1], fSpd:[50,2000,10], fLife:[0.1,10,0.05], fRange:[50,1000,10], homing:[0,720,5],
  sCost:[0,50,1], sCd:[0,10,0.05], sRange:[50,1500,10], sDmg:[0,50,1], sSpd:[50,2000,10], sLife:[0.1,10,0.1],
  fighters:[1,8,1], fighterLife:[1,30,0.5], fighterDmg:[0,10,1], gloryDmg:[0,99,1], gloryR:[50,800,10],
  stealMin:[0,20,1], stealMax:[0,20,1], insultGain:[0,20,1], rebirth:[0,100,5], magnetR:[0,1500,10], magnetF:[0,2000,10],
};
const COMMON = ['crew','crewMax','batt','regen','turn','thrust','vmax','mass'];

const SHIPS = [
  {id:'bastion', name:'Бастион', role:'крейсер', r:18, pref:420, frange:800,
   weapon:'Самонаводящаяся ядерная ракета: урон {fDmg}, цена {fCost}. Разгоняется до {fSpd}.',
   special:'Лазер ПРО: сбивает ближайший вражеский снаряд или истребитель в радиусе {sRange}; если их нет — бьёт по кораблю ({sDmg}). Цена {sCost}.',
   p:{crew:18, crewMax:18, batt:18, regen:0.45, turn:150, thrust:240, vmax:210, mass:6,
      fCost:9, fCd:0.8, fDmg:4, fSpd:420, fLife:3.2, homing:140, sCost:4, sCd:0.3, sRange:170, sDmg:1},
   keys:['fCost','fCd','fDmg','fSpd','fLife','homing','sCost','sCd','sRange','sDmg'],
   shape:[[1.2,0],[0.6,0.35],[-0.9,0.35],[-1,0.6],[-1.15,0.6],[-1.15,-0.6],[-1,-0.6],[-0.9,-0.35],[0.6,-0.35]],
   ditty:[60,64,67,72,67,72], wave:'square', captains:['Смирнов','Кравец','Орлова','Громов','Бойко']},
  {id:'leviathan', name:'Левиафан', role:'дредноут', r:26, pref:360, frange:650,
   weapon:'Плазменный залп: урон {fDmg}, цена {fCost}.',
   special:'Запуск {fighters} истребителей (цена {sCost}): каждый забирает 1 экипажа, летает {fighterLife} с и стреляет по {fighterDmg}; вернувшись, отдаёт экипаж обратно.',
   p:{crew:42, crewMax:42, batt:42, regen:0.28, turn:92, thrust:170, vmax:170, mass:10,
      fCost:6, fCd:0.45, fDmg:6, fSpd:620, fLife:1.3, sCost:8, sCd:1.0, fighters:2, fighterLife:9, fighterDmg:1},
   keys:['fCost','fCd','fDmg','fSpd','fLife','sCost','sCd','fighters','fighterLife','fighterDmg'],
   shape:[[1.3,0],[0.3,0.25],[0.1,0.8],[-0.5,0.8],[-0.4,0.3],[-1,0.3],[-1,-0.3],[-0.4,-0.3],[-0.5,-0.8],[0.1,-0.8],[0.3,-0.25]],
   ditty:[36,43,41,36,31,36], wave:'sawtooth', captains:['Гроза-7','Властелин','Надсмотрщик','Молот']},
  {id:'hare', name:'Заяц', role:'трус', r:13, pref:380, frange:360,
   weapon:'Слабая пушка вперёд: урон {fDmg}, цена {fCost}.',
   special:'Самонаводящаяся ракета НАЗАД: урон {sDmg}, цена {sCost}. Лучшая тактика — удирать и стрелять через плечо.',
   p:{crew:20, crewMax:20, batt:14, regen:0.22, turn:206, thrust:420, vmax:300, mass:4,
      fCost:1, fCd:0.15, fDmg:1, fSpd:520, fLife:0.7, sCost:3, sCd:0.35, sDmg:2, sSpd:380, sLife:2.6, homing:183},
   keys:['fCost','fCd','fDmg','fSpd','fLife','sCost','sCd','sDmg','sSpd','sLife','homing'],
   shape:'saucer', ditty:[72,69,65,62,60,55], wave:'triangle', captains:['Трусишка','Ах-ох','Бегунок','Пугало']},
  {id:'wraith', name:'Призрак', role:'засадник', r:16, pref:90, frange:150, edge:true,
   weapon:'Огнемёт вплотную: урон {fDmg} за струю, цена {fCost}. Дальность маленькая.',
   special:'Маскировка (цена {sCost}): почти невидим, робот теряет цель, батарея не заряжается. Выстрел или повторное нажатие снимает маскировку.',
   p:{crew:22, crewMax:22, batt:16, regen:0.3, turn:150, thrust:280, vmax:240, mass:6,
      fCost:1, fCd:0.07, fDmg:1, fSpd:360, fLife:0.38, sCost:3, sCd:0.4},
   keys:['fCost','fCd','fDmg','fSpd','fLife','sCost','sCd'],
   shape:[[1.2,0.15],[0.2,0.5],[-0.8,1.0],[-0.4,0.2],[-1,0],[-0.4,-0.2],[-0.8,-1.0],[0.2,-0.5],[1.2,-0.15]],
   ditty:[50,53,49,46,45], wave:'sawtooth', captains:['Тень','Шёпот','Кошмар','Мрак']},
  {id:'blink', name:'Блинк', role:'мерцающий', r:10, pref:200, noGrav:true, noThrust:true,
   weapon:'Автонаводящийся лазер: сам бьёт врага в радиусе {fRange}, урон {fDmg}, цена {fCost}.',
   special:'Случайный телепорт, цена {sCost}. Корабль безынерционный и не подвержен гравитации.',
   p:{crew:6, crewMax:6, batt:20, regen:0.1, turn:286, thrust:0, vmax:320, mass:1,
      fCost:2, fCd:0.12, fDmg:1, fRange:260, sCost:3, sCd:0.6},
   keys:['fCost','fCd','fDmg','fRange','sCost','sCd'],
   shape:'disc', ditty:[84,88,91,96,91,96], wave:'sine', captains:['Мерцающий','Пых','Нигде','Где-то']},
  {id:'sting', name:'Жало', role:'камикадзе', r:8, pref:0, frange:300, edge:true,
   weapon:'Иглы: урон {fDmg}, цена {fCost}.',
   special:'«Устройство славы»: нажать дважды — взрыв радиусом {gloryR}, до {gloryDmg} урона в центре. Сам корабль гибнет.',
   p:{crew:6, crewMax:6, batt:4, regen:0.3, turn:258, thrust:520, vmax:330, mass:1,
      fCost:1, fCd:0.18, fDmg:1, fSpd:560, fLife:0.55, gloryDmg:16, gloryR:220},
   keys:['fCost','fCd','fDmg','fSpd','fLife','gloryDmg','gloryR'],
   shape:[[1.3,0],[-0.8,0.8],[-0.4,0],[-0.8,-0.8]], ditty:[67,67,74,79,74,79], wave:'square', captains:['Храбрец','Кроха','Бах','Последний']},
  {id:'siren', name:'Сирена', role:'похитительница', r:13, pref:280, frange:520,
   weapon:'Кинжальный выстрел: урон {fDmg}, цена {fCost}.',
   special:'Песня (цена {sCost}, дальность {sRange}): {stealMin}–{stealMax} экипажа врага вылетают в космос; экипаж в радиусе {magnetR} сам притягивается к Сирене (до {crewMax}).',
   p:{crew:12, crewMax:42, batt:16, regen:0.3, turn:183, thrust:340, vmax:270, mass:3,
      fCost:1, fCd:0.25, fDmg:2, fSpd:560, fLife:1.0, sCost:5, sCd:1.0, sRange:360, stealMin:2, stealMax:6, magnetR:420, magnetF:260},
   keys:['fCost','fCd','fDmg','fSpd','fLife','sCost','sCd','sRange','stealMin','stealMax','magnetR','magnetF'],
   shape:[[1.3,0],[0.3,0.45],[-0.9,0.3],[-1.1,0],[-0.9,-0.3],[0.3,-0.45]], ditty:[69,72,76,81,76,72], wave:'triangle', captains:['Лорелея','Мелодия','Ария','Нимфа']},
  {id:'parrot', name:'Попугай', role:'задира', r:9, pref:160, frange:300,
   weapon:'Тройная пушка — вперёд и в обе стороны: урон {fDmg} каждым стволом, цена {fCost}.',
   special:'Оскорбление: +{insultGain} к батарее (сама она почти не заряжается). После гибели — {rebirth}% шанс переродиться.',
   p:{crew:8, crewMax:8, batt:12, regen:1.5, turn:229, thrust:480, vmax:320, mass:1,
      fCost:1, fCd:0.12, fDmg:1, fSpd:500, fLife:0.6, sCd:0.6, insultGain:3, rebirth:50},
   keys:['fCost','fCd','fDmg','fSpd','fLife','sCd','insultGain','rebirth'],
   shape:[[1.2,0],[0.2,0.3],[-0.4,1.0],[-0.3,0.2],[-1,0.3],[-0.8,0],[-1,-0.3],[-0.3,-0.2],[-0.4,-1.0],[0.2,-0.3]],
   ditty:[76,79,76,84,72,76], wave:'square', captains:['Крикун','Пернатый','Балабол','Кеша']},
];
const INSULTS = ['Эй, консервная банка!','Твой капитан — тостер!','Тормоз!','Ржавое ведро!','Слабак!','Лети домой к маме!',
  'Ты стреляешь, как Заяц!','Ха! Мимо!','Космический мусор!','Бе-бе-бе!','Кто тебя собирал?','Скучно с тобой!'];
const AIP = {
  easy:  {think:.25, aim:.30, fire:.6,  spec:.4},
  normal:{think:.12, aim:.18, fire:.85, spec:.7},
  hard:  {think:.05, aim:.10, fire:1,   spec:1},
};
const PHYS_UI = [
  ['gravity','Сила гравитации, %',0,400,5,'100 — стандарт, 0 — планета не притягивает.'],
  ['gRange','Радиус гравитации',200,3000,50,'На каком расстоянии от центра планеты действует притяжение.'],
  ['slingOut','Рогатка: тяга на выходе, %',0,100,5,'Насколько сильно планета тянет, когда вы от неё удаляетесь. 100 — честная физика без разгона, меньше — мощнее рогатка.'],
  ['overCap','Предел разгона, % от макс. скорости',100,500,10,'Выше этого не разогнаться даже гравитацией.'],
  ['decay','Гашение лишней скорости, %/с',0,200,5,'Как быстро скорость выше обычной гаснет вне гравитационного колодца. 0 — не гаснет.'],
  ['planetDmg','Удар о планету: урон',0,20,1,'Сколько экипажа стоит касание планеты.'],
  ['asteroids','Астероидов на поле',0,20,1,''],
];
const DEFAULT_PHYS = {gravity:100, gRange:1300, slingOut:45, overCap:220, decay:25, planetDmg:1, asteroids:6};

const effP = (d, over) => Object.assign({}, d.p, (over && over[d.id]) || {});
const shipKeys = d => COMMON.filter(k => !(d.noThrust && k === 'thrust')).concat(d.keys);
const fmt = (str, p) => str.replace(/\{(\w+)\}/g, (_, k) => p[k] !== undefined ? p[k] : '?');

function parseIni(text){
  const out = {meta:{}, game:{}, phys:{}, ships:{}, n:0};
  let sec = null;
  for (let line of String(text).split(/\r?\n/)) {
    line = line.replace(/^\uFEFF/, '').trim();
    if (!line || line[0] === ';' || line[0] === '#') continue;
    const m = line.match(/^\[(.+)\]$/);
    if (m) { sec = m[1].trim().toLowerCase(); continue; }
    const eq = line.indexOf('='); if (eq < 0 || !sec) continue;
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim(), x = parseFloat(v);
    if (sec === 'meta') out.meta[k] = v;
    else if (sec === 'game') { out.game[k] = v; out.n++; }
    else if (sec === 'physics') {
      const f = PHYS_UI.find(q => q[0] === k);
      if (f && isFinite(x)) { out.phys[k] = clamp(x, f[2], f[3]); out.n++; }
    } else if (sec.startsWith('ship.')) {
      const d = SHIPS.find(q => q.id === sec.slice(5));
      if (d && d.p[k] !== undefined && isFinite(x)) {
        if (!out.ships[d.id]) out.ships[d.id] = {};
        out.ships[d.id][k] = clamp(x, RANGES[k][0], RANGES[k][1]); out.n++;
      }
    }
  }
  return out;
}

// ---------- мир ----------
function emit(W, type, props){ const e = props || {}; e.type = type; W.events.push(e); }
function other(W, side){ const s = W.ships[1 - side]; return s && s.alive ? s : null; }
function randomSpot(W, avoid, minD){
  for (let t = 0; t < 60; t++) {
    const x = rnd(W, 0, WW), y = rnd(W, 0, WW);
    if (W.planet && Math.hypot(wd(x, PX), wd(y, PY)) < PR + 350) continue;
    if (avoid && Math.hypot(wd(x, avoid.x), wd(y, avoid.y)) < minD) continue;
    return {x, y};
  }
  return {x:rnd(W, 0, WW), y:rnd(W, 0, WW)};
}
function newAsteroid(W){
  const p = randomSpot(W, null, 0), pts = [];
  for (let k = 0; k < 9; k++) pts.push(rnd(W, 0.7, 1.1));
  return {x:p.x, y:p.y, vx:rnd(W, -50, 50), vy:rnd(W, -50, 50), r:rnd(W, 12, 22), rot:rnd(W, 0, 6.28), vr:rnd(W, -1.5, 1.5), pts, alive:true, respawn:0};
}
function createWorld(o){
  o = o || {};
  const seed = (o.seed >>> 0) || 1;
  const W = {rng:mulberry(seed), seed, phys:Object.assign({}, DEFAULT_PHYS, o.phys || {}), over:o.ships || {},
    planet:o.planet !== false, diff:o.diff || ['normal', 'normal'], time:0, ships:[null, null],
    shots:[], fighters:[], pods:[], asteroids:[], beams:[], events:[],
    // per-side damage dealt by source; 'planet' is damage taken; 'steal' is crew stolen by song
    stats:[{fire:0, spec:0, fighter:0, planet:0, steal:0, pick:0}, {fire:0, spec:0, fighter:0, planet:0, steal:0, pick:0}]};
  const na = o.asteroids !== undefined ? o.asteroids : W.phys.asteroids;
  for (let k = 0; k < Math.round(na); k++) W.asteroids.push(newAsteroid(W));
  return W;
}
function placeShip(W, s, enemy){
  const p = randomSpot(W, enemy, 700);
  s.x = p.x; s.y = p.y; s.vx = s.vy = 0;
  s.a = enemy ? Math.atan2(wd(enemy.y, s.y), wd(enemy.x, s.x)) : Math.atan2(wd(PY, s.y), wd(PX, s.x));
}
function spawn(W, side, ti){
  const d = SHIPS[ti], p = effP(d, W.over);
  p.crewMax = Math.max(p.crewMax, p.crew);
  const s = {side, ti, def:d, p, x:0, y:0, vx:0, vy:0, a:0, crew:p.crew, batt:p.batt, regenT:0, cdF:0, cdS:0, hitCd:0,
    alive:true, cloak:false, armed:0, inv:0.8, prevS:false, thr:false,
    ai:{t:0, desA:0, thrust:false, fire:false, pulse:false, lx:PX, ly:PY, lvx:0, lvy:0}};
  placeShip(W, s, other(W, side));
  W.ships[side] = s;
  emit(W, 'ring', {x:s.x, y:s.y, side}); emit(W, 'sfx', {name:'warp'});
  return s;
}

// ---------- оружие ----------
function pay(s, c){ if (s.batt < c) return false; s.batt -= c; return true; }
function shoot(W, s, o){
  const a = s.a + (o.ang || 0), off = s.def.r + (o.r || 3) + 2;
  W.shots.push({x:wrapW(s.x + Math.cos(a) * off), y:wrapW(s.y + Math.sin(a) * off),
    vx:Math.cos(a) * o.speed + (o.inherit ? s.vx : 0), vy:Math.sin(a) * o.speed + (o.inherit ? s.vy : 0),
    a, spd:o.speed, acc:o.acc || 0, vmax:o.vmax || o.speed, homing:o.homing || 0,
    dmg:o.dmg, life:o.life, max:o.life, r:o.r || 3, kind:o.kind, col:o.col, side:s.side, age:0, src:o.src || 'fire'});
}
function beam(W, x1, y1, x2, y2, col){ W.beams.push({x1, y1, x2, y2, col, t:0.09}); }
function doFire(W, s){
  const p = s.p;
  switch (s.def.id) {
    case 'bastion':
      if (!pay(s, p.fCost)) return false;
      shoot(W, s, {speed:150, acc:450, vmax:p.fSpd, homing:p.homing * DEG, dmg:p.fDmg, life:p.fLife, r:5, kind:'nuke', col:'#ffd23f'});
      emit(W, 'sfx', {name:'shot'}); return true;
    case 'leviathan':
      if (!pay(s, p.fCost)) return false;
      shoot(W, s, {speed:p.fSpd, dmg:p.fDmg, life:p.fLife, r:6, kind:'bolt', col:'#7fff7f', inherit:true});
      emit(W, 'sfx', {name:'shot'}); emit(W, 'shake', {v:3}); return true;
    case 'hare':
      if (!pay(s, p.fCost)) return false;
      shoot(W, s, {speed:p.fSpd, dmg:p.fDmg, life:p.fLife, r:2.5, kind:'bolt', col:'#fff', inherit:true});
      emit(W, 'sfx', {name:'gun'}); return true;
    case 'wraith':
      if (!pay(s, p.fCost)) return false;
      s.cloak = false;
      shoot(W, s, {speed:p.fSpd, ang:rnd(W, -0.12, 0.12), dmg:p.fDmg, life:p.fLife, r:6, kind:'flame', col:'#ff8030', inherit:true});
      emit(W, 'sfx', {name:'gun'}); return true;
    case 'blink': {
      const e = other(W, s.side); if (!e) return false;
      const d = dist2(e, s); if (d > p.fRange || (e.cloak && d > 90)) return false;
      if (!pay(s, p.fCost)) return false;
      beam(W, s.x, s.y, e.x, e.y, '#8ff'); damage(W, e, p.fDmg, 'fire'); emit(W, 'sfx', {name:'laser'}); return true;
    }
    case 'sting':
      if (!pay(s, p.fCost)) return false;
      shoot(W, s, {speed:p.fSpd, dmg:p.fDmg, life:p.fLife, r:2.5, kind:'bolt', col:'#ff6', inherit:true});
      emit(W, 'sfx', {name:'gun'}); return true;
    case 'siren':
      if (!pay(s, p.fCost)) return false;
      shoot(W, s, {speed:p.fSpd, dmg:p.fDmg, life:p.fLife, r:3, kind:'bolt', col:'#f6f', inherit:true});
      emit(W, 'sfx', {name:'gun'}); return true;
    case 'parrot':
      if (!pay(s, p.fCost)) return false;
      for (const ang of [0, Math.PI / 2, -Math.PI / 2]) shoot(W, s, {speed:p.fSpd, ang, dmg:p.fDmg, life:p.fLife, r:2.5, kind:'bolt', col:'#ffb040', inherit:true});
      emit(W, 'sfx', {name:'gun'}); return true;
  }
  return false;
}
function doSpec(W, s){
  const p = s.p, e = other(W, s.side);
  switch (s.def.id) {
    case 'bastion': {
      let best = null, bd = p.sRange, kind = null;
      for (const sh of W.shots) if (sh.side !== s.side) { const d = dist2(sh, s); if (d < bd) { bd = d; best = sh; kind = 'shot'; } }
      for (const f of W.fighters) if (f.side !== s.side) { const d = dist2(f, s); if (d < bd) { bd = d; best = f; kind = 'fighter'; } }
      if (!best && e && dist2(e, s) < p.sRange && !e.cloak) { best = e; kind = 'ship'; }
      if (!best || !pay(s, p.sCost)) return false;
      beam(W, s.x, s.y, best.x, best.y, '#fff');
      if (kind === 'shot') { W.shots.splice(W.shots.indexOf(best), 1); emit(W, 'sparks', {x:best.x, y:best.y, n:8, col:'#fff'}); }
      else if (kind === 'fighter') { W.fighters.splice(W.fighters.indexOf(best), 1); emit(W, 'boom', {x:best.x, y:best.y, R:14}); }
      else damage(W, best, p.sDmg, 'spec');
      emit(W, 'sfx', {name:'laser'}); return true;
    }
    case 'leviathan': {
      const n = Math.round(p.fighters);
      if (s.crew <= n + 1 || W.fighters.filter(f => f.mother === s).length >= 12 || !pay(s, p.sCost)) return false;
      s.crew -= n;
      for (let k = 0; k < n; k++) {
        const sg = k % 2 ? -1 : 1, a = s.a + Math.PI + sg * (0.5 + 0.25 * Math.floor(k / 2));
        W.fighters.push({x:wrapW(s.x + Math.cos(a) * (s.def.r + 6)), y:wrapW(s.y + Math.sin(a) * (s.def.r + 6)), a:s.a, side:s.side, mother:s, life:p.fighterLife, dmg:p.fighterDmg, cd:0.3});
      }
      emit(W, 'sfx', {name:'shield'}); return true;
    }
    case 'hare':
      if (!pay(s, p.sCost)) return false;
      shoot(W, s, {speed:200, acc:300, vmax:p.sSpd, ang:Math.PI, homing:p.homing * DEG, dmg:p.sDmg, life:p.sLife, r:4, kind:'missile', col:'#9f9', src:'spec'});
      emit(W, 'sfx', {name:'shot'}); return true;
    case 'wraith':
      if (s.cloak) { s.cloak = false; return true; }
      if (!pay(s, p.sCost)) return false;
      s.cloak = true; emit(W, 'sfx', {name:'shield'}); return true;
    case 'blink': {
      if (!pay(s, p.sCost)) return false;
      emit(W, 'ring', {x:s.x, y:s.y, col:'#8ff'});
      const q = randomSpot(W, e, 200); s.x = q.x; s.y = q.y;
      emit(W, 'ring', {x:s.x, y:s.y, col:'#8ff'}); emit(W, 'sfx', {name:'warp'}); return true;
    }
    case 'sting':
      if (s.armed <= 0) { s.armed = 1.6; emit(W, 'sfx', {name:'beep'}); return true; }
      glory(W, s); return true;
    case 'siren': {
      if (!e || e.crew <= 1 || dist2(e, s) > p.sRange || !pay(s, p.sCost)) return false;
      const lo = Math.round(p.stealMin), hi = Math.max(lo, Math.round(p.stealMax));
      const steal = Math.min(e.crew - 1, irnd(W, lo, hi));
      e.crew -= steal; W.stats[s.side].steal += steal;
      for (let k = 0; k < steal; k++) {
        const a = rnd(W, 0, 6.283), sp = rnd(W, 60, 150);
        // spawn just outside the victim's hull; the victim cannot re-collect its own crew for a moment
        W.pods.push({x:wrapW(e.x + Math.cos(a) * (e.def.r + 10)), y:wrapW(e.y + Math.sin(a) * (e.def.r + 10)),
          vx:Math.cos(a) * sp + e.vx * 0.4, vy:Math.sin(a) * sp + e.vy * 0.4, life:9, from:e.side, grace:1.2});
      }
      emit(W, 'ring', {x:s.x, y:s.y, col:'#f8f'}); emit(W, 'sfx', {name:'shield'}); return true;
    }
    case 'parrot':
      s.batt = Math.min(p.batt, s.batt + p.insultGain);
      emit(W, 'bubble', {side:s.side, text:INSULTS[irnd(W, 0, INSULTS.length - 1)]});
      return true;
  }
  return false;
}
function glory(W, s){
  const R = s.p.gloryR;
  emit(W, 'boom', {x:s.x, y:s.y, R:90}); emit(W, 'ring', {x:s.x, y:s.y, col:'#ff8'});
  emit(W, 'shake', {v:20}); emit(W, 'sfx', {name:'nuke'});
  const e = other(W, s.side);
  if (e) { const d = dist2(e, s); if (d < R) damage(W, e, Math.max(1, Math.round(s.p.gloryDmg * (1 - d / R))), 'spec'); }
  for (let i = W.fighters.length - 1; i >= 0; i--) if (W.fighters[i].side !== s.side && dist2(W.fighters[i], s) < R) W.fighters.splice(i, 1);
  s.crew = 0; shipDie(W, s, true);
}
function damage(W, s, dmg, src){
  if (!s || !s.alive || s.inv > 0 || dmg <= 0) return;
  // bench accounting: credited to the opponent by source; planet hits are counted as taken by the victim
  const st = src === 'planet' ? W.stats[s.side] : W.stats[1 - s.side];
  if (src && st) st[src] = (st[src] || 0) + Math.min(dmg, s.crew);
  s.crew -= dmg;
  emit(W, 'sparks', {x:s.x, y:s.y, n:5, col:'#fff'});
  if (s.crew <= 0) { s.crew = 0; shipDie(W, s); }
  else if (dmg >= 2 || W.rng() < 0.3) emit(W, 'sfx', {name:'hurt'});
}
function shipDie(W, s, noRebirth){
  if (!s.alive) return;
  if (!noRebirth && s.def.id === 'parrot' && W.rng() * 100 < s.p.rebirth) {
    s.crew = s.p.crewMax; s.batt = s.p.batt; s.inv = 1;
    emit(W, 'ring', {x:s.x, y:s.y, col:'#fb4'});
    placeShip(W, s, other(W, s.side));
    emit(W, 'ring', {x:s.x, y:s.y, col:'#fb4'});
    emit(W, 'msg', {text:'Попугай ПЕРЕРОДИЛСЯ!', side:s.side}); emit(W, 'sfx', {name:'warp'});
    return;
  }
  s.alive = false;
  emit(W, 'boom', {x:s.x, y:s.y, R:70}); emit(W, 'debris', {x:s.x, y:s.y, side:s.side});
  emit(W, 'sfx', {name:'nuke'}); emit(W, 'sfx', {name:'death'}); emit(W, 'shake', {v:14});
  for (let i = W.fighters.length - 1; i >= 0; i--) if (W.fighters[i].mother === s) { emit(W, 'boom', {x:W.fighters[i].x, y:W.fighters[i].y, R:12}); W.fighters.splice(i, 1); }
  emit(W, 'death', {side:s.side});
}

// ---------- физика ----------
function updateShip(W, s, c, dt){
  if (!s.alive) return;
  const d = s.def, p = s.p, ph = W.phys;
  s.inv = Math.max(0, s.inv - dt); s.cdF -= dt; s.cdS -= dt; s.hitCd -= dt;
  if (s.armed > 0) { s.armed -= dt; if (s.armed < 0) s.armed = 0; }
  if (c.l) s.a -= p.turn * DEG * dt;
  if (c.r) s.a += p.turn * DEG * dt;
  s.thr = !!c.t;
  if (d.id === 'blink') {
    if (c.t) { s.vx = Math.cos(s.a) * p.vmax; s.vy = Math.sin(s.a) * p.vmax; }
    else { const k = Math.exp(-6 * dt); s.vx *= k; s.vy *= k; }
  } else if (c.t) {
    const s0 = Math.hypot(s.vx, s.vy);
    s.vx += Math.cos(s.a) * p.thrust * dt; s.vy += Math.sin(s.a) * p.thrust * dt;
    const s1 = Math.hypot(s.vx, s.vy);
    if (s1 > p.vmax && s1 > s0) { const k = Math.max(p.vmax, s0) / s1; s.vx *= k; s.vy *= k; }
  }
  let inWell = false;
  if (W.planet) {
    const pdx = wd(s.x, PX), pdy = wd(s.y, PY), pd = Math.hypot(pdx, pdy);
    if (!d.noGrav && pd < ph.gRange && pd > 1 && ph.gravity > 0) {
      inWell = true;
      const vr = (pdx * s.vx + pdy * s.vy) / pd, gk = ph.gravity / 100;
      const g = Math.min(520 * gk, 9e6 * gk / (pd * pd)) * (vr > 0 ? ph.slingOut / 100 : 1);
      s.vx -= pdx / pd * g * dt; s.vy -= pdy / pd * g * dt;
    }
    if (pd < PR + d.r) {
      const nx = pdx / pd, ny = pdy / pd;
      s.x = wrapW(PX + nx * (PR + d.r + 0.5)); s.y = wrapW(PY + ny * (PR + d.r + 0.5));
      const vn = s.vx * nx + s.vy * ny;
      if (vn < 0) { s.vx -= 1.8 * vn * nx; s.vy -= 1.8 * vn * ny; }
      if (s.hitCd <= 0) { s.hitCd = 0.5; damage(W, s, ph.planetDmg, 'planet'); emit(W, 'sfx', {name:'dirt'}); }
    }
  }
  if (d.id !== 'blink') {
    const sp = Math.hypot(s.vx, s.vy), cap = p.vmax * ph.overCap / 100;
    if (sp > cap) { s.vx *= cap / sp; s.vy *= cap / sp; }
    else if (sp > p.vmax && !inWell) { const k = Math.max(0, 1 - ph.decay / 100 * dt); s.vx *= k; s.vy *= k; }
  }
  s.x = wrapW(s.x + s.vx * dt); s.y = wrapW(s.y + s.vy * dt);
  if (!s.alive) return;
  s.regenT += dt;
  while (s.regenT >= p.regen) { s.regenT -= p.regen; if (!(d.id === 'wraith' && s.cloak)) s.batt = Math.min(p.batt, s.batt + 1); }
  if (c.f && s.cdF <= 0 && doFire(W, s)) s.cdF = p.fCd;
  const edge = c.s && !s.prevS; s.prevS = !!c.s;
  if (c.s && s.cdS <= 0 && (!d.edge || edge) && s.alive && doSpec(W, s)) s.cdS = p.sCd || 0;
}
function collideShips(W){
  const a = W.ships[0], b = W.ships[1];
  if (!a || !b || !a.alive || !b.alive) return;
  const dx = wd(b.x, a.x), dy = wd(b.y, a.y), d = Math.hypot(dx, dy), R = a.def.r + b.def.r;
  if (d >= R || d < 0.01) return;
  const nx = dx / d, ny = dy / d, ov = R - d, ma = a.p.mass, mb = b.p.mass;
  a.x = wrapW(a.x - nx * ov * mb / (ma + mb)); a.y = wrapW(a.y - ny * ov * mb / (ma + mb));
  b.x = wrapW(b.x + nx * ov * ma / (ma + mb)); b.y = wrapW(b.y + ny * ov * ma / (ma + mb));
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const j = -(1 + 0.9) * rv / (1 / ma + 1 / mb);
    a.vx -= j * nx / ma; a.vy -= j * ny / ma; b.vx += j * nx / mb; b.vy += j * ny / mb;
    emit(W, 'sfx', {name:'dirt'});
  }
}
function updateWorld(W, dt){
  for (let i = W.shots.length - 1; i >= 0; i--) {
    const sh = W.shots[i];
    sh.age += dt; sh.life -= dt;
    if (sh.homing || sh.acc) {
      sh.spd = Math.min(sh.vmax, sh.spd + sh.acc * dt);
      if (sh.homing) {
        const t = other(W, sh.side);
        if (t && !t.cloak) sh.a += clamp(angDiff(Math.atan2(wd(t.y, sh.y), wd(t.x, sh.x)), sh.a), -sh.homing * dt, sh.homing * dt);
      }
      sh.vx = Math.cos(sh.a) * sh.spd; sh.vy = Math.sin(sh.a) * sh.spd;
    }
    sh.x = wrapW(sh.x + sh.vx * dt); sh.y = wrapW(sh.y + sh.vy * dt);
    let dead = sh.life <= 0;
    const e = other(W, sh.side);
    if (!dead && e && dist2(sh, e) < e.def.r + sh.r) {
      damage(W, e, sh.dmg, sh.src); dead = true;
      if (sh.kind === 'nuke' || sh.kind === 'missile') { emit(W, 'boom', {x:sh.x, y:sh.y, R:26}); emit(W, 'sfx', {name:'boom'}); }
    }
    if (!dead) for (let j = W.fighters.length - 1; j >= 0; j--) {
      const f = W.fighters[j];
      if (f.side !== sh.side && dist2(sh, f) < 7 + sh.r) { emit(W, 'boom', {x:f.x, y:f.y, R:12}); W.fighters.splice(j, 1); dead = true; break; }
    }
    if (!dead) for (const a of W.asteroids) {
      if (a.alive && dist2(sh, a) < a.r + sh.r) {
        a.alive = false; a.respawn = 5; dead = true;
        emit(W, 'debris', {x:a.x, y:a.y, col:'#987'}); emit(W, 'sfx', {name:'dirt'}); break;
      }
    }
    if (!dead && W.planet && Math.hypot(wd(sh.x, PX), wd(sh.y, PY)) < PR) { dead = true; emit(W, 'sparks', {x:sh.x, y:sh.y, n:4, col:sh.col}); }
    if (dead) W.shots.splice(i, 1);
  }
  for (const f of W.fighters.slice()) {
    if (W.fighters.indexOf(f) < 0) continue;       // уже удалён (сбит или погиб вместе с носителем)
    const mom = f.mother, drop = () => { const k = W.fighters.indexOf(f); if (k >= 0) W.fighters.splice(k, 1); };
    if (!mom.alive) { drop(); continue; }
    f.life -= dt; f.cd -= dt;
    const e = other(W, f.side), back = f.life <= 0 || !e || e.cloak, tgt = back ? mom : e;
    const dx = wd(tgt.x, f.x), dy = wd(tgt.y, f.y), d = Math.hypot(dx, dy);
    let des = Math.atan2(dy, dx);
    if (!back && d < 110) des += Math.PI / 2;
    f.a += clamp(angDiff(des, f.a), -5 * dt, 5 * dt);
    f.x = wrapW(f.x + Math.cos(f.a) * 300 * dt); f.y = wrapW(f.y + Math.sin(f.a) * 300 * dt);
    if (!back && d < 150 && f.cd <= 0) { f.cd = 0.45; beam(W, f.x, f.y, e.x, e.y, '#f88'); damage(W, e, f.dmg, 'fighter'); }
    if (back && d < mom.def.r + 6) { mom.crew = Math.min(mom.p.crewMax, mom.crew + 1); drop(); }
  }
  for (let i = W.pods.length - 1; i >= 0; i--) {
    const q = W.pods[i];
    q.life -= dt; q.grace = (q.grace || 0) - dt; q.vx *= 1 - 0.6 * dt; q.vy *= 1 - 0.6 * dt;
    // Siren crew magnet: pods inside magnetR accelerate toward the magnet ship
    for (const s of W.ships) {
      if (!s || !s.alive || !s.p.magnetF) continue;
      const dx = wd(s.x, q.x), dy = wd(s.y, q.y), d = Math.hypot(dx, dy);
      if (d < s.p.magnetR && d > 1) { q.vx += dx / d * s.p.magnetF * dt; q.vy += dy / d * s.p.magnetF * dt; }
    }
    q.x = wrapW(q.x + q.vx * dt); q.y = wrapW(q.y + q.vy * dt);
    let got = false;
    for (const s of W.ships) if (s && s.alive && dist2(q, s) < s.def.r + 8 && !(q.grace > 0 && s.side === q.from)) { if (s.crew < s.p.crewMax) { s.crew++; W.stats[s.side].pick++; } got = true; emit(W, 'sfx', {name:'shield'}); break; }
    if (got || q.life <= 0) W.pods.splice(i, 1);
  }
  for (let i = 0; i < W.asteroids.length; i++) {
    const a = W.asteroids[i];
    if (!a.alive) {
      a.respawn -= dt;
      if (a.respawn <= 0) { const na = newAsteroid(W); if (W.ships.every(s => !s || !s.alive || dist2(na, s) > 300)) W.asteroids[i] = na; }
      continue;
    }
    a.x = wrapW(a.x + a.vx * dt); a.y = wrapW(a.y + a.vy * dt); a.rot += a.vr * dt;
    for (const s of W.ships) {
      if (!s || !s.alive) continue;
      const dx = wd(s.x, a.x), dy = wd(s.y, a.y), d = Math.hypot(dx, dy), R = a.r + s.def.r;
      if (d < R && d > 0.01) {
        const nx = dx / d, ny = dy / d;
        s.x = wrapW(a.x + nx * (R + 0.5)); s.y = wrapW(a.y + ny * (R + 0.5));
        const vn = (s.vx - a.vx) * nx + (s.vy - a.vy) * ny;
        if (vn < 0) { s.vx -= 1.6 * vn * nx; s.vy -= 1.6 * vn * ny; a.vx += 0.3 * vn * nx; a.vy += 0.3 * vn * ny; emit(W, 'sfx', {name:'dirt'}); }
      }
    }
  }
  for (let i = W.beams.length - 1; i >= 0; i--) { W.beams[i].t -= dt; if (W.beams[i].t <= 0) W.beams.splice(i, 1); }
}

// ---------- ИИ ----------
function threatNear(W, s, R){
  for (const sh of W.shots) if (sh.side !== s.side && dist2(sh, s) < R) return true;
  for (const f of W.fighters) if (f.side !== s.side && dist2(f, s) < R) return true;
  return false;
}
function aiThink(W, s, e, dt){
  const st = s.ai, P = AIP[W.diff[s.side]] || AIP.normal, d = s.def, p = s.p, id = d.id;
  st.t -= dt; if (st.t > 0) return;
  st.t = P.think * rnd(W, 0.7, 1.3);
  st.fire = false;
  const eAlive = !!(e && e.alive);
  if (eAlive && (!e.cloak || dist2(e, s) < 90)) { st.lx = e.x; st.ly = e.y; st.lvx = e.vx; st.lvy = e.vy; }
  const tx = eAlive ? st.lx : PX + 400, ty = eAlive ? st.ly : PY + 400;
  const dx = wd(tx, s.x), dy = wd(ty, s.y), dist = Math.hypot(dx, dy), angE = Math.atan2(dy, dx);
  // дальность и любимая дистанция — из текущих параметров, иначе правки INI ломают поведение ИИ
  const frange = id === 'blink' ? p.fRange : (p.fSpd && p.fLife ? p.fSpd * p.fLife : d.frange);
  const pref = d.pref > 0 ? Math.min(d.pref, frange * 0.8) : 0;
  const tl = Math.min(1.5, dist / (p.fSpd || 9999));
  const aimA = Math.atan2(dy + (st.lvy - s.vy) * tl, dx + (st.lvx - s.vx) * tl);
  let desA = aimA, thrust = false;
  if (id === 'hare' && eAlive && dist < 460) { desA = angE + Math.PI; thrust = dist < 330; }
  // approach until inside both the preferred distance and the real weapon range (never park out of range)
  else if (dist > Math.min(pref * 1.15 + 40, frange * 0.95)) thrust = Math.abs(angDiff(desA, s.a)) < 0.7;
  else if (pref > 150 && dist < pref * 0.6) { desA = angE + Math.PI * 0.6; thrust = true; }
  if (id === 'siren' && W.pods.length) {
    // pods inside the magnet come by themselves; fetch only far ones that are not in the enemy's face
    let best = null, bd = 600;
    for (const q of W.pods) {
      const pd = dist2(q, s);
      if (pd < (p.magnetR || 0) || (eAlive && dist2(q, e) < 150)) continue;
      if (pd < bd) { bd = pd; best = q; }
    }
    if (best) { desA = Math.atan2(wd(best.y, s.y), wd(best.x, s.x)); thrust = Math.abs(angDiff(desA, s.a)) < 0.8; }
  }
  if (W.planet) {
    const pdx = wd(s.x, PX), pdy = wd(s.y, PY), pd = Math.hypot(pdx, pdy);
    const vin = -(pdx * s.vx + pdy * s.vy) / Math.max(1, pd);
    if (pd < PR + d.r + 140 || (pd < PR + 400 && vin > 150)) {
      const tang = Math.sign(pdx * s.vy - pdy * s.vx) || 1;
      desA = Math.atan2(pdy, pdx) + tang * 0.7; thrust = true;
    }
  }
  st.desA = desA; st.thrust = thrust;
  if (!eAlive) return;
  const err = Math.abs(angDiff(aimA, s.a));
  if (err < P.aim && dist < frange && W.rng() < P.fire) st.fire = true;
  if (id === 'blink') st.fire = dist < frange - 5 && W.rng() < P.fire;
  if (id === 'wraith') st.fire = st.fire && dist < frange;
  const ps = P.spec;
  let spec = false;
  switch (id) {
    case 'bastion': spec = threatNear(W, s, p.sRange) && W.rng() < ps; break;
    case 'leviathan': spec = dist > 250 && dist < 800 && s.crew > p.fighters + 10 && s.batt >= p.sCost && W.rng() < 0.25 * ps; break;
    case 'hare': spec = Math.abs(angDiff(angE, s.a + Math.PI)) < 0.7 && dist < 520 && W.rng() < ps; break;
    case 'wraith': spec = !s.cloak && dist > 380 && s.batt >= p.sCost * 2 && W.rng() < 0.5 * ps; break;
    case 'blink': spec = (threatNear(W, s, 110) || (s.crew <= 2 && dist < 200)) && W.rng() < ps * 0.7; break;
    case 'sting': spec = dist < p.gloryR * 0.55 && W.rng() < ps; break;
    case 'siren': spec = dist < p.sRange * 0.95 && e.crew > 1 && s.batt >= p.sCost && W.rng() < 0.6 * ps; break;
    case 'parrot': spec = s.batt < p.fCost * 3 && W.rng() < ps; break;
  }
  if (spec) st.pulse = true;
}
function aiCtl(W, s, e, dt){
  aiThink(W, s, e, dt);
  const st = s.ai, d = angDiff(st.desA, s.a);
  const c = {l:d < -0.04, r:d > 0.04, t:st.thrust, f:st.fire, s:st.pulse};
  st.pulse = false;
  return c;
}

// ---------- шаг ----------
// ctls: [c0, c1] — управление людей {l,r,t,f,s}; null (или отсутствие) — сторону ведёт ИИ
function step(W, ctls){
  W.time += DT;
  for (let side = 0; side < 2; side++) {
    const s = W.ships[side]; if (!s || !s.alive) continue;
    const c = ctls && ctls[side] ? ctls[side] : aiCtl(W, s, other(W, side), DT);
    updateShip(W, s, c, DT);
  }
  collideShips(W);
  updateWorld(W, DT);
}

return {VERSION, WW, PX, PY, PR, DT, DEG, clamp, wd, wrapW, angDiff, dist2, mulberry,
  LABELS, RANGES, COMMON, SHIPS, INSULTS, AIP, PHYS_UI, DEFAULT_PHYS,
  effP, shipKeys, fmt, parseIni, createWorld, spawn, placeShip, other, step};
});
