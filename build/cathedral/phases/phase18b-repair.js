/**
 * PHASE 18b —— 修复管风琴音管被埋进琴柜壁
 *
 * 症状：琴柜内腔是 z=-8..0，但音管按 z=-9 起排，最外侧一根（z=-9）落在柜壁里，
 * 实测 (30,30,-9) 为 dark_oak_planks。
 * 修法：按内腔范围重排 5 根音管；phase18.js 已改为 z=-8 起。
 */
import { createPlan } from '../layout.js'

const M = { pipes: 'iron_bars', pipes2: 'polished_deepslate', trim: 'polished_deepslate' }
const PLAT_Y = 23

export function build({ site }) {
  const api = createPlan('18b-repair')
  for (let i = 0; i < 5; i++) {
    const z = -8 + i * 2
    const h = 5 + ((2 - Math.abs(i - 2)) * 4)
    const blk = i % 2 === 0 ? M.pipes : M.pipes2
    api.box(30, PLAT_Y + 2, z, 30, PLAT_Y + 1 + h, z, blk, 'replace', `修复/音管z${z}`)
    api.box(29, PLAT_Y + 1 + h, z, 29, PLAT_Y + 1 + h, z, M.trim, 'replace', `修复/管口z${z}`)
  }
  return api.ops
}
