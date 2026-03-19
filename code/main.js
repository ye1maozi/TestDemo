import { GAME_CONFIG } from "../configs/game.config.js";
import * as backpackMod from "./backpack.js";
import { createPvpService } from "./services/pvpService.js";
import { createInitialState, getCurrentPhase, log } from "./state.js";
import {
  buyItem,
  buyUnit,
  consumeTowerNode,
  maybeEliminateByHp,
  refreshShop,
  rollShop,
  rollTowerRoute,
  selectTowerNode,
  runEvent,
  runExplore,
  settleFloorEconomy,
  applyLateFloorPenalty,
} from "./pve.js";
import { bindActions, render, setActionEnabled, setRunButtons } from "./ui.js";
import { randInt } from "./utils.js";

const state = createInitialState();
const pvpService = createPvpService(GAME_CONFIG.pvp);
let phaseBusy = false;
const autoArrangeBackpack = backpackMod.autoArrangeBackpack;
const computeBackpackBonus = backpackMod.computeBackpackBonus;
const placeItemAt =
  backpackMod.placeItemAt ||
  (() => ({
    ok: false,
    msg: "当前背包模块版本较旧，请刷新页面或重启本地服务",
  }));
const removeItemFromBackpack = backpackMod.removeItemFromBackpack || (() => false);
const rotateItemInBackpack =
  backpackMod.rotateItemInBackpack ||
  (() => ({
    ok: false,
    msg: "当前背包模块版本较旧，请刷新页面或重启本地服务",
  }));

function bootstrap() {
  bindActions({
    onStart: startRun,
    onEnd: endRun,
    onExplore: () => handlePveAction(handleExploreWithTower, "explored"),
    onEvent: () => handlePveAction(handleEventWithTower, "eventUsed"),
    onRefreshShop: () => handlePveAction(refreshShop, ""),
    onBuyUnit: (shopIndex) => handlePveAction((s) => buyUnit(s, shopIndex), "boughtUnit"),
    onBuyItem: (shopIndex) => handlePveAction((s) => buyItem(s, shopIndex), "boughtItem"),
    onAutoArrange: () => {
      autoArrangeBackpack(state);
      markTutorial("arranged");
      updateBackpackSummary();
      log(state, "已整理背包并放入格子");
      render(state);
    },
    onBoardDrop: handleBoardDrop,
    onBagDrop: handleBagDrop,
    onRemoveBagItem: handleRemoveBagItem,
    onRotateBagItem: handleRotateBagItem,
    onEndPhase: handleEndPhase,
    onSetStrategy: setFloorStrategy,
    onCloseBattleOverlay: () => {
      state.battleOverlay.visible = false;
      render(state);
    },
    onToggleBattlePause: () => {
      if (!state.battleOverlay.visible) return;
      state.battleOverlay.paused = !state.battleOverlay.paused;
      render(state);
    },
    onToggleBattleSpeed: () => {
      if (!state.battleOverlay.visible) return;
      const speeds = [0.5, 1, 2];
  const idx = speeds.indexOf(state.battleOverlay.speed ?? 1);
  state.battleOverlay.speed = speeds[(idx + 1) % speeds.length];
      render(state);
    },
    onReplayBattle: async () => {
      if (!state.battleOverlay.visible || phaseBusy) return;
      await playBattleOverlayTimeline(true);
    },
    onJumpBattleKeyframe: (pos) => {
      if (!state.battleOverlay.visible) return;
      jumpBattleKeyframe(pos);
      render(state);
    },
    onSkipTutorial: () => {
      state.tutorial.skipped = true;
      log(state, "你已跳过第一关引导");
      render(state);
    },
    onSelectTowerNode: handleSelectTowerNode,
    onSwitchSideTab: (tab) => {
      state.ui.sideTab = tab;
      render(state);
    },
  });
  render(state);
}

function startRun() {
  Object.assign(state, createInitialState());
  state.runActive = true;
  state.runId = `run_${Date.now()}`;
  rollShop(state);
  rollTowerRoute(state);
  autoArrangeBackpack(state);
  updateBackpackSummary();
  applyFloorPlanSuggestion();
  setRunButtons(true);
  setActionEnabled(true);
  log(state, `对局开始：${state.runId}，当前PVP模式=${GAME_CONFIG.pvp.mode}`);
  log(state, "第一关引导已开启：按提示完成一次完整循环");
  render(state);
}

function handleExploreWithTower(s) {
  const node = getCurrentSelectedNode(s);
  if (!["combat", "elite", "boss"].includes(node)) {
    return { ok: false, msg: `当前节点是[${node}]，请使用“触发事件”执行该节点` };
  }
  consumeTowerNode(s);
  return runExplore(s, node);
}

function handleEventWithTower(s) {
  const node = getCurrentSelectedNode(s);
  if (!["event", "shop", "rest"].includes(node)) {
    return { ok: false, msg: `当前节点是[${node}]，请使用“探索节点”执行该节点` };
  }
  consumeTowerNode(s);
  return runEvent(s, node);
}

function getCurrentSelectedNode(s) {
  const layer = s.tower?.route?.[s.tower?.step] || ["combat"];
  const idx = Math.max(0, Math.min(layer.length - 1, s.tower?.selectedNode || 0));
  return layer[idx] || "combat";
}

function handleSelectTowerNode(nodeIndex) {
  if (!state.runActive || phaseBusy) return;
  const phase = getCurrentPhase(state);
  if (phase.key !== "PVE_OPEN") return;
  const ok = selectTowerNode(state, nodeIndex);
  if (ok) {
    log(state, `已选择路径节点：${state.tower.currentNode}`);
    render(state);
  }
}

function endRun() {
  phaseBusy = false;
  state.runActive = false;
  setRunButtons(false);
  setActionEnabled(false);
  log(state, "对局已结束");
  render(state);
}

async function handlePveAction(fn, tutorialMark = "") {
  if (!state.runActive || phaseBusy) return;
  const phase = getCurrentPhase(state);
  if (phase.key !== "PVE_OPEN") {
    log(state, "当前阶段不可操作，等待封盘/结算");
    render(state);
    return;
  }

  if (tutorialMark === "explored" && state.phaseActions.exploreUsed >= GAME_CONFIG.phaseActionLimit.explore) {
    log(state, "本阶段探索次数已达上限");
    render(state);
    return;
  }
  if (tutorialMark === "eventUsed" && state.phaseActions.eventUsed >= GAME_CONFIG.phaseActionLimit.event) {
    log(state, "本阶段事件次数已达上限");
    render(state);
    return;
  }

  const result = fn(state);
  if (result?.ok && tutorialMark) markTutorial(tutorialMark);
  if (result?.ok && tutorialMark === "explored") state.phaseActions.exploreUsed += 1;
  if (result?.ok && tutorialMark === "eventUsed") state.phaseActions.eventUsed += 1;
  if (result?.ok) updateBackpackSummary();
  if (result?.ok && result?.battle?.replay) {
    const arena = buildArenaFromState("pve");
    state.battleOverlay = {
      visible: true,
      title: `探索战斗回放（第${state.floor}层）`,
      playerHp: Math.max(1, Math.min(100, result.battle.replay.playerHp)),
      enemyHp: Math.max(0, Math.min(100, result.battle.replay.enemyHp)),
      timeline: result.battle.replay.timeline || [],
      renderedTimeline: [],
      playIndex: 0,
      paused: false,
      speed: 1,
      arena,
      result: result.battle.win ? "结果：胜利" : "结果：失败",
    };
    await playBattleOverlayTimeline();
  }
  if (result?.msg) log(state, result.msg);
  maybeLoseByDeath();
  render(state);
}

function markTutorial(key) {
  if (!state.tutorial || state.tutorial.skipped || state.tutorial.completed) return;
  if (state.floor !== 1) return;
  state.tutorial.actionMarks[key] = true;
}

function setFloorStrategy(strategy) {
  if (!state.runActive || phaseBusy || getCurrentPhase(state).key !== "PVE_OPEN") return;
  if (state.phaseActions.exploreUsed > 0 || state.phaseActions.eventUsed > 0) {
    log(state, "已执行操作，本层策略锁定，下一层可切换");
    render(state);
    return;
  }
  state.floorPlan.strategy = strategy;
  applyFloorPlanSuggestion();
  log(state, `本层策略切换为：${strategy === "greedy" ? "贪收益线" : "稳健线"}`);
  render(state);
}

function applyFloorPlanSuggestion() {
  state.floorPlan.suggestion =
    state.floorPlan.strategy === "greedy"
      ? "先事件找高收益 -> 购买输出单位 -> 再探索补资源"
      : "先购买前排 -> 探索稳血 -> 整理背包后再事件";
}

async function handleEndPhase() {
  if (!state.runActive || phaseBusy) return;
  const phase = getCurrentPhase(state);
  if (phase.key !== "PVE_OPEN") return;

  phaseBusy = true;
  setActionEnabled(false);
  state.phaseIndex = 1;
  log(state, "进入路径收缩：已停止自由探索");
  render(state);
  await sleep(400);

  state.phaseIndex = 2;
  log(state, "封盘完成，正在请求异步PVP结算...");
  render(state);
  await sleep(400);
  await resolveAsyncPvpWithGuard();
  await sleep(350);

  state.phaseIndex = 3;
  render(state);
  await sleep(300);
  await settleFloorAndAdvance();
  phaseBusy = false;
}

function handleBoardDrop(payload, targetIndex) {
  if (!state.runActive || phaseBusy) return;
  if (payload.kind && payload.kind !== "unit") return;
  const phase = getCurrentPhase(state);
  if (phase.key !== "PVE_OPEN") return;
  const fromIndex = payload.fromBoardIndex === "" ? null : Number(payload.fromBoardIndex);
  const instanceId = payload.unitId;
  if (!instanceId || Number.isNaN(targetIndex)) return;
  const exists = state.roster.some((u) => u.instanceId === instanceId);
  if (!exists) return;
  if (fromIndex === targetIndex) return;
  const existedIndex = state.boardSlots.findIndex((v) => v === instanceId);
  if (existedIndex >= 0 && existedIndex !== fromIndex) {
    state.boardSlots[existedIndex] = null;
  }

  // 限制上阵数量，防止超出配置
  const occupied = state.boardSlots.filter(Boolean).length;
  const targetWasEmpty = state.boardSlots[targetIndex] === null;
  if (fromIndex === null && targetWasEmpty && occupied >= GAME_CONFIG.board.maxActiveUnits) {
    log(state, `上阵上限为 ${GAME_CONFIG.board.maxActiveUnits}，请先移动或替换已有单位`);
    render(state);
    return;
  }

  if (fromIndex === null) {
    state.boardSlots[targetIndex] = instanceId;
  } else {
    const tmp = state.boardSlots[targetIndex];
    state.boardSlots[targetIndex] = instanceId;
    state.boardSlots[fromIndex] = tmp;
  }
  log(state, "已调整棋盘站位");
  render(state);
}

function handleBagDrop(payload, col, row) {
  if (!state.runActive || phaseBusy) return;
  if (payload.kind !== "item" || !payload.itemId) return;
  const phase = getCurrentPhase(state);
  if (phase.key !== "PVE_OPEN") return;
  const result = placeItemAt(state, payload.itemId, col, row);
  if (result.ok) {
    updateBackpackSummary();
  }
  log(state, result.msg);
  render(state);
}

function handleRemoveBagItem(itemInstanceId) {
  if (!state.runActive || phaseBusy) return;
  const phase = getCurrentPhase(state);
  if (phase.key !== "PVE_OPEN") return;
  const ok = removeItemFromBackpack(state, itemInstanceId);
  if (ok) {
    updateBackpackSummary();
    log(state, "已从背包取下道具");
    render(state);
  }
}

function handleRotateBagItem(itemInstanceId) {
  if (!state.runActive || phaseBusy) return;
  const phase = getCurrentPhase(state);
  if (phase.key !== "PVE_OPEN") return;
  const result = rotateItemInBackpack(state, itemInstanceId);
  if (result.ok) {
    updateBackpackSummary();
  }
  log(state, result.msg);
  render(state);
}

function maybeLoseByDeath() {
  const triggered = maybeEliminateByHp(state);
  if (triggered) {
    log(state, "HP归零，扣除1徽记并重置生命值");
    if (state.lifeBadge <= 0) {
      log(state, "徽记耗尽，已淘汰");
      endRun();
    }
  }
}

async function resolveAsyncPvp() {
  const result = await pvpService.resolveFloorBattle(state);
  markTutorial("pvpResolved");
  state.lastBattle = result;
  state.battleExplain = null;
  if (result.win) {
    log(
      state,
      `PVP胜利(${result.source}) 对手=${result.enemyName} 战力${result.report.playerPower} vs ${result.report.enemyPower}`
    );
    state.streak = state.streak >= 0 ? state.streak + 1 : 1;
    const arena = buildArenaFromState("pvp");
    state.battleOverlay = {
      visible: true,
      title: "异步PVP回放",
      playerHp: result.report?.playerFinalHp ?? 74,
      enemyHp: result.report?.enemyFinalHp ?? 0,
      timeline: result.report?.timeline || [],
      renderedTimeline: [],
      playIndex: 0,
      paused: false,
      speed: 1,
      arena,
      result: "结果：PVP胜利",
    };
  } else {
    state.hp -= result.hpDamage || 0;
    state.lifeBadge -= result.badgeLoss || 0;
    state.streak = state.streak <= 0 ? state.streak - 1 : -1;
    log(
      state,
      `PVP失败(${result.source}) 对手=${result.enemyName} HP-${result.hpDamage || 0} 徽记-${
        result.badgeLoss || 0
      }`
    );
    state.battleExplain = buildLossExplanation(result);
    const arena = buildArenaFromState("pvp");
    state.battleOverlay = {
      visible: true,
      title: "异步PVP回放",
      playerHp: result.report?.playerFinalHp ?? 0,
      enemyHp: result.report?.enemyFinalHp ?? 28,
      timeline: result.report?.timeline || [],
      renderedTimeline: [],
      playIndex: 0,
      paused: false,
      speed: 1,
      arena,
      result: "结果：PVP失败",
    };
    const latePenalty = applyLateFloorPenalty(state, result);
    if (latePenalty.hpPenalty || latePenalty.badgePenalty) {
      log(
        state,
        `终局风险倍率生效：额外惩罚 HP-${latePenalty.hpPenalty} ${latePenalty.badgePenalty ? `徽记-${latePenalty.badgePenalty}` : ""}`.trim()
      );
    }
    maybeLoseByDeath();
  }
  await playBattleOverlayTimeline();
}

async function resolveAsyncPvpWithGuard() {
  const timeoutMs = 4500;
  try {
    await Promise.race([
      resolveAsyncPvp(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("PVP结算超时")), timeoutMs)),
    ]);
  } catch {
    log(state, "异步匹配与结算超时，系统自动重试一次...");
    try {
      await Promise.race([
        resolveAsyncPvp(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("PVP重试超时")), timeoutMs)),
      ]);
    } catch {
      log(state, "结算仍超时，已回退为保底结算（判定小负）");
      state.lastBattle = {
        win: false,
        source: "fallback",
        enemyName: "超时镜像",
        hpDamage: 8,
        badgeLoss: 0,
        report: { playerPower: 0, enemyPower: 0, timeline: [{ text: "系统回退结算：小负处理", playerHp: 92, enemyHp: 100 }] },
      };
      state.hp -= 8;
      state.battleOverlay = {
        visible: true,
        title: "异步PVP回放（回退）",
        playerHp: 92,
        enemyHp: 100,
        timeline: [{ text: "结算超时，系统执行保底回退", playerHp: 92, enemyHp: 100 }],
        renderedTimeline: [],
        playIndex: 0,
        paused: false,
        speed: 1,
        arena: buildArenaFromState("pvp"),
        result: "结果：小负（保底）",
      };
      await playBattleOverlayTimeline();
    }
  }
}

async function settleFloorAndAdvance() {
  const wonPvp = !!state.lastBattle?.win;
  const addGold = settleFloorEconomy(state, wonPvp);
  state.hp = Math.min(state.hp + 2, GAME_CONFIG.initialHp);
  state.mockAliveCount = Math.max(1, state.mockAliveCount - randInt(2, 5));
  if (state.floor === 1) {
    markTutorial("floorSettled");
    if (!state.tutorial.skipped) {
      state.tutorial.completed = true;
      log(state, "第一关引导完成");
    }
  }
  log(state, `楼层${state.floor}结算：金币+${addGold}，恢复2HP，预计剩余${state.mockAliveCount}人`);

  if (state.lifeBadge <= 0) {
    log(state, "徽记耗尽，淘汰出局");
    endRun();
    return;
  }

  if (state.floor >= GAME_CONFIG.finalFloor || state.mockAliveCount <= 1) {
    log(state, "到达终局，判定为本局冠军（Demo条件）");
    endRun();
    return;
  }

  state.floor += 1;
  state.phaseIndex = 0;
  state.phaseTimeLeft = 0;
  state.phaseActions.exploreUsed = 0;
  state.phaseActions.eventUsed = 0;
  state.lastBattle = null;
  state.battleExplain = null;
  if (state.floor === 2) {
    state.floorPlan.strategy = "stable";
    log(state, "系统建议卡：第2层优先补前排并保持至少1次探索");
  }
  if (state.floor >= 7) {
    log(state, `终局风险提示：当前第${state.floor}层，失败惩罚提升`);
  }
  applyFloorPlanSuggestion();
  rollShop(state);
  rollTowerRoute(state);
  updateBackpackSummary();
  log(state, `进入楼层 ${state.floor}`);
  setActionEnabled(true);
  render(state);
}

function updateBackpackSummary() {
  const b = computeBackpackBonus(state);
  const parts = [];
  if (b.globalAtkPct) parts.push(`攻击+${Math.round(b.globalAtkPct * 100)}%`);
  if (b.globalHpPct) parts.push(`生命+${Math.round(b.globalHpPct * 100)}%`);
  if (b.endFloorHeal) parts.push(`层结算回复+${b.endFloorHeal}`);
  if (Object.keys(b.traitNeedMinus || {}).length) parts.push("羁绊门槛-1（局部）");
  if (b.triggerNotes?.length) parts.push(`触发：${b.triggerNotes.slice(0, 2).join(" / ")}`);
  state.backpackSummary = parts.length ? parts.join("，") : "暂无有效加成（先整理背包）";
}

function buildLossExplanation(result) {
  const active = state.boardSlots.filter(Boolean).length;
  const front = state.roster.filter((u) => state.boardSlots.includes(u.instanceId) && u.role === "frontline").length;
  const placedItems = state.backpackItems.filter((i) => i.placed).length;
  const reasons = [];
  const moments = [];
  const suggests = [];

  if (active < 4) {
    reasons.push("上阵单位过少，前期战力不足");
    suggests.push("至少上阵4个单位再封盘");
  }
  if (front === 0) {
    reasons.push("缺前排承伤，后排被快速击穿");
    suggests.push("补1个前排单位并置于前排格");
  }
  if (placedItems === 0) {
    reasons.push("背包未生效，丢失战前加成");
    suggests.push("封盘前点击“整理背包并放入格子”");
  }
  if (result.report?.enemyPower > result.report?.playerPower) {
    reasons.push("对手面板战力更高");
    suggests.push("优先买高费输出或触发关键羁绊");
  }
  moments.push(`开场战力差：${Math.max(0, (result.report?.enemyPower || 0) - (result.report?.playerPower || 0))}`);
  moments.push(`首个减员时段：前10秒（模拟）`);
  moments.push(`胜负拐点：中段承伤断层（模拟）`);

  return {
    lossReasons: reasons.length ? reasons.slice(0, 3) : ["战力与站位被对手小幅压制"],
    keyMoments: moments.slice(0, 3),
    recommendedAdjustments: suggests.length ? suggests.slice(0, 3) : ["优先补前排，再整理背包后封盘"],
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playBattleOverlayTimeline(forceRestart = false) {
  if (!state.battleOverlay?.visible) return;
  const full = state.battleOverlay.timeline || [];
  if (!full.length) return;
  if (state.battleOverlay.playing && !forceRestart) return;
  state.battleOverlay.playing = true;
  state.battleOverlay.playIndex = 0;
  state.battleOverlay.renderedTimeline = [];
  const arenaSeed = buildArenaFromState(state.battleOverlay.title?.includes("PVP") ? "pvp" : "pve");
  if (arenaSeed) state.battleOverlay.arena = arenaSeed;
  render(state);
  for (let i = 0; i < full.length; i += 1) {
    while (state.battleOverlay.paused) {
      await sleep(80);
      if (!state.battleOverlay.visible) return;
    }
    state.battleOverlay.playIndex = i;
    state.battleOverlay.renderedTimeline.push(full[i]);
    applyArenaStepToOverlay(full[i], i);
    if (typeof full[i].playerHp === "number") state.battleOverlay.playerHp = Math.max(0, Math.min(100, full[i].playerHp));
    if (typeof full[i].enemyHp === "number") state.battleOverlay.enemyHp = Math.max(0, Math.min(100, full[i].enemyHp));
    render(state);
    const speed = state.battleOverlay.speed || 1;
    const stepMs = Math.max(500, Math.round(1200 / speed));
    await sleep(stepMs);
  }
  state.battleOverlay.playing = false;
}

function jumpBattleKeyframe(pos) {
  const full = state.battleOverlay?.timeline || [];
  if (!full.length) return;
  let idx = 0;
  if (pos === "mid") idx = Math.max(0, Math.floor(full.length / 2));
  if (pos === "end") idx = full.length - 1;
  state.battleOverlay.playing = false;
  state.battleOverlay.renderedTimeline = full.slice(0, idx + 1);
  state.battleOverlay.playIndex = idx;
  const arenaSeed = buildArenaFromState(state.battleOverlay.title?.includes("PVP") ? "pvp" : "pve");
  if (arenaSeed) state.battleOverlay.arena = arenaSeed;
  for (let i = 0; i <= idx; i += 1) {
    applyArenaStepToOverlay(full[i], i);
    if (typeof full[i].playerHp === "number") state.battleOverlay.playerHp = Math.max(0, Math.min(100, full[i].playerHp));
    if (typeof full[i].enemyHp === "number") state.battleOverlay.enemyHp = Math.max(0, Math.min(100, full[i].enemyHp));
  }
}

function buildArenaFromState(mode) {
  const active = state.boardSlots
    .filter(Boolean)
    .map((id) => state.roster.find((u) => u.instanceId === id))
    .filter(Boolean)
    .slice(0, 7);
  const fallback = state.roster.slice(0, 4);
  const base = active.length ? active : fallback;
  const playerUnits = base.map((u, idx) => ({
    id: `p_${u.instanceId || idx}`,
    sprite: u.sprite || u.icon || "⚔️",
    image: u.image || null,
    hp: 100,
    maxHp: 100,
  }));

  const enemySprites = mode === "pvp" ? ["🛡️", "🏹", "🔮", "🗡️", "⚙️", "🧱", "🕶️"] : ["👾", "💀", "🦂", "👹", "🧟", "🐍", "🕸️"];
  const enemyUnits = Array.from({ length: Math.max(3, playerUnits.length) }, (_, i) => ({
    id: `e_${i}`,
    sprite: enemySprites[i % enemySprites.length],
    hp: 100,
    maxHp: 100,
  }));
  return {
    playerUnits,
    enemyUnits,
    activeAttackerId: "",
    activeTargetId: "",
  };
}

function extractDamage(step) {
  const m = (step?.text || "").match(/(\d+)/);
  return m ? Number(m[1]) : 8;
}

function pickAlive(units) {
  return units.filter((u) => u.hp > 0);
}

function applyArenaStepToOverlay(step, index) {
  const arena = state.battleOverlay?.arena;
  if (!arena) return;
  const dmg = extractDamage(step);
  const playerAlive = pickAlive(arena.playerUnits);
  const enemyAlive = pickAlive(arena.enemyUnits);
  arena.activeAttackerId = "";
  arena.activeTargetId = "";

  if (step.side === "player" || step.side === "item") {
    if (!enemyAlive.length || !playerAlive.length) return;
    const attacker = playerAlive[index % playerAlive.length];
    const target = enemyAlive[enemyAlive.length - 1];
    const finalDmg = step.side === "item" ? Math.round(dmg * 0.6) : dmg;
    target.hp = Math.max(0, target.hp - finalDmg);
    arena.activeAttackerId = attacker.id;
    arena.activeTargetId = target.id;
  } else if (step.side === "enemy") {
    if (!enemyAlive.length || !playerAlive.length) return;
    const attacker = enemyAlive[index % enemyAlive.length];
    const target = playerAlive[playerAlive.length - 1];
    target.hp = Math.max(0, target.hp - dmg);
    arena.activeAttackerId = attacker.id;
    arena.activeTargetId = target.id;
  }
}

bootstrap();
