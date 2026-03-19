import { GAME_CONFIG } from "../configs/game.config.js";
import { getCurrentPhase } from "./state.js";

function el(id) {
  return document.getElementById(id);
}

export function bindActions(handlers) {
  el("startRunBtn").addEventListener("click", handlers.onStart);
  el("endRunBtn").addEventListener("click", handlers.onEnd);
  el("exploreBtn").addEventListener("click", handlers.onExplore);
  el("eventBtn").addEventListener("click", handlers.onEvent);
  el("refreshShopBtn").addEventListener("click", handlers.onRefreshShop);
  el("autoArrangeBtn").addEventListener("click", handlers.onAutoArrange);
  el("skipTutorialBtn").addEventListener("click", handlers.onSkipTutorial);
  el("endPhaseBtn").addEventListener("click", handlers.onEndPhase);
  el("strategyStableBtn").addEventListener("click", () => handlers.onSetStrategy("stable"));
  el("strategyGreedyBtn").addEventListener("click", () => handlers.onSetStrategy("greedy"));
  el("closeBattleOverlayBtn").addEventListener("click", handlers.onCloseBattleOverlay);
  el("battlePauseBtn").addEventListener("click", handlers.onToggleBattlePause);
  el("battleSpeedBtn").addEventListener("click", handlers.onToggleBattleSpeed);

  document.addEventListener("click", (event) => {
    const unitBtn = event.target.closest?.("[data-buy-unit-index]");
    if (unitBtn) {
      handlers.onBuyUnit(Number(unitBtn.dataset.buyUnitIndex));
      return;
    }
    const itemBtn = event.target.closest?.("[data-buy-item-index]");
    if (itemBtn) {
      handlers.onBuyItem(Number(itemBtn.dataset.buyItemIndex));
      return;
    }
    const removeBagBtn = event.target.closest?.("[data-remove-bag-item-id]");
    if (removeBagBtn) {
      handlers.onRemoveBagItem(removeBagBtn.dataset.removeBagItemId);
      return;
    }
  });

  document.addEventListener("dragstart", (event) => {
    const dragNode = event.target.closest?.("[data-drag-unit-id], [data-drag-item-id]");
    if (!dragNode) return;
    const payload = {
      kind: dragNode.dataset.dragItemId ? "item" : "unit",
      unitId: dragNode.dataset.dragUnitId,
      itemId: dragNode.dataset.dragItemId,
      fromBoardIndex: dragNode.dataset.fromBoardIndex ?? "",
    };
    event.dataTransfer?.setData("application/json", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  });

  document.addEventListener("dragover", (event) => {
    const zone = event.target.closest?.("[data-board-drop-index]");
    const bagZone = event.target.closest?.("[data-bag-drop-col]");
    if (!zone && !bagZone) return;
    event.preventDefault();
    if (zone) zone.classList.add("drag-over");
    if (bagZone) bagZone.classList.add("drag-over");
  });

  document.addEventListener("dragleave", (event) => {
    const zone = event.target.closest?.("[data-board-drop-index]");
    const bagZone = event.target.closest?.("[data-bag-drop-col]");
    if (!zone && !bagZone) return;
    zone?.classList.remove("drag-over");
    bagZone?.classList.remove("drag-over");
  });

  document.addEventListener("drop", (event) => {
    const zone = event.target.closest?.("[data-board-drop-index]");
    const bagZone = event.target.closest?.("[data-bag-drop-col]");
    if (!zone && !bagZone) return;
    event.preventDefault();
    zone?.classList.remove("drag-over");
    bagZone?.classList.remove("drag-over");
    const raw = event.dataTransfer?.getData("application/json");
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (zone) {
      handlers.onBoardDrop(payload, Number(zone.dataset.boardDropIndex));
    } else if (bagZone) {
      handlers.onBagDrop(payload, Number(bagZone.dataset.bagDropCol), Number(bagZone.dataset.bagDropRow));
    }
  });
}

export function setActionEnabled(enabled) {
  ["exploreBtn", "eventBtn", "refreshShopBtn", "autoArrangeBtn", "strategyStableBtn", "strategyGreedyBtn", "endPhaseBtn"].forEach((id) => {
    el(id).disabled = !enabled;
  });
}

export function setRunButtons(active) {
  el("startRunBtn").disabled = active;
  el("endRunBtn").disabled = !active;
}

export function render(state) {
  renderStatus(state);
  renderHud(state);
  renderTowerRoute(state);
  renderActionHints(state);
  renderBoard(state);
  renderBackpack(state);
  renderRoster(state);
  renderShops(state);
  renderLog(state);
  renderBattleOverlay(state);
  renderTutorial(state);
}

function renderStatus(state) {
  const phase = getCurrentPhase(state);
  const html = `
    <div><span class="tag">RunID</span>${state.runId || "-"}</div>
    <div><span class="tag">楼层</span>${state.floor}/${GAME_CONFIG.finalFloor}</div>
    <div><span class="tag">阶段</span>${phase.manual ? `${phase.label}（手动结束）` : phase.label}</div>
    <div><span class="tag">生命值</span>${state.hp}</div>
    <div><span class="tag">徽记</span>${state.lifeBadge}</div>
    <div><span class="tag">金币</span>${state.gold}</div>
    <div><span class="tag">齿轮</span>${state.gear}</div>
    <div><span class="tag">秘能</span>${state.mana}</div>
    <div><span class="tag">连胜/败</span>${state.streak}</div>
    <div><span class="tag">存活估计</span>${state.mockAliveCount}</div>
  `;
  el("runStatus").innerHTML = html;
}

function renderHud(state) {
  const phase = getCurrentPhase(state);
  el("hudRunId").textContent = state.runId || "-";
  el("hudFloor").textContent = `${state.floor}/${GAME_CONFIG.finalFloor}`;
  el("hudPhase").textContent = phase.manual ? `${phase.label} 手动` : phase.label;
  el("hudHp").textContent = `${state.hp}`;
  el("hudBadge").textContent = `${state.lifeBadge}`;
  el("hudGold").textContent = `${state.gold}`;
  el("hudGear").textContent = `${state.gear}`;
  el("hudMana").textContent = `${state.mana}`;
  el("hudAlive").textContent = `${state.mockAliveCount}`;
  if (state.floor >= 7) {
    el("hudPhase").classList.add("bad");
  } else {
    el("hudPhase").classList.remove("bad");
  }
}

function renderTowerRoute(state) {
  const map = {
    combat: { icon: "⚔️", text: "战斗" },
    elite: { icon: "💀", text: "精英" },
    event: { icon: "❓", text: "事件" },
    shop: { icon: "🛒", text: "商店" },
    rest: { icon: "🔥", text: "营地" },
    boss: { icon: "👑", text: "层主" },
  };
  const route = state.tower?.route || [];
  if (!route.length) {
    el("towerRoute").innerHTML = "<span class='muted'>本层路径未生成</span>";
    return;
  }
  const html = route
    .map((node, idx) => {
      const meta = map[node] || { icon: "•", text: node };
      const cls = idx < state.tower.step ? "route-node done" : idx === state.tower.step ? "route-node current" : "route-node";
      return `<div class="${cls} has-tip" data-tip="节点：${meta.text}\n第${idx + 1}步">${meta.icon} ${meta.text}</div>`;
    })
    .join("");
  const history = (state.tower.history || []).map((n) => map[n]?.text || n).join(" -> ");
  el("towerRoute").innerHTML = `<div class="tower-route">${html}</div><div class="muted">已走：${history || "尚未推进"}</div>`;
}

function renderActionHints(state) {
  const exploreLeft = Math.max(0, GAME_CONFIG.phaseActionLimit.explore - state.phaseActions.exploreUsed);
  const eventLeft = Math.max(0, GAME_CONFIG.phaseActionLimit.event - state.phaseActions.eventUsed);
  const phase = getCurrentPhase(state);
  const canOperate = state.runActive && phase.key === "PVE_OPEN";
  const canPickStrategy = canOperate && state.phaseActions.exploreUsed === 0 && state.phaseActions.eventUsed === 0;

  el("exploreBtn").textContent = `探索节点（剩余${exploreLeft}）`;
  el("eventBtn").textContent = `触发事件（剩余${eventLeft}）`;
  el("exploreBtn").disabled = !canOperate || exploreLeft <= 0;
  el("eventBtn").disabled = !canOperate || eventLeft <= 0;
  el("refreshShopBtn").disabled = !canOperate;
  el("autoArrangeBtn").disabled = !canOperate;
  el("endPhaseBtn").disabled = !canOperate;
  el("strategyStableBtn").disabled = !canPickStrategy;
  el("strategyGreedyBtn").disabled = !canPickStrategy;

  const strategyText = state.floorPlan.strategy === "greedy" ? "先事件 -> 买输出单位 -> 整理背包 -> 探索" : "先买前排 -> 探索稳血 -> 再事件补收益";
  el("floorSuggestion").textContent = `本层建议动作序列：${state.floorPlan.suggestion || strategyText}`;

  el("exploreBtn").classList.add("has-tip");
  el("eventBtn").classList.add("has-tip");
  el("exploreBtn").setAttribute(
    "data-tip",
    `预计收益：金币 +2~4，秘能 +0~1\n风险：中（必定战斗，可能掉血）\n策略建议：${state.floorPlan.strategy === "greedy" ? "可作为后手补资源" : "优先执行"}`
  );
  el("eventBtn").setAttribute(
    "data-tip",
    "预计收益：波动高（可能赚资源或掉血）\n风险：高（随机分支）\n策略建议：贪收益可优先，稳健线可后置"
  );
}

function renderBoard(state) {
  const view = el("boardView");
  view.innerHTML = "";
  for (let i = 0; i < state.boardSlots.length; i += 1) {
    const cell = document.createElement("div");
    cell.className = "cell board-drop";
    cell.dataset.boardDropIndex = String(i);
    const instanceId = state.boardSlots[i];
    if (instanceId) {
      const unit = state.roster.find((u) => u.instanceId === instanceId);
      const tip = `作用：${unit?.role || "unit"}\n羁绊：${(unit?.trait || []).join("/")}\n建议：前排抗伤，后排输出，防止被切后排`;
      cell.innerHTML = `
        <div class="card-title has-tip" data-tip="${tip}" draggable="true" data-drag-unit-id="${unit?.instanceId}" data-from-board-index="${i}">
          <span class="icon">${unit?.icon || "⚔️"}</span>
          <span class="unit">${unit?.name || "未知单位"}</span>
        </div>
        <div class="card-meta">T${unit?.tier ?? "?"} HP${unit?.hp ?? 0} ATK${unit?.atk ?? 0}</div>
      `;
    } else {
      cell.innerHTML = "<span class='muted'>拖动单位到此</span>";
    }
    view.appendChild(cell);
  }
}

function renderBackpack(state) {
  const stats = el("backpackStats");
  const placed = state.backpackItems.filter((i) => i.placed).length;
  const waiting = state.backpackItems.length - placed;
  const waitingText = state.backpackItems
    .filter((i) => !i.placed)
    .map((i) => `${i.icon || "📦"}${i.name}`)
    .join("、");
  stats.innerHTML = `<div>道具总数：${state.backpackItems.length} ｜ 已放入：${placed} ｜ 待整理：${waiting}</div>
    <div class="muted">${waiting > 0 ? `待整理列表：${waitingText}` : "待整理列表：无"}</div>
    <div class="muted">战前加成摘要：${state.backpackSummary || "暂无有效加成（先整理背包）"}</div>`;

  const stash = el("backpackStash");
  const stashHtml = state.backpackItems
    .map((item) => {
      const status = item.placed ? "已放置" : "待放置";
      return `
      <div class="stash-item has-tip" data-tip="形状：${item.shape.length}x${item.shape[0].length}\n作用：${item.summary || "构筑加成"}">
        <div class="stash-item-head" draggable="true" data-drag-item-id="${item.instanceId}">
          <span>${item.icon || "📦"} ${item.name}</span>
          <span class="card-meta">${status}</span>
        </div>
        <div class="stash-actions">
          ${
            item.placed
              ? `<button class="buy-btn" data-remove-bag-item-id="${item.instanceId}">取下</button>`
              : `<span class="muted">拖拽到背包格子放置</span>`
          }
        </div>
      </div>`;
    })
    .join("");
  stash.innerHTML = stashHtml || "<span class='muted'>暂无道具</span>";

  const view = el("backpackView");
  view.innerHTML = "";
  const anchorSet = new Set(
    state.backpackItems.filter((i) => i.placed && i.anchor).map((i) => `${i.anchor.col}:${i.anchor.row}:${i.instanceId}`)
  );
  for (let i = 0; i < state.backpackGrid.length; i += 1) {
    const row = Math.floor(i / GAME_CONFIG.backpack.cols);
    const col = i % GAME_CONFIG.backpack.cols;
    const cell = document.createElement("div");
    const itemInstanceId = state.backpackGrid[i];
    const item = state.backpackItems.find((x) => x.instanceId === itemInstanceId);
    cell.dataset.bagDropCol = String(col);
    cell.dataset.bagDropRow = String(row);
    cell.className = `bag-cell ${item ? "bag-filled" : ""}`;
    if (item) {
      cell.classList.add("has-tip");
      cell.setAttribute("data-tip", `道具：${item.name}\n作用：${item.summary || "提供战前加成"}`);
    }
    const isAnchor = item ? anchorSet.has(`${col}:${row}:${item.instanceId}`) : false;
    if (item && isAnchor) {
      cell.textContent = `${item.icon || "📦"}${item.name.slice(0, 2)}`;
    } else if (item) {
      cell.classList.add("fill-fragment");
      cell.textContent = "■";
    } else {
      cell.textContent = "";
    }
    view.appendChild(cell);
  }
}

function renderRoster(state) {
  const activeSet = new Set(state.boardSlots.filter(Boolean));
  const bench = state.roster.filter((u) => !activeSet.has(u.instanceId));
  if (!bench.length) {
    el("unitRoster").innerHTML = "<span class='muted'>暂无候战单位（可从商店购买）</span>";
    return;
  }
  const list = bench
    .map(
      (u) => `
      <div class="bench-card has-tip" data-tip="拖到棋盘可上阵。作用：${u.role}，羁绊：${u.trait.join("/")}" draggable="true" data-drag-unit-id="${u.instanceId}">
        <div class="card-head">
          <div class="card-title"><span class="icon">${u.icon || "⚔️"}</span><strong>${u.name}</strong></div>
          <span class="card-meta">T${u.tier}</span>
        </div>
        <div class="card-meta">HP ${u.hp} / ATK ${u.atk}</div>
      </div>
    `
    )
    .join("");
  el("unitRoster").innerHTML = `<div class="bench-list">${list}</div>`;
}

function renderShops(state) {
  const phase = getCurrentPhase(state);
  const canOperate = state.runActive && phase.key === "PVE_OPEN";
  const units = state.shopUnits
    .map((u, idx) => {
      const cost = GAME_CONFIG.shop.unitCostByTier[u.tier] || 3;
      return `
      <div class="shop-card">
        <div class="card-head">
          <div class="card-title has-tip" data-tip="单位作用：${u.role}\n羁绊：${u.trait.join("/")}\n建议：${
            u.role === "frontline" ? "可优先上阵承担伤害" : "可放后排打输出"
          }"><span class="icon">${u.icon || "⚔️"}</span><strong>${u.name}</strong></div>
          <button class="buy-btn" data-buy-unit-index="${idx}" ${canOperate ? "" : "disabled"}>购买 ${cost}g</button>
        </div>
        <div class="card-meta">T${u.tier} | ${u.role} | HP ${u.hp} / ATK ${u.atk}</div>
      </div>
      `;
    })
    .join("");

  const items = state.shopItems
    .map((i, idx) => {
      const cost = GAME_CONFIG.shop.itemCostByRarity[i.rarity] || 2;
      return `
      <div class="shop-card">
        <div class="card-head">
          <div class="card-title has-tip" data-tip="道具作用：${i.summary || "提供构筑加成"}\n稀有度：${i.rarity}"><span class="icon">${i.icon || "📦"}</span><strong>${i.name}</strong></div>
          <button class="buy-btn" data-buy-item-index="${idx}" ${canOperate ? "" : "disabled"}>购买 ${cost}g</button>
        </div>
        <div class="card-meta">${i.rarity} | 形状 ${i.shape.length}x${i.shape[0].length}</div>
      </div>
      `;
    })
    .join("");
  el("shopUnits").innerHTML = units ? `<div class="shop-list">${units}</div>` : "<span class='muted'>空</span>";
  el("shopItems").innerHTML = items ? `<div class="shop-list">${items}</div>` : "<span class='muted'>空</span>";
}

function renderLog(state) {
  const explain = el("battleExplain");
  if (state.battleExplain) {
    explain.classList.remove("hidden");
    explain.innerHTML = `
      <strong>失败归因卡</strong><br/>
      关键问题：${state.battleExplain.lossReasons.join("；")}<br/>
      关键时刻：${state.battleExplain.keyMoments.join("；")}<br/>
      建议调整：${state.battleExplain.recommendedAdjustments.join("；")}
    `;
  } else {
    explain.classList.add("hidden");
    explain.innerHTML = "";
  }
  const latest = state.logs[0] || "";
  const key = latest.includes("PVP") || latest.includes("徽记") || latest.includes("淘汰") ? latest : "";
  const html = state.logs
    .map((line) => {
      let cls = "";
      if (line.includes("PVP失败") || line.includes("淘汰") || line.includes("超时")) cls = "bad";
      if (line.includes("PVP胜利") || line.includes("恢复") || line.includes("奖励")) cls = "good";
      return `<div class="${cls}">${line}</div>`;
    })
    .join("");
  el("logView").innerHTML = `${key ? `<div class="log-key">${key}</div>` : ""}${html}`;
}

function renderBattleOverlay(state) {
  const overlay = el("battleOverlay");
  if (!state.battleOverlay?.visible) {
    overlay.classList.add("hidden");
    return;
  }
  overlay.classList.remove("hidden");
  el("battleTitle").textContent = state.battleOverlay.title || "战斗回放";
  el("battlePlayerHp").textContent = `${state.battleOverlay.playerHp}`;
  el("battleEnemyHp").textContent = `${state.battleOverlay.enemyHp}`;
  const pPct = Math.max(0, Math.min(100, state.battleOverlay.playerHp));
  const ePct = Math.max(0, Math.min(100, state.battleOverlay.enemyHp));
  el("battlePlayerBar").style.width = `${pPct}%`;
  el("battleEnemyBar").style.width = `${ePct}%`;
  const displayTimeline = state.battleOverlay.playing
    ? state.battleOverlay.renderedTimeline || []
    : state.battleOverlay.timeline || [];
  const fullTimeline = state.battleOverlay.timeline || [];
  const iconOf = (step) => {
    if (step.side === "player") return "🟦";
    if (step.side === "enemy") return "🟥";
    if (step.side === "item") return "🟨";
    return "⬜";
  };
  const currentTrackIndex = state.battleOverlay.playing
    ? Math.max(0, state.battleOverlay.playIndex ?? 0)
    : fullTimeline.length - 1;
  el("battleTrack").innerHTML = fullTimeline
    .map((step, idx) => `<span class="track-node ${idx <= currentTrackIndex ? "on" : ""}">${iconOf(step)} R${idx + 1}</span>`)
    .join("");
  el("battleTimeline").innerHTML = displayTimeline
    .map((x, idx) => `<div class="${state.battleOverlay.playing && idx === state.battleOverlay.playIndex ? "battle-step-active" : ""}">${x.text}</div>`)
    .join("");
  el("battleResult").textContent = `${state.battleOverlay.result || ""}${state.battleOverlay.playing ? "（播放中）" : ""}`;
  el("battlePauseBtn").textContent = state.battleOverlay.paused ? "继续" : "暂停";
  el("battleSpeedBtn").textContent = `速度 ${state.battleOverlay.speed || 1}x`;
}

function renderTutorial(state) {
  const overlay = el("tutorialOverlay");
  const desc = el("tutorialDesc");
  const hint = el("tutorialHint");
  const bar = el("tutorialProgressBar");
  clearGuideTarget();

  if (!state.runActive || state.floor !== 1 || state.tutorial.skipped || state.tutorial.completed) {
    overlay.classList.add("hidden");
    return;
  }

  const stepInfo = getTutorialStep(state);
  if (!stepInfo) {
    overlay.classList.add("hidden");
    return;
  }

  overlay.classList.remove("hidden");
  desc.textContent = stepInfo.title;
  hint.textContent = stepInfo.hint;
  bar.style.width = `${Math.round(((state.tutorial.step + 1) / 6) * 100)}%`;

  if (stepInfo.targetButtonId) {
    const target = el(stepInfo.targetButtonId);
    target?.classList.add("guided-target");
  }
  if (stepInfo.targetSelector) {
    document.querySelector(stepInfo.targetSelector)?.classList.add("guided-target");
  }
}

function getTutorialStep(state) {
  const marks = state.tutorial.actionMarks;
  const steps = [
    {
      title: "第1步：点击“探索节点”，体验一场PVE战斗。",
      hint: "探索可以获取金币和秘能，是每层核心收益来源。",
      targetButtonId: "exploreBtn",
      done: marks.explored,
    },
    {
      title: "第2步：点击“购买单位”，补强你的棋盘阵容。",
      hint: "单位越完整，封盘后的自动战斗胜率越高。",
      targetSelector: "[data-buy-unit-index]",
      done: marks.boughtUnit,
    },
    {
      title: "第3步：点击“购买道具”，构筑背包联动。",
      hint: "背包道具会提供全局加成和触发效果。",
      targetSelector: "[data-buy-item-index]",
      done: marks.boughtItem,
    },
    {
      title: "第4步：点击“整理背包并放入格子”，确认放置完成。",
      hint: "整理后才能吃到背包加成。",
      targetButtonId: "autoArrangeBtn",
      done: marks.arranged,
    },
    {
      title: "第5步：点击“结束当前阶段并封盘”。",
      hint: "当前改为手动结束自由探索，不再强制倒计时。",
      targetButtonId: "endPhaseBtn",
      done: marks.pvpResolved,
    },
    {
      title: "第6步：完成第一层结算，引导结束。",
      hint: "你已经掌握基础循环：PVE运营 -> 手动封盘 -> 异步PVP -> 结算。",
      targetButtonId: "",
      done: marks.floorSettled,
    },
  ];

  for (let i = 0; i < steps.length; i += 1) {
    if (!steps[i].done) {
      state.tutorial.step = i;
      return steps[i];
    }
  }
  state.tutorial.completed = true;
  return null;
}

function clearGuideTarget() {
  const ids = ["exploreBtn", "autoArrangeBtn", "endPhaseBtn"];
  for (const id of ids) {
    el(id)?.classList.remove("guided-target");
  }
  document.querySelectorAll("[data-buy-unit-index], [data-buy-item-index]").forEach((node) => {
    node.classList.remove("guided-target");
  });
}
