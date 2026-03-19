import { GAME_CONFIG } from "../configs/game.config.js";

function indexOf(col, row) {
  return row * GAME_CONFIG.backpack.cols + col;
}

export function clearBackpackGrid(state) {
  state.backpackGrid.fill(null);
}

export function canPlaceShape(grid, shape, originCol, originRow) {
  for (let r = 0; r < shape.length; r += 1) {
    for (let c = 0; c < shape[r].length; c += 1) {
      if (!shape[r][c]) continue;
      const col = originCol + c;
      const row = originRow + r;
      if (col < 0 || row < 0 || col >= GAME_CONFIG.backpack.cols || row >= GAME_CONFIG.backpack.rows) {
        return false;
      }
      if (grid[indexOf(col, row)] !== null) return false;
    }
  }
  return true;
}

export function placeShape(grid, shape, originCol, originRow, itemId) {
  for (let r = 0; r < shape.length; r += 1) {
    for (let c = 0; c < shape[r].length; c += 1) {
      if (!shape[r][c]) continue;
      grid[indexOf(originCol + c, originRow + r)] = itemId;
    }
  }
}

export function autoArrangeBackpack(state) {
  clearBackpackGrid(state);
  for (const item of state.backpackItems) {
    item.anchor = null;
    item.placed = false;
    let placed = false;
    for (let row = 0; row < GAME_CONFIG.backpack.rows && !placed; row += 1) {
      for (let col = 0; col < GAME_CONFIG.backpack.cols && !placed; col += 1) {
        if (canPlaceShape(state.backpackGrid, item.shape, col, row)) {
          placeShape(state.backpackGrid, item.shape, col, row, item.instanceId);
          placed = true;
          item.placed = true;
          item.anchor = { col, row };
        }
      }
    }
  }
}

function rebuildGridFromItems(state) {
  clearBackpackGrid(state);
  for (const item of state.backpackItems) {
    if (!item.placed || !item.anchor) continue;
    if (canPlaceShape(state.backpackGrid, item.shape, item.anchor.col, item.anchor.row)) {
      placeShape(state.backpackGrid, item.shape, item.anchor.col, item.anchor.row, item.instanceId);
    } else {
      item.placed = false;
      item.anchor = null;
    }
  }
}

export function removeItemFromBackpack(state, itemInstanceId) {
  const item = state.backpackItems.find((x) => x.instanceId === itemInstanceId);
  if (!item) return false;
  item.placed = false;
  item.anchor = null;
  rebuildGridFromItems(state);
  return true;
}

export function placeItemAt(state, itemInstanceId, col, row) {
  const item = state.backpackItems.find((x) => x.instanceId === itemInstanceId);
  if (!item) return { ok: false, msg: "道具不存在" };
  const prevPlaced = item.placed;
  const prevAnchor = item.anchor ? { ...item.anchor } : null;
  if (item.placed) {
    removeItemFromBackpack(state, itemInstanceId);
  }
  if (!canPlaceShape(state.backpackGrid, item.shape, col, row)) {
    if (prevPlaced && prevAnchor) {
      item.placed = true;
      item.anchor = prevAnchor;
      rebuildGridFromItems(state);
    }
    return { ok: false, msg: "该位置放不下此道具" };
  }
  placeShape(state.backpackGrid, item.shape, col, row, item.instanceId);
  item.placed = true;
  item.anchor = { col, row };
  return { ok: true, msg: `已放置 ${item.name}` };
}

export function computeBackpackBonus(state) {
  const bonuses = {
    globalAtkPct: 0,
    globalHpPct: 0,
    endFloorHeal: 0,
    traitNeedMinus: {},
    attackProcPct: 0,
    shieldProc: 0,
    triggerNotes: [],
  };

  const placed = state.backpackItems.filter((i) => i.placed && i.anchor);

  const adjacencyMap = {};
  for (const item of placed) {
    adjacencyMap[item.instanceId] = 0;
  }
  for (let row = 0; row < GAME_CONFIG.backpack.rows; row += 1) {
    for (let col = 0; col < GAME_CONFIG.backpack.cols; col += 1) {
      const cur = state.backpackGrid[indexOf(col, row)];
      if (!cur) continue;
      const right = col + 1 < GAME_CONFIG.backpack.cols ? state.backpackGrid[indexOf(col + 1, row)] : null;
      const down = row + 1 < GAME_CONFIG.backpack.rows ? state.backpackGrid[indexOf(col, row + 1)] : null;
      if (right && right !== cur) {
        adjacencyMap[cur] += 1;
        adjacencyMap[right] += 1;
      }
      if (down && down !== cur) {
        adjacencyMap[cur] += 1;
        adjacencyMap[down] += 1;
      }
    }
  }

  for (const item of placed) {
    if (!item.placed) continue;
    const e = item.effects || {};
    if (e.globalAtkPct) bonuses.globalAtkPct += e.globalAtkPct;
    if (e.globalHpPct) bonuses.globalHpPct += e.globalHpPct;
    if (e.endFloorHeal) bonuses.endFloorHeal += e.endFloorHeal;
    if (e.traitNeedMinusOne) bonuses.traitNeedMinus[e.traitNeedMinusOne] = 1;
    if (e.adjacencyAtkPct) {
      const stack = adjacencyMap[item.instanceId] || 0;
      bonuses.globalAtkPct += e.adjacencyAtkPct * stack;
      if (stack > 0) bonuses.triggerNotes.push(`${item.name} 邻接触发x${stack}`);
    }
    if (e.adjacencyHpPct) {
      const stack = adjacencyMap[item.instanceId] || 0;
      bonuses.globalHpPct += e.adjacencyHpPct * stack;
      if (stack > 0) bonuses.triggerNotes.push(`${item.name} 防护触发x${stack}`);
    }
    if ((item.tags || []).includes("ammo")) bonuses.attackProcPct += 0.06;
    if ((item.tags || []).includes("consumable")) bonuses.shieldProc += 4;
  }

  return bonuses;
}
