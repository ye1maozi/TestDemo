import { computeBackpackBonus } from "../backpack.js";
import { buildGhostEnemyFromPower, buildPlayerCombatUnits, simulateMirrorBattleFromLineups } from "../combat.js";

function buildSnapshot(state) {
  const deployed = state.boardSlots
    .filter(Boolean)
    .map((instanceId) => state.roster.find((u) => u.instanceId === instanceId))
    .filter(Boolean);
  const rosterForBattle = deployed.length ? deployed : state.roster.slice(0, 8);
  const bonuses = computeBackpackBonus(state);
  const playerBattleLineup = buildPlayerCombatUnits(state, bonuses);
  return {
    runId: state.runId,
    floor: state.floor,
    hp: state.hp,
    lifeBadge: state.lifeBadge,
    resources: { gold: state.gold, gear: state.gear, mana: state.mana },
    roster: rosterForBattle.map((u) => ({
      id: u.id,
      mergeGroupId: u.mergeGroupId,
      star: u.star || 1,
      tier: u.tier,
      hp: u.hp,
      atk: u.atk,
      role: u.role,
      trait: u.trait || [],
    })),
    board: [...state.boardSlots],
    backpack: state.backpackItems.filter((i) => i.placed).map((i) => ({ id: i.id, rarity: i.rarity })),
    playerBattleLineup,
    combatBonuses: {
      attackProcPct: bonuses.attackProcPct || 0,
      shieldProc: bonuses.shieldProc || 0,
      globalHpPct: bonuses.globalHpPct || 0,
      globalAtkPct: bonuses.globalAtkPct || 0,
      traitNeedMinus: bonuses.traitNeedMinus || {},
    },
  };
}

async function mockProvider(snapshot) {
  const bonuses = {
    attackProcPct: snapshot.combatBonuses?.attackProcPct || 0,
    shieldProc: snapshot.combatBonuses?.shieldProc || 0,
    globalHpPct: snapshot.combatBonuses?.globalHpPct || 0,
    globalAtkPct: snapshot.combatBonuses?.globalAtkPct || 0,
    traitNeedMinus: snapshot.combatBonuses?.traitNeedMinus || {},
  };
  const playerUnits = snapshot.playerBattleLineup || [];
  const basePower = playerUnits.reduce((sum, u) => sum + u.atk * 2 + u.maxHp * 0.35, 0);
  const fakeEnemyPower = 130 + snapshot.floor * 25 + Math.random() * 60;
  const enemies = buildGhostEnemyFromPower(snapshot.floor, fakeEnemyPower);
  const battle = simulateMirrorBattleFromLineups(playerUnits, enemies, bonuses);
  const win = battle.win;
  const damage = win ? 0 : Math.floor(8 + Math.max(0, fakeEnemyPower - basePower) / 18);
  const pPct = battle.playerHp ?? 50;
  const ePct = battle.enemyHp ?? 50;
  const timeline = (battle.timeline && battle.timeline.length
    ? battle.timeline
    : [{ side: "player", text: "战斗结算", playerHp: pPct, enemyHp: ePct }]
  ).map((step) => ({
    ...step,
    playerHp: typeof step.playerHp === "number" ? step.playerHp : pPct,
    enemyHp: typeof step.enemyHp === "number" ? step.enemyHp : ePct,
  }));
  return {
    ok: true,
    source: "mock",
    win,
    enemyName: `镜像对手-${1000 + Math.floor(Math.random() * 9000)}`,
    hpDamage: Math.max(0, damage),
    badgeLoss: damage > 20 ? 1 : 0,
    report: {
      playerPower: Math.round(basePower),
      enemyPower: Math.round(fakeEnemyPower),
      timeline,
      playerFinalHp: pPct,
      enemyFinalHp: ePct,
    },
  };
}

async function serverProvider(snapshot, endpoint, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`PVP接口异常: ${resp.status}`);
    const data = await resp.json();
    return {
      ok: true,
      source: "server",
      win: !!data.win,
      enemyName: data.enemyName || "未知对手",
      hpDamage: data.hpDamage || 0,
      badgeLoss: data.badgeLoss || 0,
      report: data.report || {},
    };
  } catch (error) {
    return {
      ok: false,
      source: "server",
      message: error.message || "PVP服务不可用",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function createPvpService(config) {
  return {
    async resolveFloorBattle(state) {
      const snapshot = buildSnapshot(state);
      if (config.mode === "server") {
        const result = await serverProvider(snapshot, config.endpoint, config.timeoutMs);
        if (result.ok) return result;
      }
      return mockProvider(snapshot);
    },
  };
}
