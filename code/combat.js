import { TRAIT_BONUS } from "../configs/units.config.js";
import { clamp } from "./utils.js";

function calcTraitCounts(roster) {
  const counts = {};
  for (const u of roster) {
    for (const t of u.trait) {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}

function calcTeamPower(roster, bonuses) {
  const traitCounts = calcTraitCounts(roster);
  let hp = 0;
  let atk = 0;
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

  for (const u of roster) {
    hp += u.hp;
    atk += u.atk;
  }

  const finalHp = hp * (1 + traitHpPct + bonuses.globalHpPct);
  const finalAtk = atk * (1 + traitAtkPct + bonuses.globalAtkPct);
  return {
    power: finalHp * 0.5 + finalAtk * 1.4,
    hp: finalHp,
    atk: finalAtk,
  };
}

function runTimelineBattle(team, enemy, bonuses) {
  let playerHp = Math.round(team.hp);
  let enemyHp = Math.round(enemy.hp);
  const timeline = [];
  const rounds = 6;

  for (let i = 1; i <= rounds; i += 1) {
    const playerHit = Math.max(1, Math.round(team.atk * (0.62 + Math.random() * 0.22)));
    const enemyHit = Math.max(1, Math.round(enemy.atk * (0.62 + Math.random() * 0.22)));
    enemyHp -= playerHit;
    timeline.push({ side: "player", text: `R${i} 我方造成 ${playerHit} 伤害`, playerHp, enemyHp: Math.max(0, enemyHp) });

    if (bonuses.attackProcPct > 0 && Math.random() < bonuses.attackProcPct) {
      const proc = Math.max(2, Math.round(team.atk * 0.24));
      enemyHp -= proc;
      timeline.push({ side: "item", text: `R${i} 背包触发追加伤害 ${proc}`, playerHp, enemyHp: Math.max(0, enemyHp) });
    }

    if (enemyHp <= 0) break;

    playerHp -= enemyHit;
    timeline.push({ side: "enemy", text: `R${i} 敌方反击 ${enemyHit} 伤害`, playerHp: Math.max(0, playerHp), enemyHp });
    if (bonuses.shieldProc > 0 && i === 2) {
      playerHp += bonuses.shieldProc;
      timeline.push({
        side: "item",
        text: `R${i} 急救触发护盾/回复 +${bonuses.shieldProc}`,
        playerHp,
        enemyHp,
      });
    }
    if (playerHp <= 0) break;
  }

  return {
    win: enemyHp <= 0 || playerHp > enemyHp,
    playerHp: Math.max(0, playerHp),
    enemyHp: Math.max(0, enemyHp),
    timeline,
  };
}

export function simulatePveEncounter(state, bonuses, floor) {
  const activeIds = state.boardSlots.filter(Boolean);
  const roster = activeIds
    .map((id) => state.roster.find((u) => u.instanceId === id))
    .filter(Boolean)
    .slice(0, 8);
  if (roster.length === 0) {
    const fallback = state.roster.slice(0, 3);
    roster.push(...fallback);
  }
  if (roster.length === 0) {
    return {
      win: false,
      hpLoss: 12 + floor * 2,
      rewardGold: 0,
      rewardMana: 0,
    };
  }

  const team = calcTeamPower(roster, bonuses);
  const enemyPower = 80 + floor * 26 + Math.random() * 35;
  const enemy = {
    hp: 180 + floor * 35 + Math.random() * 40,
    atk: 24 + floor * 4 + Math.random() * 7,
  };
  const replay = runTimelineBattle(team, enemy, bonuses);
  const diff = team.power - enemyPower;
  const win = replay.win;
  const hpLoss = win ? clamp(Math.round(4 - diff / 60), 0, 6) : clamp(Math.round(10 + Math.abs(diff) / 24), 8, 25);
  const rewardGold = win ? 3 + Math.floor(floor / 2) : 1;
  const rewardMana = win ? 1 : 0;
  return {
    win,
    hpLoss,
    rewardGold,
    rewardMana,
    teamPower: Math.round(team.power),
    enemyPower: Math.round(enemyPower),
    replay,
  };
}
