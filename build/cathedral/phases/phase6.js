/**
 * PHASE 6 —— 侧廊柱网（内侧廊 z=±31、外侧廊 z=±44）
 *
 * building.md §1.1 冻结柱网：中殿主柱 z=±18（PHASE 5），侧廊柱线 z=±31、±44。
 * 侧廊拱顶约 y=35，故侧廊柱做到 y=36（比对主柱 y=42 低 6 格，形成真实的
 * 中殿—侧廊高度差）。停止点：不做拱与屋顶。
 */
import { createPlan, AXIS } from '../layout.js'
import { bundlePier } from '../pier.js'

export function build({ site }) {
  const api = createPlan(6)
  const TOP = 36
  const zLines = [AXIS.Z_AISLE_INNER, -AXIS.Z_AISLE_INNER, AXIS.Z_AISLE_OUTER, -AXIS.Z_AISLE_OUTER]
  for (const x of AXIS.PIER_LINES) {
    for (const z of zLines) bundlePier(api, x, z, TOP)
  }
  return api.ops
}
