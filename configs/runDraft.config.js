/** 开局：职业影响商店权重；落点影响初始资源 */
export const CLASS_OPTIONS = [
  {
    id: "class_sentinel",
    name: "坚壁导师",
    blurb: "商店更易出现「哨卫」单位",
    favoredTraits: ["sentinel"],
    shopTraitBias: 2.4,
  },
  {
    id: "class_mage",
    name: "秘仪讲师",
    blurb: "商店更易出现「法师」单位",
    favoredTraits: ["mage"],
    shopTraitBias: 2.4,
  },
  {
    id: "class_ranger",
    name: "游猎教官",
    blurb: "商店更易出现「游侠」单位",
    favoredTraits: ["ranger"],
    shopTraitBias: 2.4,
  },
  {
    id: "class_engineer",
    name: "齿轮工匠",
    blurb: "商店更易出现「机械」单位",
    favoredTraits: ["machine", "engineer"],
    shopTraitBias: 2.0,
  },
];

export const LANDING_OPTIONS = [
  {
    id: "landing_vault",
    name: "贮藏塔基",
    blurb: "开局多金币，适合滚利息",
    goldDelta: 6,
    hpDelta: 0,
  },
  {
    id: "landing_warden",
    name: "边境岗哨",
    blurb: "生命与少量金币，稳健开荒",
    goldDelta: 3,
    hpDelta: 12,
  },
  {
    id: "landing_ruins",
    name: "废墟药圃",
    blurb: "秘能与齿轮，偏背包构筑",
    goldDelta: 2,
    hpDelta: 0,
    manaDelta: 2,
    gearDelta: 2,
  },
  {
    id: "landing_shrine",
    name: "残响祭坛",
    blurb: "高风险高收益：多金但略损生命",
    goldDelta: 10,
    hpDelta: -8,
  },
];

export function getClassById(id) {
  return CLASS_OPTIONS.find((c) => c.id === id) || CLASS_OPTIONS[0];
}

export function getLandingById(id) {
  return LANDING_OPTIONS.find((l) => l.id === id) || LANDING_OPTIONS[0];
}
