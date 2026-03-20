export const GAME_CONFIG = {
  gameName: "塔陨：异步终局",
  maxFloors: 8,
  finalFloor: 9,
  playerPoolSize: 30,
  initialHp: 100,
  initialLifeBadge: 3,
  initialGold: 12,
  resources: {
    initialGear: 2,
    initialMana: 1,
  },
  economy: {
    baseGoldPerFloor: 5,
    winBonus: 2,
    loseBonus: 1,
    interestSteps: [
      { threshold: 10, bonus: 1 },
      { threshold: 20, bonus: 2 },
      { threshold: 30, bonus: 3 },
      { threshold: 40, bonus: 4 },
      { threshold: 50, bonus: 5 },
    ],
  },
  phases: [
    { key: "PVE_OPEN", label: "自由探索", manual: true },
    { key: "PVE_CLOSING", label: "路径收缩", seconds: 2 },
    { key: "SNAPSHOT_WINDOW", label: "封盘提交", seconds: 2 },
    { key: "MATCHING_SIM", label: "异步匹配与结算", seconds: 2 },
  ],
  phaseActionLimit: {
    explore: 3,
    event: 2,
  },
  pvp: {
    mode: "mock", // mock | server
    endpoint: "/api/v1/floor/battle/request",
    timeoutMs: 1800,
  },
  board: {
    cols: 7,
    rows: 4,
    maxActiveUnits: 8,
  },
  backpack: {
    cols: 10,
    rows: 6,
  },
  shop: {
    refreshCost: 1,
    unitSlots: 5,
    /** 商店随机单位时各费段权重（相对值） */
    tierWeights: { 1: 38, 2: 30, 3: 18, 4: 10, 5: 4 },
    unitCostByTier: { 1: 2, 2: 3, 3: 4, 4: 5, 5: 7 },
    itemCostByRarity: { common: 2, rare: 4, epic: 6 },
  },
  /** 自走棋升星：相对模板属性的倍数 */
  starMultipliers: { 1: 1, 2: 1.8, 3: 3.24 },
};
