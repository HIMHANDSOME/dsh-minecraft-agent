/**
 * PHASE 16 —— 双塔上段（二）：y=95..137
 *
 * building.md §2：
 *   y=95..118  开放石廊（open gallery）：四周立柱、四面开敞、上有石顶
 *   y=119..137 方形到八角过渡：逐层削角，27×27 方塔过渡为八角
 */
import { createPlan, AXIS } from '../layout.js'
import { TX, TZ, HALF, TMAT, ring } from '../tower.js'

export function build({ site }) {
  const api = createPlan(16)

  for (const zc of [AXIS.TOWER_Z, -AXIS.TOWER_Z]) {
    const tag = `塔${zc > 0 ? 'S' : 'N'}`

    // ---------- 一、开放石廊 y=95..118
    // 地板（phase15 已铺 y=95），四周立柱每面 3 根
    const colXs = [TX - HALF + 1, TX, TX + HALF - 1]
    const colZs = [zc - HALF + 1, zc, zc + HALF - 1]
    for (const x of colXs) {
      for (const z of [zc - HALF + 1, zc + HALF - 1]) {
        api.box(x - 1, 96, z - 1, x + 1, 112, z + 1, TMAT.wall, 'replace', `${tag}/廊柱`)
      }
    }
    for (const z of colZs) {
      for (const x of [TX - HALF + 1, TX + HALF - 1]) {
        api.box(x - 1, 96, z - 1, x + 1, 112, z + 1, TMAT.wall, 'replace', `${tag}/廊柱`)
      }
    }
    // 柱间栏杆（下部实、上部开敞）
    ring(api, zc, 96, 98, HALF, 2, TMAT.trim, `${tag}/廊栏`)
    // 石廊顶板 + 挑檐
    api.box(TX - HALF, 113, zc - HALF, TX + HALF, 114, zc + HALF, TMAT.trim, 'replace', `${tag}/廊顶`)
    api.box(TX - HALF - 1, 113, zc - HALF - 1, TX + HALF + 1, 113, zc + HALF + 1, TMAT.roof, 'replace', `${tag}/挑檐`)
    // 顶部束带
    ring(api, zc, 115, 118, HALF, 3, TMAT.wall, `${tag}/廊上带`)

    // ---------- 二、方形到八角过渡 y=119..137
    ring(api, zc, 119, 137, HALF, 3, TMAT.wall, `${tag}/过渡`)
    for (let y = 119; y <= 137; y++) {
      const inset = Math.round(((y - 119) * 5) / 18)
      if (inset <= 0) continue
      const s = inset + 1
      api.box(TX - HALF, y, zc - HALF, TX - HALF + s, y, zc - HALF + s, 'air', 'replace', `${tag}/削角NW`)
      api.box(TX + HALF - s, y, zc - HALF, TX + HALF, y, zc - HALF + s, 'air', 'replace', `${tag}/削角NE`)
      api.box(TX - HALF, y, zc + HALF - s, TX - HALF + s, y, zc + HALF, 'air', 'replace', `${tag}/削角SW`)
      api.box(TX + HALF - s, y, zc + HALF - s, TX + HALF, y, zc + HALF, 'air', 'replace', `${tag}/削角SE`)
    }
    // 过渡层收口
    api.box(TX - 9, 137, zc - 9, TX + 9, 137, zc + 9, TMAT.trim, 'replace', `${tag}/过渡顶`)
    api.box(TX - 10, 138, zc - 10, TX + 10, 138, zc + 10, TMAT.wall, 'replace', `${tag}/塔座环`)
    api.box(TX - 9, 138, zc - 9, TX + 9, 138, zc + 9, 'air', 'replace', `${tag}/塔座内`)

    // ---------- 三、角部小尖塔（与下部角扶壁对齐）
    for (const cx of [TX - HALF, TX + HALF]) {
      for (const cz of [zc - HALF, zc + HALF]) {
        api.box(cx - 1, 98, cz - 1, cx + 1, 112, cz + 1, TMAT.accent, 'replace', `${tag}/角柱`)
      }
    }
  }

  return api.ops
}
