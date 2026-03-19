export const ITEM_CONFIG = [
  {
    id: "i_powder",
    name: "火药包",
    icon: "🧨",
    rarity: "common",
    shape: [
      [1, 1],
      [0, 1],
    ],
    tags: ["ammo"],
    summary: "强化远程火力，偏向进攻输出。",
    effects: {
      adjacencyAtkPct: 0.08,
      targetTags: ["ranged"],
    },
  },
  {
    id: "i_core",
    name: "稳压核心",
    icon: "🔋",
    rarity: "rare",
    shape: [
      [1, 1, 1],
      [0, 1, 0],
    ],
    tags: ["machine"],
    summary: "增强机械系生存，适合前排续航。",
    effects: {
      adjacencyHpPct: 0.1,
      targetTags: ["machine"],
    },
  },
  {
    id: "i_cloak",
    name: "夜幕披风",
    icon: "🧥",
    rarity: "common",
    shape: [
      [1, 1],
      [1, 1],
    ],
    tags: ["night"],
    summary: "提供全队攻击加成，通用型外套。",
    effects: {
      globalAtkPct: 0.05,
    },
  },
  {
    id: "i_emblem",
    name: "先锋纹章",
    icon: "🪙",
    rarity: "epic",
    shape: [[1]],
    tags: ["sentinel"],
    summary: "降低先锋羁绊门槛，更快成型前排。",
    effects: {
      traitNeedMinusOne: "sentinel",
    },
  },
  {
    id: "i_medkit",
    name: "战地急救包",
    icon: "🩹",
    rarity: "common",
    shape: [[1, 1, 1]],
    tags: ["consumable"],
    summary: "回合结束后回复生命，提升容错。",
    effects: {
      endFloorHeal: 8,
    },
  },
];
