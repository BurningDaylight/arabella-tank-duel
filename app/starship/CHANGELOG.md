# Журнал движка «Звёздной схватки»

Версия — константа `VERSION` в `engine.js`. Поднимать при любом изменении логики
боя, физики или ИИ (мажор — механики несовместимы, минор — новые механики и корабли,
патч — исправления). Стенд дополнительно хранит хеш файла движка и коммит.

## 2.5.0
- Ship `cost` (fleet points) as a regular ship param (editor, INI). No effect on combat.
  Provisional defaults; fair costs come from `tools/melee-bench/costs.mjs`.

## 2.4.0
- Planner objective is now tiered (`PLAN.mode = 'tiered'`, default): never die for nothing, then win and survive,
  mutual kill only when weaker, then max damage with an acceptable trade (`PLAN.tradeW` 0.8), then close to
  the preferred distance. The old weighted score stays as `PLAN.mode = 'weighted'` (identical to 2.3.2).
  Fixes planner stalls where every even trade scored negative (Blink vs Blink).

## 2.3.2
- Planner: engagement pressure grows with fight time (`PLAN.pressT`, x2 at 20 s, x3 at 40 s) to stop
  planner-vs-planner stalls (2.3.1: Blink timed out in 75% of fights).
- Planner: no simulation while the enemy is farther than `PLAN.farD` (1400); the rule AI drives the approach.

## 2.3.1
- Planner: symmetric decisions (both sides plan at the start of a tick on the same world; 2.3.0 let side 1 see
  side 0's move of the current tick).
- Planner: engagement shaping (`PLAN.distW`) toward the preferred distance and loss weight 1.3 → 1.1 (`PLAN.lossW`)
  to break planner-vs-planner stalls. Rule AI unchanged.

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
