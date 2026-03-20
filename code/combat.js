import { GAME_CONFIG } from "../configs/game.config.js";
import { TRAIT_BONUS } from "../configs/units.config.js";
import { clamp, randInt } from "./utils.js";

const COLS = GAME_CONFIG.board.cols;
const ROWS = GAME_CONFIG.board.rows;

function calcTraitCounts(roster) {
  const counts = {};
  for (const u of roster) {
    for (const t of u.trait || []) {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}

function calcTeamTraitMultipliers(roster, bonuses) {
  const traitCounts = calcTraitCounts(roster);
  let traitHpPct = 0;
  let traitAtkPct = 0;
  for (const t of Object.keys(traitCounts)) {
    const conf = TRAIT_BONUS[t];
    if (!conf) continue;
    const minus = bonuses.traitNeedMinus?.[t] || 0;
    if (traitCounts[t] >= conf.need - minus) {
      traitHpPct += conf.bonus.hpPct || 0;
      traitAtkPct += conf.bonus.atkPct || 0;
    }
  }
  return { traitHpPct, traitAtkPct };
}

function slotToCR(slot) {
  return { col: slot % COLS, row: Math.floor(slot / COLS) };
}

/**
 * 从棋盘构建带站位的战斗单位（我方 row 大=前排贴近中线）
 */
export function buildPlayerCombatUnits(state, bonuses) {
  const activeIds = state.boardSlots.map((id, idx) => (id ? { id, slot: idx } : null)).filter(Boolean);
  const roster = activeIds
    .map(({ id, slot }) => {
      const u = state.roster.find((x) => x.instanceId === id);
      if (!u) return null;
      const { col, row } = slotToCR(slot);
      return { unit: u, col, row, slot };
    })
    .filter(Boolean);

  if (!roster.length) {
    const fb = state.roster.slice(0, 4).map((u, i) => ({
      unit: u,
      col: Math.min(6, i + 1),
      row: ROWS - 1,
      slot: -1,
    }));
    return hydrateLineup(fb, bonuses);
  }

  return hydrateLineup(roster, bonuses);
}

function hydrateLineup(entries, bonuses) {
  const raw = entries.map((e) => e.unit);
  const { traitHpPct, traitAtkPct } = calcTeamTraitMultipliers(raw, bonuses);
  const gh = bonuses.globalHpPct || 0;
  const ga = bonuses.globalAtkPct || 0;

  return entries.map((e) => {
    const u = e.unit;
    const hpM = 1 + traitHpPct + gh;
    const atkM = 1 + traitAtkPct + ga;
    const maxHp = Math.max(1, Math.round(u.hp * hpM));
    const atk = Math.max(1, Math.round(u.atk * atkM));
    return {
      instanceId: u.instanceId,
      name: u.displayName || u.name,
      col: e.col,
      row: e.row,
      role: u.role || "midline",
      trait: u.trait || [],
      star: u.star || 1,
      hp: maxHp,
      maxHp,
      atk,
      image: u.image,
      sprite: u.sprite || u.icon,
    };
  });
}

function pickEnemyTarget(attacker, enemies, playerUnits) {
  const alive = enemies.filter((x) => x.hp > 0);
  if (!alive.length) return null;

  if (attacker.role === "backline" && (attacker.trait || []).includes("assassin")) {
    const backs = alive.filter((e) => e.row >= 1);
    const pool = backs.length ? backs : alive;
    return pool.reduce((a, b) => (a.hp <= b.hp ? a : b));
  }

  if (attacker.role === "frontline") {
    const front = alive.filter((e) => e.row === 0);
    const sameCol = (front.length ? front : alive).filter((e) => e.col === attacker.col);
    if (sameCol.length) return sameCol.reduce((a, b) => (a.hp <= b.hp ? a : b));
    const near = alive.filter((e) => Math.abs(e.col - attacker.col) <= 1);
    const pool = near.length ? near : alive;
    return pool.reduce((a, b) => (a.row <= b.row ? a : b));
  }

  const front = alive.filter((e) => e.row === 0);
  const pool = front.length ? front : alive;
  return pool.reduce((a, b) => (a.hp <= b.hp ? a : b));
}

function pickPlayerTarget(attacker, players) {
  const alive = players.filter((x) => x.hp > 0);
  if (!alive.length) return null;

  if (attacker.role === "backline" && (attacker.trait || []).includes("assassin")) {
    const backs = alive.filter((p) => p.row <= 1);
    const pool = backs.length ? backs : alive;
    return pool.reduce((a, b) => (a.hp <= b.hp ? a : b));
  }

  const front = alive.filter((p) => p.row >= ROWS - 1);
  const sameCol = (front.length ? front : alive).filter((p) => p.col === attacker.col);
  if (sameCol.length) return sameCol.reduce((a, b) => (a.hp <= b.hp ? a : b));
  const near = alive.filter((p) => Math.abs(p.col - attacker.col) <= 1);
  const pool = near.length ? near : alive;
  return pool.reduce((a, b) => (b.row >= a.row ? b : a));
}

function positionMitigation(target, isPlayerUnit) {
  if (isPlayerUnit && target.role === "frontline" && target.row >= ROWS - 1) return 0.88;
  if (!isPlayerUnit && target.role === "frontline" && target.row === 0) return 0.88;
  if (isPlayerUnit && target.role === "backline" && target.row <= 1) return 1.05;
  if (!isPlayerUnit && target.role === "backline" && target.row >= 1) return 1.05;
  return 1;
}

function rangePenalty(attacker, target, isPlayerAttacker) {
  const ar = attacker.row;
  const tr = target.row;
  if (isPlayerAttacker) {
    const depth = tr <= 1 ? 0 : 1;
    if (attacker.role === "backline" && depth === 0) return 0.82;
  } else {
    const depth = tr >= ROWS - 2 ? 0 : 1;
    if (attacker.role === "backline" && depth === 0) return 0.82;
  }
  return 1;
}

export function buildPveEnemyLineup(floor, towerNode = "combat") {
  const mult = towerNode === "boss" ? 1.35 : towerNode === "elite" ? 1.18 : 1;
  const baseHp = Math.round((95 + floor * 28 + Math.random() * 40) * mult);
  const baseAtk = Math.round((11 + floor * 3.2 + Math.random() * 5) * mult);
  const count = towerNode === "boss" ? 4 : towerNode === "elite" ? 5 : 6;
  const roles = ["frontline", "frontline", "midline", "backline", "backline", "assassin"];
  const sprites = ["👾", "💀", "🦂", "👹", "🧟", "🐍", "🕸️", "🔥"];
  const lineup = [];
  for (let i = 0; i < count; i += 1) {
    const col = Math.min(6, Math.max(0, i % 7));
    const row = i < 4 ? 0 : 1;
    const role = roles[i % roles.length];
    lineup.push({
      instanceId: `e_${floor}_${i}`,
      name: `塔怪 ${i + 1}`,
      col,
      row,
      role,
      trait: [],
      star: 1,
      hp: Math.round(baseHp * (0.75 + Math.random() * 0.35)),
      maxHp: Math.round(baseHp * (0.75 + Math.random() * 0.35)),
      atk: Math.round(baseAtk * (0.85 + Math.random() * 0.3)),
      image: null,
      sprite: sprites[i % sprites.length],
    });
  }
  for (const u of lineup) {
    u.maxHp = u.hp;
  }
  return lineup;
}

function totalHpSide(list) {
  return list.reduce((s, u) => s + Math.max(0, u.hp), 0);
}

function runPositionedBattle(playerUnits, enemyUnits, bonuses, maxRounds = 18) {
  const p = playerUnits.map((u) => ({ ...u }));
  const e = enemyUnits.map((u) => ({ ...u }));
  const timeline = [];
  const pPool = Math.max(1, Math.round(p.reduce((s, u) => s + u.maxHp, 0)));
  const ePool = Math.max(1, Math.round(e.reduce((s, u) => s + u.maxHp, 0)));

  const pushBar = (text, side) => {
    const pp = totalHpSide(p);
    const ee = totalHpSide(e);
    const pPct = pPool > 0 ? Math.round((pp / pPool) * 100) : 0;
    const ePct = ePool > 0 ? Math.round((ee / ePool) * 100) : 0;
    timeline.push({ side, text, playerHp: clamp(pPct, 0, 100), enemyHp: clamp(ePct, 0, 100) });
  };

  for (let r = 1; r <= maxRounds; r += 1) {
    const pAlive = p.filter((x) => x.hp > 0);
    const eAlive = e.filter((x) => x.hp > 0);
    if (!pAlive.length || !eAlive.length) break;

    const order = [...pAlive.map((x) => ({ u: x, side: "p" })), ...eAlive.map((x) => ({ u: x, side: "e" }))];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    for (const { u: atkU, side } of order) {
      if (atkU.hp <= 0) continue;
      if (side === "p") {
        const tgt = pickEnemyTarget(atkU, e, p);
        if (!tgt || tgt.hp <= 0) continue;
        let dmg = Math.max(1, Math.round(atkU.atk * (0.78 + Math.random() * 0.28)));
        dmg = Math.round(dmg * rangePenalty(atkU, tgt, true) * positionMitigation(tgt, false));
        tgt.hp = Math.max(0, tgt.hp - dmg);
        pushBar(`R${r} [${atkU.col},${atkU.row}] ${atkU.name} → 敌${tgt.col} ${tgt.name} -${dmg}`, "player");
      } else {
        const tgt = pickPlayerTarget(atkU, p);
        if (!tgt || tgt.hp <= 0) continue;
        let dmg = Math.max(1, Math.round(atkU.atk * (0.78 + Math.random() * 0.28)));
        dmg = Math.round(dmg * rangePenalty(atkU, tgt, false) * positionMitigation(tgt, true));
        tgt.hp = Math.max(0, tgt.hp - dmg);
        pushBar(`R${r} ${atkU.name} → [${tgt.col},${tgt.row}] ${tgt.name} -${dmg}`, "enemy");
      }

      if (bonuses.attackProcPct > 0 && side === "p" && Math.random() < bonuses.attackProcPct * 0.35) {
        const tgt2 = pickEnemyTarget(atkU, e.filter((x) => x.hp > 0), p);
        if (tgt2 && tgt2.hp > 0) {
          const proc = Math.max(2, Math.round(atkU.atk * 0.22));
          tgt2.hp = Math.max(0, tgt2.hp - proc);
          pushBar(`R${r} 背包联动 ${atkU.name} 追加 -${proc}`, "item");
        }
      }

      if (!e.some((x) => x.hp > 0) || !p.some((x) => x.hp > 0)) break;
    }

    if (bonuses.shieldProc > 0 && r === 2) {
      const heal = bonuses.shieldProc;
      for (const x of p) {
        if (x.hp > 0) x.hp = Math.min(x.maxHp, x.hp + Math.ceil(heal / Math.max(1, p.filter((z) => z.hp > 0).length)));
      }
      pushBar(`R${r} 背包护盾分流 +${heal}`, "item");
    }

    if (!e.some((x) => x.hp > 0) || !p.some((x) => x.hp > 0)) break;
  }

  const pSum = totalHpSide(p);
  const eSum = totalHpSide(e);
  const pAliveN = p.filter((x) => x.hp > 0).length;
  const eAliveN = e.filter((x) => x.hp > 0).length;
  let outcome;
  if (eAliveN === 0) outcome = true;
  else if (pAliveN === 0) outcome = false;
  else outcome = pSum > eSum || (pSum === eSum && pAliveN >= eAliveN);
  return {
    win: outcome,
    playerHp: clamp(Math.round((pSum / pPool) * 100), 0, 100),
    enemyHp: clamp(Math.round((eSum / ePool) * 100), 0, 100),
    timeline,
    teamPower: Math.round(p.reduce((s, u) => s + u.atk * 1.4 + u.maxHp * 0.45, 0)),
    enemyPower: Math.round(e.reduce((s, u) => s + u.atk * 1.4 + u.maxHp * 0.45, 0)),
  };
}

export function simulatePveEncounter(state, bonuses, floor, towerNode = "combat") {
  const playerUnits = buildPlayerCombatUnits(state, bonuses);
  if (!playerUnits.length && floor === 1 && towerNode === "combat") {
    const tutorialPlayer = [
      {
        instanceId: "p_tower_echo",
        name: "塔影替身",
        col: 3,
        row: ROWS - 1,
        role: "frontline",
        trait: [],
        star: 1,
        hp: 48,
        maxHp: 48,
        atk: 14,
        image: null,
        sprite: "✨",
      },
    ];
    const tutorialEnemy = [
      {
        instanceId: "e_stray_wisp",
        name: "落单塔灵",
        col: 3,
        row: 0,
        role: "frontline",
        trait: [],
        star: 1,
        hp: 22,
        maxHp: 22,
        atk: 4,
        image: null,
        sprite: "👾",
      },
    ];
    const result = runPositionedBattle(tutorialPlayer, tutorialEnemy, bonuses, 10);
    const win = result.win;
    const hpLoss = win ? 0 : 3;
    const rewardGold = win ? 2 + Math.floor(floor / 2) : 1;
    const rewardMana = win ? 1 : 0;
    return {
      win,
      hpLoss,
      rewardGold,
      rewardMana,
      teamPower: result.teamPower,
      enemyPower: result.enemyPower,
      tutorialSkirmish: true,
      replay: {
        playerHp: result.playerHp,
        enemyHp: result.enemyHp,
        timeline: result.timeline,
      },
    };
  }
  const enemyUnits = buildPveEnemyLineup(floor, towerNode);
  const result = runPositionedBattle(playerUnits, enemyUnits, bonuses);
  const diff = result.teamPower - result.enemyPower;
  const win = result.win;
  const hpLoss = win ? clamp(Math.round(4 - diff / 70), 0, 7) : clamp(Math.round(10 + Math.abs(diff) / 26), 8, 26);
  const rewardGold = win ? 3 + Math.floor(floor / 2) : 1;
  const rewardMana = win ? 1 : 0;
  return {
    win,
    hpLoss,
    rewardGold,
    rewardMana,
    teamPower: result.teamPower,
    enemyPower: result.enemyPower,
    replay: {
      playerHp: result.playerHp,
      enemyHp: result.enemyHp,
      timeline: result.timeline,
    },
  };
}

/** PVP mock：按战力生成敌方站位阵容并跑同一套战斗 */
export function simulateMirrorBattleFromLineups(playerUnits, enemyUnits, bonuses) {
  return runPositionedBattle(playerUnits, enemyUnits, bonuses, 16);
}

export function buildGhostEnemyFromPower(floor, fakeEnemyPower) {
  const n = 5 + Math.min(2, Math.floor(fakeEnemyPower / 200));
  const perHp = Math.round((fakeEnemyPower * 0.42) / Math.max(3, n));
  const perAtk = Math.round((fakeEnemyPower * 0.22) / Math.max(3, n));
  const sprites = ["🛡️", "🏹", "🔮", "🗡️", "⚙️", "🧱", "🕶️"];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const col = i % 7;
    const row = i < 4 ? 0 : 1;
    const hp = Math.max(40, perHp + randInt(-8, 18));
    out.push({
      instanceId: `ghost_${i}`,
      name: `镜像 ${i + 1}`,
      col,
      row,
      role: i % 3 === 0 ? "frontline" : "backline",
      trait: [],
      star: 1,
      hp,
      maxHp: hp,
      atk: Math.max(8, perAtk + randInt(-3, 10)),
      image: null,
      sprite: sprites[i % sprites.length],
    });
  }
  return out;
}
