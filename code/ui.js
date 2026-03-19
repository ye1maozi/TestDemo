import { GAME_CONFIG } from "../configs/game.config.js";
import { getNodePixelArt } from "./pixelArt.js";
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
  el("battleReplayBtn").addEventListener("click", handlers.onReplayBattle);
  el("battleKeyStartBtn").addEventListener("click", () => handlers.onJumpBattleKeyframe("start"));
  el("battleKeyMidBtn").addEventListener("click", () => handlers.onJumpBattleKeyframe("mid"));
  el("battleKeyEndBtn").addEventListener("click", () => handlers.onJumpBattleKeyframe("end"));
  el("sideTabShopBtn").addEventListener("click", () => handlers.onSwitchSideTab("shop"));
  el("sideTabBagBtn").addEventListener("click", () => handlers.onSwitchSideTab("bag"));
  el("sideTabLogBtn").addEventListener("click", () => handlers.onSwitchSideTab("log"));

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
    const rotateBagBtn = event.target.closest?.("[data-rotate-bag-item-id]");
    if (rotateBagBtn) {
      handlers.onRotateBagItem(rotateBagBtn.dataset.rotateBagItemId);
      return;
    }
    const routePickBtn = event.target.closest?.("[data-select-node-index]");
    if (routePickBtn) {
      handlers.onSelectTowerNode(Number(routePickBtn.dataset.selectNodeIndex));
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
  renderSideTabs(state);
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

function renderSideTabs(state) {
  const current = state.ui?.sideTab || "shop";
  const tabs = [
    { id: "sideTabShopBtn", key: "shop" },
    { id: "sideTabBagBtn", key: "bag" },
    { id: "sideTabLogBtn", key: "log" },
  ];
  tabs.forEach((t) => {
    const btn = el(t.id);
    if (!btn) return;
    btn.classList.toggle("active", t.key === current);
  });
  el("sideShopPanel")?.classList.toggle("hidden", current !== "shop");
  el("sideBagPanel")?.classList.toggle("hidden", current !== "bag");
  el("sideLogPanel")?.classList.toggle("hidden", current !== "log");
}

function renderStatus(state) {
  const phase = getCurrentPhase(state);
  const html = `
    <div><span class="tag">Run</span>${(state.runId || "-").slice(-6)}</div>
    <div><span class="tag">层</span>${state.floor}/${GAME_CONFIG.finalFloor}</div>
    <div><span class="tag">阶段</span>${phase.label}</div>
    <div><span class="tag">❤</span>${state.hp}</div>
    <div><span class="tag">徽记</span>${state.lifeBadge}</div>
    <div><span class="tag">💰</span>${state.gold}</div>
    <div><span class="tag">存活</span>${state.mockAliveCount}</div>
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
    combat: { icon: "⚔️", text: "战斗", color: "2a4a6a" },
    elite: { icon: "💀", text: "精英", color: "5a2a3a" },
    event: { icon: "❓", text: "事件", color: "4a4a6a" },
    shop: { icon: "🛒", text: "商店", color: "3a5a4a" },
    rest: { icon: "🔥", text: "营地", color: "6a3a2a" },
    boss: { icon: "👑", text: "层主", color: "5a4a2a" },
  };
  const route = state.tower?.route || [];
  if (!route.length) {
    el("towerRoute").innerHTML = "<span class='muted'>本层路径未生成</span>";
    return;
  }
  const html = route
    .map((layer, idx) => {
      const layerNodes = (layer || [])
        .map((node, nodeIdx) => {
          const meta = map[node] || { icon: "•", text: node, color: "3a4a5a" };
          const isDone = idx < state.tower.step;
          const isCurrent = idx === state.tower.step;
          const isPicked = isCurrent && nodeIdx === (state.tower.selectedNode || 0);
          const cls = `route-node ${isDone ? "done" : ""} ${isCurrent ? "current" : ""} ${isPicked ? "picked" : ""}`.trim();
          const disabled = isCurrent ? "" : "disabled";
          const nodeImg = getNodePixelArt(node) || `https://placehold.co/40x40/${meta.color || "2a3a4a"}/8b9dc3?text=${encodeURIComponent(meta.icon)}`;
          return `<button class="${cls} has-tip" ${disabled} data-select-node-index="${nodeIdx}" data-tip="节点：${meta.text}\n第${idx + 1}步可选分支"><img class="route-node-img" src="${nodeImg}" alt=""><span class="route-node-text">${meta.text}</span></button>`;
        })
        .join("");
      return `<div class="tower-layer">${layerNodes}</div>`;
    })
    .join("");
  const history = (state.tower.history || []).map((n) => map[n]?.text || n).join(" → ");
  el("towerRoute").innerHTML = `<div class="tower-route">${html}</div><div class="muted">已走：${history || "尚未推进"}</div>`;
}

function renderActionHints(state) {
  const exploreLeft = Math.max(0, GAME_CONFIG.phaseActionLimit.explore - state.phaseActions.exploreUsed);
  const eventLeft = Math.max(0, GAME_CONFIG.phaseActionLimit.event - state.phaseActions.eventUsed);
  const phase = getCurrentPhase(state);
  const canOperate = state.runActive && phase.key === "PVE_OPEN";
  const canPickStrategy = canOperate && state.phaseActions.exploreUsed === 0 && state.phaseActions.eventUsed === 0;
  const layer = state.tower?.route?.[state.tower?.step] || [];
  const currentNode = layer[Math.max(0, Math.min(layer.length - 1, state.tower?.selectedNode || 0))] || state.tower?.currentNode || "combat";
  const isCombatNode = ["combat", "elite", "boss"].includes(currentNode);
  const isEventNode = ["event", "shop", "rest"].includes(currentNode);

  el("exploreBtn").textContent = `探索节点（剩余${exploreLeft}）`;
  el("eventBtn").textContent = `触发事件（剩余${eventLeft}）`;
  el("exploreBtn").disabled = !canOperate || exploreLeft <= 0 || !isCombatNode;
  el("eventBtn").disabled = !canOperate || eventLeft <= 0 || !isEventNode;
  el("refreshShopBtn").disabled = !canOperate;
  el("autoArrangeBtn").disabled = !canOperate;
  el("endPhaseBtn").disabled = !canOperate;
  el("strategyStableBtn").disabled = !canPickStrategy;
  el("strategyGreedyBtn").disabled = !canPickStrategy;

  const strategyText = state.floorPlan.strategy === "greedy" ? "事件→买输出→整理→探索" : "买前排→探索→事件";
  el("floorSuggestion").textContent = `节点：${currentNode} ｜ ${state.floorPlan.suggestion || strategyText}`;
  const previewMap = {
    combat: "普通战斗",
    elite: "精英战",
    boss: "层主战",
    event: "事件",
    shop: "商店",
    rest: "营地",
  };
  const nodeEl = el("nodePreview");
  if (nodeEl) nodeEl.textContent = previewMap[currentNode] || "未知";

  el("exploreBtn").classList.add("has-tip");
  el("eventBtn").classList.add("has-tip");
  el("exploreBtn").setAttribute(
    "data-tip",
    `预计收益：金币 +2~4，秘能 +0~1\n风险：中（必定战斗，可能掉血）\n当前节点：${currentNode}\n策略建议：${
      state.floorPlan.strategy === "greedy" ? "可作为后手补资源" : "优先执行"
    }`
  );
  el("eventBtn").setAttribute(
    "data-tip",
    "预计收益：波动高（可能赚资源或掉血）\n风险：高（随机分支）\n策略建议：贪收益可优先，稳健线可后置"
  );
}

function unitVisual(unit, opts = {}) {
  const imgCls = opts.imgClass || "unit-img";
  const fallback = unit?.sprite || unit?.icon || "⚔️";
  if (unit?.image) {
    return `<span class="unit-visual-wrap"><img class="${imgCls}" src="${unit.image}" alt="${unit?.name || ""}" loading="lazy" onerror="this.style.display='none';var n=this.nextElementSibling;if(n)n.style.display='inline'"><span class="unit-sprite unit-fallback" style="display:none">${fallback}</span></span>`;
  }
  return `<span class="unit-sprite">${fallback}</span>`;
}

function itemVisual(item, opts = {}) {
  const imgCls = opts.imgClass || "item-img";
  const fallback = item?.icon || item?.tileIcon || "📦";
  if (item?.image) {
    return `<span class="item-visual-wrap"><img class="${imgCls}" src="${item.image}" alt="${item?.name || ""}" loading="lazy" onerror="this.style.display='none';var n=this.nextElementSibling;if(n)n.style.display='inline'"><span class="item-icon item-fallback" style="display:none">${fallback}</span></span>`;
  }
  return `<span class="item-icon">${fallback}</span>`;
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
      const tint = unit?.tint || "#7fc7ff";
      const visual = unitVisual(unit, { imgClass: "unit-img board-unit-img" });
      cell.innerHTML = `
        <div class="unit-token has-tip" style="--unit-tint:${tint}" data-tip="${tip}" draggable="true" data-drag-unit-id="${unit?.instanceId}" data-from-board-index="${i}">
          ${visual}
          <span class="unit-tier">T${unit?.tier ?? "?"}</span>
        </div>
      `;
    } else {
      cell.innerHTML = "<span class='board-empty-dot'>+</span>";
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
          <div class="stash-item-pic">${itemVisual(item, { imgClass: "item-img stash-item-img" })}</div>
          <div class="stash-item-info">
            <span class="stash-item-name">${item.name}</span>
            <span class="card-meta">${status}</span>
          </div>
        </div>
        <div class="stash-actions">
          <button class="buy-btn" data-rotate-bag-item-id="${item.instanceId}">旋转</button>
          ${
            item.placed
              ? `<button class="buy-btn" data-remove-bag-item-id="${item.instanceId}">取下</button>`
              : `<span class="muted">拖到格子</span>`
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
    if (item) {
      cell.style.setProperty("--item-tint", item.tint || "#4974bc");
      const tileVisual = item.image
        ? `<img class="bag-tile-img ${isAnchor ? "anchor" : ""}" src="${item.image}" alt="" loading="lazy">`
        : `<span class="bag-tile-icon ${isAnchor ? "anchor" : ""}">${item.tileIcon || item.icon || "📦"}</span>`;
      cell.innerHTML = tileVisual;

      const topSame = row > 0 && state.backpackGrid[(row - 1) * GAME_CONFIG.backpack.cols + col] === item.instanceId;
      const rightSame =
        col + 1 < GAME_CONFIG.backpack.cols && state.backpackGrid[row * GAME_CONFIG.backpack.cols + (col + 1)] === item.instanceId;
      const bottomSame =
        row + 1 < GAME_CONFIG.backpack.rows && state.backpackGrid[(row + 1) * GAME_CONFIG.backpack.cols + col] === item.instanceId;
      const leftSame = col > 0 && state.backpackGrid[row * GAME_CONFIG.backpack.cols + (col - 1)] === item.instanceId;

      if (topSame) cell.classList.add("join-top");
      if (rightSame) cell.classList.add("join-right");
      if (bottomSame) cell.classList.add("join-bottom");
      if (leftSame) cell.classList.add("join-left");
    } else {
      cell.innerHTML = "";
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
        <div class="card-pic">${unitVisual(u, { imgClass: "unit-img bench-unit-img" })}</div>
        <div class="card-body">
          <div class="card-title"><strong>${u.name}</strong><span class="card-meta">T${u.tier}</span></div>
          <div class="card-stats">❤${u.hp} ⚔${u.atk}</div>
        </div>
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
      <div class="shop-card shop-card-unit has-tip" data-tip="单位作用：${u.role}\n羁绊：${u.trait.join("/")}\n建议：${
        u.role === "frontline" ? "可优先上阵承担伤害" : "可放后排打输出"
      }">
        <div class="shop-card-pic">${unitVisual(u, { imgClass: "unit-img shop-unit-img" })}</div>
        <div class="shop-card-body">
          <strong class="shop-card-name">${u.name}</strong>
          <div class="shop-card-meta">T${u.tier} · ❤${u.hp} ⚔${u.atk}</div>
          <button class="buy-btn" data-buy-unit-index="${idx}" ${canOperate ? "" : "disabled"}>${cost}g 购买</button>
        </div>
      </div>
      `;
    })
    .join("");

  const items = state.shopItems
    .map((i, idx) => {
      const cost = GAME_CONFIG.shop.itemCostByRarity[i.rarity] || 2;
      return `
      <div class="shop-card shop-card-item has-tip" data-tip="道具作用：${i.summary || "提供构筑加成"}\n稀有度：${i.rarity}">
        <div class="shop-card-pic">${itemVisual(i, { imgClass: "item-img shop-item-img" })}</div>
        <div class="shop-card-body">
          <strong class="shop-card-name">${i.name}</strong>
          <div class="shop-card-meta">${i.rarity}</div>
          <button class="buy-btn" data-buy-item-index="${idx}" ${canOperate ? "" : "disabled"}>${cost}g 购买</button>
        </div>
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
  const list = key ? state.logs.slice(1) : state.logs;
  const html = list
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
  el("battleReplayBtn").disabled = state.battleOverlay.playing;
  renderBattleArena(state.battleOverlay);
}

let attackFloatTimeoutId = 0;

function renderBattleAttackFloat(overlayState) {
  const float = el("battleAttackFloat");
  if (!float) return;
  const aid = overlayState?.arena?.activeAttackerId || "";
  const tid = overlayState?.arena?.activeTargetId || "";
  const playerUnits = overlayState?.arena?.playerUnits || [];
  const enemyUnits = overlayState?.arena?.enemyUnits || [];
  const attacker = [...playerUnits, ...enemyUnits].find((u) => u && u.id === aid);
  const target = [...playerUnits, ...enemyUnits].find((u) => u && u.id === tid);

  if (!attacker || !target) {
    float.classList.add("hidden");
    float.classList.remove("attack-active");
    return;
  }

  const cell = (u) => {
    if (u.image) return `<img src="${u.image}" alt="">`;
    return `<span class="arena-sprite">${u.sprite || "⚔️"}</span>`;
  };
  el("attackFloatAttacker").innerHTML = cell(attacker);
  el("attackFloatTarget").innerHTML = cell(target);

  float.classList.remove("hidden");
  clearTimeout(attackFloatTimeoutId);
  float.classList.add("attack-active");
  attackFloatTimeoutId = setTimeout(() => {
    float.classList.remove("attack-active");
    attackFloatTimeoutId = setTimeout(() => {
      float.classList.add("hidden");
    }, 150);
  }, 950);
}

function renderBattleArena(overlayState) {
  const arena = el("battleArena");
  const playerUnits = overlayState?.arena?.playerUnits || [];
  const enemyUnits = overlayState?.arena?.enemyUnits || [];
  const activeAttacker = overlayState?.arena?.activeAttackerId || "";
  const activeTarget = overlayState?.arena?.activeTargetId || "";

  const renderUnit = (u, side) => {
    if (!u) return `<div class="arena-unit ${side} dead"></div>`;
    const hpPct = Math.max(0, Math.min(100, Math.round((u.hp / u.maxHp) * 100)));
    const cls = [
      "arena-unit",
      side,
      u.hp <= 0 ? "dead" : "",
      u.id === activeAttacker ? "attacker" : "",
      u.id === activeTarget ? "target" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const visual = u.image
      ? `<img class="arena-unit-img" src="${u.image}" alt="">`
      : `<span class="arena-sprite">${u.sprite || "⚔️"}</span>`;
    return `<div class="${cls}">${visual}<div class="arena-hp"><i style="width:${hpPct}%"></i></div></div>`;
  };

  const padTo7 = (arr) => {
    const out = [...arr];
    while (out.length < 7) out.push(null);
    return out.slice(0, 7);
  };

  const enemyHtml = padTo7(enemyUnits).map((u) => renderUnit(u, "enemy")).join("");
  const playerHtml = padTo7(playerUnits).map((u) => renderUnit(u, "player")).join("");
  arena.innerHTML = `<div class="arena-row">${enemyHtml}</div><div class="arena-row">${playerHtml}</div>`;

  renderBattleAttackFloat(overlayState);
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
