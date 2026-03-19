import { EVENT_CONFIG } from "../configs/events.config.js";
import { GAME_CONFIG } from "../configs/game.config.js";
import { ITEM_CONFIG } from "../configs/items.config.js";
import { UNIT_CONFIG } from "../configs/units.config.js";
import { computeBackpackBonus } from "./backpack.js";
import { simulatePveEncounter } from "./combat.js";
import { pickMany, pickOne, randInt } from "./utils.js";

const AFFIX_PREFIX = [
  { name: "锋锐", effect: { globalAtkPct: 0.04 }, summary: "攻击强化" },
  { name: "厚重", effect: { globalHpPct: 0.05 }, summary: "生命强化" },
  { name: "迅捷", effect: { attackProcPct: 0.03 }, summary: "触发频率提升" },
];

const AFFIX_SUFFIX = [
  { name: "守护", effect: { shieldProc: 2 }, summary: "开场护盾" },
  { name: "掠夺", effect: { endFloorGold: 1 }, summary: "层结算额外金币" },
  { name: "复苏", effect: { endFloorHeal: 3 }, summary: "层结算回复" },
];

const TOWER_NODE_POOL = ["combat", "combat", "combat", "event", "shop", "elite", "rest"];

function createUnitInstance(state, baseUnit) {
  return {
    ...baseUnit,
    instanceId: `uinst_${state.nextUnitInstanceId++}`,
  };
}

function mergeEffect(baseEffects, extra) {
  const merged = { ...(baseEffects || {}) };
  for (const [k, v] of Object.entries(extra || {})) {
    if (typeof v === "number") {
      merged[k] = (merged[k] || 0) + v;
    } else {
      merged[k] = v;
    }
  }
  return merged;
}

function createItemInstance(state, baseItem) {
  const prefix = Math.random() < 0.75 ? pickOne(AFFIX_PREFIX) : null;
  const suffix = Math.random() < 0.65 ? pickOne(AFFIX_SUFFIX) : null;
  let effects = { ...(baseItem.effects || {}) };
  const affixText = [];
  if (prefix) {
    effects = mergeEffect(effects, prefix.effect);
    affixText.push(prefix.summary);
  }
  if (suffix) {
    effects = mergeEffect(effects, suffix.effect);
    affixText.push(suffix.summary);
  }
  return {
    ...baseItem,
    instanceId: `iinst_${state.nextItemInstanceId++}`,
    placed: false,
    name: `${prefix ? `${prefix.name}·` : ""}${baseItem.name}${suffix ? `·${suffix.name}` : ""}`,
    effects,
    summary: `${baseItem.summary || ""}${affixText.length ? ` ｜ 词缀：${affixText.join(" + ")}` : ""}`,
  };
}

function autoDeployToBoard(state, unitInstance) {
  const idx = state.boardSlots.findIndex((v) => v === null);
  if (idx >= 0) {
    state.boardSlots[idx] = unitInstance.instanceId;
    return idx;
  }
  return -1;
}

export function rollShop(state) {
  state.shopUnits = pickMany(UNIT_CONFIG, 3);
  state.shopItems = pickMany(ITEM_CONFIG, 3);
}

export function rollTowerRoute(state) {
  const route = [];
  for (let i = 0; i < 5; i += 1) {
    route.push(pickOne(TOWER_NODE_POOL));
  }
  route[4] = state.floor % 3 === 0 ? "boss" : route[4];
  state.tower.route = route;
  state.tower.step = 0;
  state.tower.history = [];
  state.tower.currentNode = route[0] || "combat";
}

export function consumeTowerNode(state) {
  const node = state.tower.route[state.tower.step] || "combat";
  state.tower.history.push(node);
  state.tower.step += 1;
  state.tower.currentNode = state.tower.route[state.tower.step] || null;
  return node;
}

export function buyUnit(state, shopIndex = 0) {
  const unit = state.shopUnits[shopIndex];
  if (!unit) return { ok: false, msg: "商店没有单位" };
  const cost = GAME_CONFIG.shop.unitCostByTier[unit.tier] || 3;
  if (state.gold < cost) return { ok: false, msg: "金币不足" };
  state.gold -= cost;
  const unitInstance = createUnitInstance(state, unit);
  state.roster.push(unitInstance);
  const deployedIndex = autoDeployToBoard(state, unitInstance);
  state.shopUnits.splice(shopIndex, 1);
  return {
    ok: true,
    msg: `购买单位 ${unit.name} -${cost}g，${deployedIndex >= 0 ? `已自动上阵至${deployedIndex + 1}号位` : "已进入候战区"}`,
  };
}

export function buyItem(state, shopIndex = 0) {
  const item = state.shopItems[shopIndex];
  if (!item) return { ok: false, msg: "商店没有道具" };
  const cost = GAME_CONFIG.shop.itemCostByRarity[item.rarity] || 2;
  if (state.gold < cost) return { ok: false, msg: "金币不足" };
  state.gold -= cost;
  state.backpackItems.push(createItemInstance(state, item));
  state.shopItems.splice(shopIndex, 1);
  return { ok: true, msg: `购买道具 ${item.name} -${cost}g，已进入待整理背包` };
}

export function refreshShop(state) {
  if (state.gold < GAME_CONFIG.shop.refreshCost) return { ok: false, msg: "金币不足，无法刷新" };
  state.gold -= GAME_CONFIG.shop.refreshCost;
  rollShop(state);
  return { ok: true, msg: "刷新商店 -1g" };
}

export function runExplore(state, towerNode = "combat") {
  const bonuses = computeBackpackBonus(state);
  const battle = simulatePveEncounter(state, bonuses, state.floor);
  const stable = state.floorPlan?.strategy === "stable";
  const greedy = state.floorPlan?.strategy === "greedy";
  const eliteBonus = towerNode === "elite" ? 2 : 0;
  const bossBonus = towerNode === "boss" ? 3 : 0;
  const finalHpLoss = Math.max(0, battle.hpLoss + (greedy ? 2 : 0) - (stable ? 2 : 0) + eliteBonus + bossBonus);
  const finalGold = Math.max(1, battle.rewardGold + (greedy ? 1 : 0) - (stable ? 1 : 0) + eliteBonus + bossBonus);
  state.hp -= finalHpLoss;
  state.gold += finalGold;
  state.mana += battle.rewardMana;
  if (battle.win) {
    state.streak = state.streak >= 0 ? state.streak + 1 : 1;
  } else {
    state.streak = state.streak <= 0 ? state.streak - 1 : -1;
  }
  return {
    ok: true,
    msg: `节点[${towerNode}] 探索战斗 ${battle.win ? "胜利" : "失败"} | 战力${battle.teamPower ?? 0} vs ${battle.enemyPower ?? 0} | HP-${finalHpLoss} 金币+${finalGold}`,
    battle,
  };
}

export function runEvent(state, towerNode = "event") {
  if (towerNode === "rest") {
    const heal = 12;
    state.hp = Math.min(GAME_CONFIG.initialHp, state.hp + heal);
    return { ok: true, msg: "营地休整：恢复12生命值" };
  }
  if (towerNode === "shop") {
    rollShop(state);
    return { ok: true, msg: "商店节点：免费刷新一次商店" };
  }
  const ev = pickOne(EVENT_CONFIG);
  if (ev.execute === "SACRIFICE_GOLD_FOR_GEAR_ITEM") {
    if (state.gold >= 3) {
      state.gold -= 3;
      state.gear += 1;
      state.backpackItems.push(createItemInstance(state, pickOne(ITEM_CONFIG)));
      return { ok: true, msg: `${ev.title}：-3g +1齿轮 +1道具（待整理）` };
    }
    return { ok: true, msg: `${ev.title}：金币不足，事件无效` };
  }
  if (ev.execute === "PREMIUM_SHOP_ROLL") {
    if (state.gold >= 2) {
      state.gold -= 2;
      const highTier = UNIT_CONFIG.filter((u) => u.tier >= 2);
      state.shopUnits = pickMany(highTier, 3);
      state.shopItems = pickMany(ITEM_CONFIG.filter((i) => i.rarity !== "common"), 2);
      return { ok: true, msg: `${ev.title}：高级商店刷新成功` };
    }
    return { ok: true, msg: `${ev.title}：金币不足，事件无效` };
  }
  if (ev.execute === "HP_FOR_RESOURCE") {
    const stable = state.floorPlan?.strategy === "stable";
    const greedy = state.floorPlan?.strategy === "greedy";
    const hpCost = Math.max(1, 8 + (greedy ? 1 : 0) - (stable ? 2 : 0));
    const goldGain = 4 + (greedy ? 1 : 0);
    state.hp -= hpCost;
    state.gold += goldGain;
    state.mana += 1;
    return { ok: true, msg: `${ev.title}：HP-${hpCost}，金币+${goldGain}，秘能+1` };
  }
  if (ev.execute === "FREE_RANDOM_UNIT") {
    const unit = pickOne(UNIT_CONFIG);
    const unitInstance = createUnitInstance(state, unit);
    state.roster.push(unitInstance);
    const deployedIndex = autoDeployToBoard(state, unitInstance);
    return {
      ok: true,
      msg: `${ev.title}：获得单位 ${unit.name}（${deployedIndex >= 0 ? `自动上阵至${deployedIndex + 1}号位` : "候战区"}）`,
    };
  }
  return { ok: false, msg: "未知事件" };
}

export function settleFloorEconomy(state, wonPvp) {
  let base = GAME_CONFIG.economy.baseGoldPerFloor;
  if (state.floor >= 5) base = Math.max(2, base - 2);
  if (state.floor >= 7) base = Math.max(1, base - 1);
  const winLose = wonPvp ? GAME_CONFIG.economy.winBonus : GAME_CONFIG.economy.loseBonus;
  let interest = 0;
  for (const step of GAME_CONFIG.economy.interestSteps) {
    if (state.gold >= step.threshold) interest = step.bonus;
  }
  const streakBonus = Math.abs(state.streak) >= 3 ? Math.min(3, Math.floor(Math.abs(state.streak) / 3)) : 0;
  const total = base + winLose + interest + streakBonus;
  const affixGold = state.backpackItems
    .filter((i) => i.placed)
    .reduce((sum, i) => sum + (i.effects?.endFloorGold || 0), 0);
  state.gold += total + affixGold;
  return total + affixGold;
}

export function applyLateFloorPenalty(state, pvpResult) {
  if (state.floor < 7) return { hpPenalty: 0, badgePenalty: 0 };
  if (pvpResult?.win) return { hpPenalty: 0, badgePenalty: 0 };
  const hpPenalty = state.floor >= 9 ? 10 : state.floor >= 8 ? 7 : 5;
  const badgePenalty = state.floor >= 8 ? 1 : 0;
  state.hp -= hpPenalty;
  state.lifeBadge -= badgePenalty;
  return { hpPenalty, badgePenalty };
}

export function maybeEliminateByHp(state) {
  if (state.hp <= 0) {
    state.lifeBadge -= 1;
    state.hp = randInt(55, 75);
    return true;
  }
  return false;
}
