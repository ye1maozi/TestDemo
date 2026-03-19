import { GAME_CONFIG } from "../configs/game.config.js";

export function createInitialState() {
  return {
    runActive: false,
    runId: "",
    floor: 1,
    phaseIndex: 0,
    phaseTimeLeft: GAME_CONFIG.phases[0].seconds || 0,
    hp: GAME_CONFIG.initialHp,
    lifeBadge: GAME_CONFIG.initialLifeBadge,
    gold: GAME_CONFIG.initialGold,
    gear: GAME_CONFIG.resources.initialGear,
    mana: GAME_CONFIG.resources.initialMana,
    streak: 0,
    lastBattle: null,
    logs: [],
    roster: [],
    boardSlots: new Array(GAME_CONFIG.board.cols * GAME_CONFIG.board.rows).fill(null),
    backpackGrid: new Array(GAME_CONFIG.backpack.cols * GAME_CONFIG.backpack.rows).fill(null),
    backpackItems: [],
    nextUnitInstanceId: 1,
    nextItemInstanceId: 1,
    shopUnits: [],
    shopItems: [],
    mockAliveCount: GAME_CONFIG.playerPoolSize,
    floorPlan: {
      strategy: "stable", // stable | greedy
      suggestion: "",
    },
    phaseActions: {
      exploreUsed: 0,
      eventUsed: 0,
    },
    battleExplain: null,
    battleOverlay: {
      visible: false,
      title: "",
      playerHp: 100,
      enemyHp: 100,
      timeline: [],
      renderedTimeline: [],
      playIndex: 0,
      paused: false,
      speed: 1,
      result: "",
    },
    tower: {
      step: 0,
      route: [],
      history: [],
      currentNode: null,
    },
    tutorial: {
      enabled: true,
      skipped: false,
      completed: false,
      step: 0,
      actionMarks: {
        explored: false,
        boughtUnit: false,
        boughtItem: false,
        arranged: false,
        pvpResolved: false,
        floorSettled: false,
      },
    },
  };
}

export function getCurrentPhase(state) {
  return GAME_CONFIG.phases[state.phaseIndex];
}

export function log(state, msg) {
  const stamp = new Date().toLocaleTimeString();
  state.logs.unshift(`[${stamp}] ${msg}`);
  state.logs = state.logs.slice(0, 120);
}
