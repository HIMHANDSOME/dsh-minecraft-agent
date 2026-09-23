/**
 * PHASE 17 —— 双塔上段（三）：y=138..180
 *
 * building.md §2：
 *   y=138..160 镂空尖塔：八角轮廓、垂直肋 + 开敞格窗，不做逐层缩小的实心金字塔
 *   y=161..176 细尖顶
 *   y=177..180 顶饰
 * 塔顶世界 y=302（顶部余量 17 格）。两塔同步、实测同高。
 */
import { createPlan, AXIS } from '../layout.js'
import { TX, TZ, HALF, TMAT } from '../tower.js'

export function build({ site }) {
  const api = createPlan(17)

  for (const zc of [AXIS.TOWER_Z, -AXIS.TOWER_Z]) {
    const tag = `塔${zc > 0 ? 'S' : 'N'}`

    // ---------- 一、镂空尖塔 y=138..160（八角锥 + 垂直肋 + 水平格环）
    for (let y = 138; y <= 160; y++) {
      const t = (y - 138) / 22
      const r = Math.max(1, Math.round(2 + (10 - 2) * (1 - t)))
      // 8 个方向上的垂直肋（2×2 柱），形成镂空感
      const dirs = [[1, 0], [0.707, 0.707], [0, 1], [-0.707, 0.707], [-1, 0], [-0.707, -0.707], [0, -1], [0.707, -0.707]]
      for (const [dx, dz] of dirs) {
        const x = TX + Math.round(dx * r), z = zc + Math.round(dz * r)
        api.box(x, y, z, x, y, z, TMAT.roof, 'replace', `${tag}/尖塔肋`)
      }
      // 每 4 层加一道水平格环，兼作结构连接
      // 水平格环：注意 hollow 在只有 1 层高的区域会把整块填实（没有"内部"），
      // 所以这里用 4 条边显式围成环，保证尖塔真的是镂空的。
      if ((y - 138) % 4 === 0 && r >= 2) {
        api.box(TX - r + 1, y, zc - r + 1, TX + r - 1, y, zc + r - 1, 'air', 'replace', `${tag}/格环内`)
        api.box(TX - r, y, zc - r, TX + r, y, zc - r, TMAT.roof, 'replace', `${tag}/格环N`)
        api.box(TX - r, y, zc + r, TX + r, y, zc + r, TMAT.roof, 'replace', `${tag}/格环S`)
        api.box(TX - r, y, zc - r + 1, TX - r, y, zc + r - 1, TMAT.roof, 'replace', `${tag}/格环W`)
        api.box(TX + r, y, zc - r + 1, TX + r, y, zc + r - 1, TMAT.roof, 'replace', `${tag}/格环E`)
      }
    }

    // ---------- 二、细尖顶 y=161..176（细长收分）
    for (let y = 161; y <= 176; y++) {
      const r = Math.max(0, Math.round(4 * (1 - (y - 161) / 16)))
      api.box(TX - r, y, zc - r, TX + r, y, zc + r, TMAT.roof, 'replace', `${tag}/细尖顶`)
    }

    // ---------- 三、顶饰 y=177..180
    api.box(TX, 177, zc, TX, 180, zc, 'gold_block', 'replace', `${tag}/顶饰柱`)
    api.box(TX - 1, 178, zc, TX + 1, 178, zc, 'gold_block', 'replace', `${tag}/十字横`)
    api.box(TX, 178, zc - 1, TX, 178, zc + 1, 'gold_block', 'replace', `${tag}/十字横2`)
  }

  return api.ops
}
