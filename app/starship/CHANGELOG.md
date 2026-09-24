# Журнал движка «Звёздной схватки»

Версия — константа `VERSION` в `engine.js`. Поднимать при любом изменении логики
боя, физики или ИИ (мажор — механики несовместимы, минор — новые механики и корабли,
патч — исправления). Стенд дополнительно хранит хеш файла движка и коммит.

## 2.3.0
- Planner AI: every 0.3 s tries 10 manoeuvres on cloned worlds for 1.2 s and picks the best by crew exchange.
  Opt-in per side: `createWorld({ai:['planner', 'rule']})`; the rule AI stays the default.
- World RNG state moved to `W.rs` (same mulberry32 sequence: rule-AI results are unchanged), `cloneWorld()`,
  quiet worlds emit no events.

## 2.2.0
- Wraith cloak rework: while cloaked the ship is immune to all weapons (shots pass through; Blink laser, Siren song,
  fighters and Sting glory do nothing); the planet still hurts.
- Cloak drains battery (`cloakDrain`, default 1.5/s); at zero battery the ship drops out of the shadow.
- Ambush: for `ambushT` s (default 0.8) after leaving the shadow the flamer deals `ambushMul` x damage (default 2).
- AI does not fire at a cloaked target.

## 2.1.0
- Siren crew magnet: pods within `magnetR` (default 420) accelerate toward her at `magnetF` (default 260).
  Both are tunable ship params (game UI and INI).
- Siren AI no longer chases pods the magnet will bring anyway, nor pods sitting next to the enemy.

## 2.0.4
- Fix: Siren song pods spawned inside the victim's hull, so the victim re-collected its own crew on the next step
  and the song did almost nothing. Pods now spawn outside the hull; the victim cannot pick them up for 1.2 s.
- Bench stats: crew picked up per side (`pick`).

## 2.0.3
- AI never parks outside its own weapon range: approach distance is capped by the actual weapon range
  (2.0.2 still let Blink hover at ~205 with a 180 laser, producing timeouts).
- Per-source damage accounting in `W.stats` (fire / spec / fighter / planet taken / crew stolen) for the bench.
  No gameplay change.

## 2.0.2
- ИИ берёт дальность оружия и любимую дистанцию из текущих параметров
  (раньше были зашиты: урезанная в INI дальность Блинка приводила к ничьим по таймауту).

## 2.0.1
- Исправлен вылет, когда истребитель добивал Левиафана-носителя истребителей
  (список истребителей менялся во время перебора).

## 2.0.0
- Логика вынесена из `starship-duel.html` в `starship/engine.js`: без DOM и звука,
  ГСЧ с сидом, звук и эффекты — через события.
