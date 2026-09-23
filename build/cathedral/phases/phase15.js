/**
 * PHASE 15 —— 双塔上段（一）：y=32..94
 *
 * building.md §2：
 *   y=32..58  尖券窗层（每面一扇高窄尖券彩窗）
 *   y=59..94  钟楼（每面一扇 9 格宽钟券，装铁栅 louvers）
 * 要求：两塔同步、最终实测同高。
 */
import { createPlan, AXIS } from '../layout.js'
import { TX, TZ, HALF, TMAT, ring, lancetWindows } from '../tower.js'

const GLASS = ['blue_stained_glass', 'purple_stained_glass', 'light_blue_stained_glass']
const LOUVRE = ['iron_bars', 'iron_bars', 'iron_bars']

export function build({ site }) {
  const api = createPlan(15)
  const zcs = [AXIS.TOWER_Z, -AXIS.TOWER_Z]

  for (const zc of zcs) {
    const tag = `塔${zc > 0 ? 'S' : 'N'}`

    // ---------- 一、尖券窗层 y=32..58
    ring(api, zc, 32, 58, HALF, 3, TMAT.wall, `${tag}/尖券层`)
    lancetWindows(api, zc, { y1: 36, y2: 54, half: 2, apex: 58, glass: GLASS, thick: 3, tag: `${tag}/尖券` })
    ring(api, zc, 58, 58, HALF, 4, TMAT.trim, `${tag}/束带58`)

    // ---------- 二、钟楼层 y=59..94
    ring(api, zc, 59, 94, HALF, 3, TMAT.wall, `${tag}/钟楼`)
    lancetWindows(api, zc, { y1: 66, y2: 86, half: 4, apex: 90, glass: LOUVRE, thick: 3, tag: `${tag}/钟券` })
    ring(api, zc, 94, 94, HALF, 4, TMAT.trim, `${tag}/束带94`)

    // ---------- 三、角部扶壁柱（与下部对齐，5×5）
    for (const cx of [TX - HALF, TX + HALF]) {
      for (const cz of [zc - HALF, zc + HALF]) {
        api.box(cx - 2, 32, cz - 2, cx + 2, 94, cz + 2, TMAT.accent, 'replace', `${tag}/角扶壁`)
        api.box(cx - 1, 95, cz - 1, cx + 1, 97, cz + 1, TMAT.calcite, 'replace', `${tag}/角小尖`)
      }
    }

    // ---------- 四、楼层（钟室地板 / 各层束带内圈）
    api.box(TX - 10, 60, zc - 10, TX + 10, 60, zc + 10, TMAT.trim, 'replace', `${tag}/楼板60`)
    api.box(TX - 10, 95, zc - 10, TX + 10, 95, zc + 10, TMAT.trim, 'replace', `${tag}/楼板95`)
    // 塔内石梯井（留出通行竖井，后续 PHASE 18-23 做实体楼梯）
    api.box(TX + 4, 32, zc - 3, TX + 8, 94, zc + 3, 'air', 'replace', `${tag}/梯井`)

    // ---------- 五、风化点缀（克制，仅在塔身外皮）
    for (const y of [40, 52, 70, 84]) {
      api.box(TX - HALF, y, zc - 2, TX - HALF, y + 1, zc + 2, TMAT.mossy, 'replace', `${tag}/风化`)
    }
  }

  return api.ops
}
