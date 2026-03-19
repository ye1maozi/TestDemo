function buildSnapshot(state) {
  const deployed = state.boardSlots
    .filter(Boolean)
    .map((instanceId) => state.roster.find((u) => u.instanceId === instanceId))
    .filter(Boolean);
  const rosterForBattle = deployed.length ? deployed : state.roster.slice(0, 8);
  return {
    runId: state.runId,
    floor: state.floor,
    hp: state.hp,
    lifeBadge: state.lifeBadge,
    resources: { gold: state.gold, gear: state.gear, mana: state.mana },
    roster: rosterForBattle.map((u) => ({ id: u.id, tier: u.tier, hp: u.hp, atk: u.atk })),
    board: [...state.boardSlots],
    backpack: state.backpackItems.filter((i) => i.placed).map((i) => ({ id: i.id, rarity: i.rarity })),
  };
}

async function mockProvider(snapshot) {
  const basePower = snapshot.roster.reduce((sum, u) => sum + u.hp * 0.3 + u.atk * 2, 0);
  const fakeEnemyPower = 130 + snapshot.floor * 25 + Math.random() * 60;
  const win = basePower >= fakeEnemyPower;
  const damage = win ? 0 : Math.floor(8 + (fakeEnemyPower - basePower) / 20);
  const timeline = [];
  let pHp = 100;
  let eHp = 100;
  for (let i = 1; i <= 5; i += 1) {
    const pHit = Math.max(6, Math.round(12 + (basePower / 50) * (0.7 + Math.random() * 0.5)));
    eHp -= pHit;
    timeline.push({ side: "player", text: `R${i} 我方造成 ${pHit}`, playerHp: Math.max(0, pHp), enemyHp: Math.max(0, eHp) });
    if (eHp <= 0) break;
    const eHit = Math.max(6, Math.round(11 + (fakeEnemyPower / 55) * (0.7 + Math.random() * 0.5)));
    pHp -= eHit;
    timeline.push({ side: "enemy", text: `R${i} 敌方造成 ${eHit}`, playerHp: Math.max(0, pHp), enemyHp: Math.max(0, eHp) });
    if (pHp <= 0) break;
  }
  return {
    ok: true,
    source: "mock",
    win,
    enemyName: `镜像对手-${1000 + Math.floor(Math.random() * 9000)}`,
    hpDamage: Math.max(0, damage),
    badgeLoss: damage > 20 ? 1 : 0,
    report: {
      playerPower: Math.round(basePower),
      enemyPower: Math.round(fakeEnemyPower),
      timeline,
      playerFinalHp: Math.max(0, pHp),
      enemyFinalHp: Math.max(0, eHp),
    },
  };
}

async function serverProvider(snapshot, endpoint, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`PVP接口异常: ${resp.status}`);
    const data = await resp.json();
    return {
      ok: true,
      source: "server",
      win: !!data.win,
      enemyName: data.enemyName || "未知对手",
      hpDamage: data.hpDamage || 0,
      badgeLoss: data.badgeLoss || 0,
      report: data.report || {},
    };
  } catch (error) {
    return {
      ok: false,
      source: "server",
      message: error.message || "PVP服务不可用",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function createPvpService(config) {
  return {
    async resolveFloorBattle(state) {
      const snapshot = buildSnapshot(state);
      if (config.mode === "server") {
        const result = await serverProvider(snapshot, config.endpoint, config.timeoutMs);
        if (result.ok) return result;
      }
      // 回退策略：server失败时自动切mock，减少后续切换开发量
      return mockProvider(snapshot);
    },
  };
}
