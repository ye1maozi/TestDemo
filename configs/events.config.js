export const EVENT_CONFIG = [
  {
    id: "ev_shrine",
    title: "齿轮祭坛",
    desc: "献祭3金币，获得1齿轮与1随机道具。",
    execute: "SACRIFICE_GOLD_FOR_GEAR_ITEM",
  },
  {
    id: "ev_merchant",
    title: "流浪商贩",
    desc: "花费2金币，刷新高品质商店。",
    execute: "PREMIUM_SHOP_ROLL",
  },
  {
    id: "ev_ambush",
    title: "暗巷伏击",
    desc: "受伤换资源：失去8HP，获得4金币与1秘能。",
    execute: "HP_FOR_RESOURCE",
  },
  {
    id: "ev_cache",
    title: "遗落补给箱",
    desc: "直接获得随机单位。",
    execute: "FREE_RANDOM_UNIT",
  },
];
