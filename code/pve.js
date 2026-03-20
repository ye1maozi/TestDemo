import { EVENT_CONFIG } from "../configs/events.config.js";
import { GAME_CONFIG } from "../configs/game.config.js";
import { ITEM_CONFIG } from "../configs/items.config.js";
import { UNIT_BY_MERGE_GROUP, UNIT_CONFIG } from "../configs/units.config.js";
import { getClassById } from "../configs/runDraft.config.js";
import { computeBackpackBonus } from "./backpack.js";
import { simulatePveEncounter } from "./combat.js";
import { clamp, pickMany, pickOne, randInt } from "./utils.js";

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

/** 路径格：杀戮尖塔式多层岔路，含 parents（上一层可到达本格的列下标） */
export function getTowerCellType(cell) {
  if (cell == null) return "combat";
  return typeof cell === "string" ? cell : cell.type || "combat";
}

export function getValidTowerNodeIndices(state) {
  const route = state.tower?.route || [];
  const step = state.tower?.step ?? 0;
  const layer = route[step];
  if (!layer?.length) return [0];
  if (step === 0) return layer.map((_, i) => i);
  const prevCol = state.tower.pathColumns?.[step - 1];
  if (prevCol == null) return layer.map((_, i) => i);
  return layer
    .map((cell, j) => {
      const parents = typeof cell === "object" && cell?.parents ? cell.parents : null;
      if (!parents || !parents.length) return j;
      return parents.includes(prevCol) ? j : -1;
    })
    .filter((j) => j >= 0);
}

/** 当前路径格类型（与岔路合法性一致，非法选中时回落到首个可行走格） */
export function getCurrentTowerNodeType(state) {
  const layer = state.tower?.route?.[state.tower?.step] || [];
  if (!layer.length) return "combat";
  const valid = getValidTowerNodeIndices(state);
  let idx = state.tower?.selectedNode ?? 0;
  if (valid.length && !valid.includes(idx)) idx = valid[0];
  return getTowerCellType(layer[idx]);
}

function towerWidthsForFloor(floor) {
  const wide = floor <= 2 ? 8 : floor <= 5 ? 7 : 6;
  return [wide, wide - 1, wide - 2, Math.max(3, wide - 4), 2, 1];
}

function pickParentColumnsForChild(j, parentW, childW) {
  const center =
    parentW <= 1 ? 0 : childW <= 1 ? Math.floor((parentW - 1) / 2) : Math.round((j * (parentW - 1)) / (childW - 1));
  const raw = [center - 1, center, center + 1].filter((x) => x >= 0 && x < parentW);
  const pool = raw.length ? raw : [0];
  const n = Math.min(pool.length, randInt(1, Math.min(3, pool.length)));
  return pickMany([...pool], n).sort((a, b) => a - b);
}

function ensureEachParentHasChild(grid, widths, layerIndex) {
  const Wp = widths[layerIndex - 1];
  const Wc = widths[layerIndex];
  for (let i = 0; i < Wp; i += 1) {
    let linked = false;
    for (let j = 0; j < Wc; j += 1) {
      if (grid[layerIndex][j].parents.includes(i)) {
        linked = true;
        break;
      }
    }
    if (!linked) {
      const j = randInt(0, Wc - 1);
      if (!grid[layerIndex][j].parents.includes(i)) grid[layerIndex][j].parents.push(i);
      grid[layerIndex][j].parents.sort((a, b) => a - b);
    }
  }
}

export function isTowerShopNodeSelected(state) {
  const layer = state.tower?.route?.[state.tower?.step] || [];
  if (!layer.length) return false;
  const valid = getValidTowerNodeIndices(state);
  const idx = state.tower?.selectedNode ?? 0;
  if (!valid.includes(idx)) return false;
  return getTowerCellType(layer[idx]) === "shop";
}

function applyStarStats(inst, template) {
  const m = GAME_CONFIG.starMultipliers[inst.star] || 1;
  inst.hp = Math.round(template.hp * m);
  inst.atk = Math.round(template.atk * m);
  inst.displayName = inst.star >= 2 ? `${template.name} ·${inst.star}★` : template.name;
}

function createUnitInstance(state, baseUnit) {
  const template = UNIT_BY_MERGE_GROUP[baseUnit.mergeGroupId || baseUnit.id] || baseUnit;
  const inst = {
    id: template.id,
    mergeGroupId: template.mergeGroupId || template.id,
    name: template.name,
    icon: template.icon,
    sprite: template.sprite,
    image: template.image,
    tint: template.tint,
    tier: template.tier,
    role: template.role,
    trait: [...(template.trait || [])],
    star: 1,
    instanceId: `uinst_${state.nextUnitInstanceId++}`,
    displayName: template.name,
  };
  applyStarStats(inst, template);
  return inst;
}

/** 三合一升星：同 mergeGroupId 且同星级满 3 个则合并，优先保留已在棋盘上的单位 */
export function tryMergeUnits(state) {
  const msgs = [];
  let changed = true;
  while (changed) {
    changed = false;
    const buckets = {};
    for (const u of state.roster) {
      if (u.star >= 3) continue;
      const k = `${u.mergeGroupId}__${u.star}`;
      if (!buckets[k]) buckets[k] = [];
      buckets[k].push(u);
    }
    for (const list of Object.values(buckets)) {
      if (list.length < 3) continue;
      const trio = list.slice(0, 3);
      const onBoard = trio.filter((u) => state.boardSlots.includes(u.instanceId));
      const keeper = onBoard[0] || trio[0];
      const template = UNIT_BY_MERGE_GROUP[keeper.mergeGroupId];
      if (!template) continue;
      for (const v of trio) {
        if (v.instanceId === keeper.instanceId) continue;
        state.roster = state.roster.filter((x) => x.instanceId !== v.instanceId);
        state.boardSlots = state.boardSlots.map((id) => (id === v.instanceId ? null : id));
      }
      keeper.star += 1;
      applyStarStats(keeper, template);
      msgs.push(`${keeper.displayName} 合成升星`);
      changed = true;
      break;
    }
  }
  return msgs;
}

function pickWeightedShopUnit(state) {
  const classOpt = getClassById(state.runMeta?.classId);
  const weights = UNIT_CONFIG.map((u) => {
    let w = GAME_CONFIG.shop.tierWeights[u.tier] ?? 10;
    if (classOpt?.favoredTraits?.some((t) => (u.trait || []).includes(t))) {
      w *= classOpt.shopTraitBias || 1;
    }
    return { u, w };
  });
  const total = weights.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const { u, w } of weights) {
    r -= w;
    if (r <= 0) return u;
  }
  return weights[weights.length - 1].u;
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
  const n = GAME_CONFIG.shop.unitSlots ?? 5;
  state.shopUnits = Array.from({ length: n }, () => pickWeightedShopUnit(state));
  state.shopItems = pickMany(ITEM_CONFIG, 3);
}

export function rollTowerRoute(state) {
  const widths = towerWidthsForFloor(state.floor);
  const numLayers = widths.length;
  const grid = [];
  for (let L = 0; L < numLayers; L += 1) {
    grid[L] = [];
    for (let c = 0; c < widths[L]; c += 1) {
      grid[L].push({ type: pickOne(TOWER_NODE_POOL), parents: [] });
    }
  }
  for (let L = 1; L < numLayers; L += 1) {
    const Wp = widths[L - 1];
    const Wc = widths[L];
    for (let j = 0; j < Wc; j += 1) {
      grid[L][j].parents = pickParentColumnsForChild(j, Wp, Wc);
    }
    ensureEachParentHasChild(grid, widths, L);
  }

  grid[0][0].type = "combat";
  const midL = Math.min(numLayers - 2, Math.floor(numLayers / 2));
  if (grid[midL].length > 1) grid[midL][Math.floor(grid[midL].length / 2)].type = "elite";

  const last = numLayers - 1;
  grid[last][0].type = state.floor % 3 === 0 ? "boss" : "elite";
  if (numLayers >= 2 && grid[numLayers - 2].length > 1) {
    grid[numLayers - 2][grid[numLayers - 2].length - 1].type = "rest";
  }

  if (state.floor === 1 && grid[1]?.[0]) {
    grid[1][0].type = "shop";
    const p = Array.from({ length: widths[0] }, (_, i) => i);
    grid[1][0].parents = [...new Set([...grid[1][0].parents, ...p])].sort((a, b) => a - b);
  }

  state.tower.route = grid;
  state.tower.step = 0;
  state.tower.history = [];
  state.tower.pathColumns = [];
  state.tower.selectedNode = 0;
  state.tower.currentNode = getTowerCellType(grid[0][0]);
}

export function consumeTowerNode(state) {
  const layer = state.tower.route[state.tower.step] || [];
  const valid = getValidTowerNodeIndices(state);
  let selected = clamp(state.tower.selectedNode || 0, 0, Math.max(0, layer.length - 1));
  if (valid.length && !valid.includes(selected)) selected = valid[0];
  const node = getTowerCellType(layer[selected]);
  state.tower.history.push(node);
  if (!state.tower.pathColumns) state.tower.pathColumns = [];
  state.tower.pathColumns[state.tower.step] = selected;
  state.tower.step += 1;
  const nextLayer = state.tower.route[state.tower.step];
  if (!nextLayer?.length) {
    state.tower.selectedNode = 0;
    state.tower.currentNode = null;
    return node;
  }
  const nextValid = getValidTowerNodeIndices(state);
  state.tower.selectedNode = nextValid[0] ?? 0;
  state.tower.currentNode = getTowerCellType(nextLayer[state.tower.selectedNode]);
  return node;
}

export function selectTowerNode(state, nodeIndex) {
  const layer = state.tower.route[state.tower.step] || [];
  if (nodeIndex < 0 || nodeIndex >= layer.length) return false;
  const valid = getValidTowerNodeIndices(state);
  if (valid.length && !valid.includes(nodeIndex)) return false;
  state.tower.selectedNode = nodeIndex;
  state.tower.currentNode = getTowerCellType(layer[nodeIndex]);
  return true;
}

export function buyUnit(state, shopIndex = 0) {
  if (!isTowerShopNodeSelected(state)) return { ok: false, msg: "仅在路径上选择「商店」节点时可购买" };
  const unit = state.shopUnits[shopIndex];
  if (!unit) return { ok: false, msg: "商店没有单位" };
  const cost = GAME_CONFIG.shop.unitCostByTier[unit.tier] || 3;
  if (state.gold < cost) return { ok: false, msg: "金币不足" };
  state.gold -= cost;
  const unitInstance = createUnitInstance(state, unit);
  state.roster.push(unitInstance);
  const deployedIndex = autoDeployToBoard(state, unitInstance);
  state.shopUnits.splice(shopIndex, 1);
  const merges = tryMergeUnits(state);
  let msg = `购买单位 ${unit.name} -${cost}g，${deployedIndex >= 0 ? `已自动上阵至${deployedIndex + 1}号位` : "已进入候战区"}`;
  if (merges.length) msg += ` ｜ ${merges.join("；")}`;
  return { ok: true, msg };
}

export function buyItem(state, shopIndex = 0) {
  if (!isTowerShopNodeSelected(state)) return { ok: false, msg: "仅在路径上选择「商店」节点时可购买" };
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
  if (!isTowerShopNodeSelected(state)) return { ok: false, msg: "仅在路径上选择「商店」节点时可刷新商店" };
  if (state.gold < GAME_CONFIG.shop.refreshCost) return { ok: false, msg: "金币不足，无法刷新" };
  state.gold -= GAME_CONFIG.shop.refreshCost;
  rollShop(state);
  return { ok: true, msg: "刷新商店 -1g" };
}

export function runExplore(state, towerNode = "combat") {
  const bonuses = computeBackpackBonus(state);
  const battle = simulatePveEncounter(state, bonuses, state.floor, towerNode);
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
  const tag = battle.tutorialSkirmish ? "（首层教学轻装战）" : "";
  return {
    ok: true,
    msg: `节点[${towerNode}] 探索战斗 ${battle.win ? "胜利" : "失败"} | 战力${battle.teamPower ?? 0} vs ${battle.enemyPower ?? 0} | HP-${finalHpLoss} 金币+${finalGold}${tag}`,
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
      const slots = GAME_CONFIG.shop.unitSlots ?? 5;
      state.shopUnits = Array.from({ length: slots }, () => pickOne(highTier));
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
    const merges = tryMergeUnits(state);
    let msg = `${ev.title}：获得单位 ${unit.name}（${deployedIndex >= 0 ? `自动上阵至${deployedIndex + 1}号位` : "候战区"}）`;
    if (merges.length) msg += ` ｜ ${merges.join("；")}`;
    return { ok: true, msg };
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
