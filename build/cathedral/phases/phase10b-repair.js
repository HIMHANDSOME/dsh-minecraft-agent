/**
 * PHASE 10b —— 修复两个已实测确认的施工缺陷
 *
 * 缺陷 1（PHASE 10 早期版本）：用 `hollow` 建檐下山墙，把中殿拱顶在 9 条柱线处
 *   （x=xi, y=63..68, z=-15..15）掏成空气，拱顶脊部与纵肋被削掉。
 *   修法：按 PHASE 8 的同一套曲线重发拱壳（keep）、纵肋/横肋/对角肋（replace）。
 *
 * 缺陷 2（PHASE 7 早期版本）：侧廊拱壳用 `replace`，覆盖了侧廊束柱（z=±31/±44）
 *   的柱头(calcite, y=32..34)与顶板(polished_deepslate, y=35..36)。
 *   修法：把侧廊束柱柱头/顶板按原设计写回；后续 phase7 已改为 `keep`。
 */
import { createPlan, AXIS } from '../layout.js'
import { PIER_MAT } from '../pier.js'
import { naveVaultH } from './phase8.js'

const M = { vault: 'stone_bricks', rib: 'polished_andesite' }
const Z_SPRING = 14

export function build({ site }) {
  const api = createPlan('10b-repair')
  const X0 = AXIS.PIER_LINES[0]
  const X1 = AXIS.PIER_LINES[AXIS.PIER_LINES.length - 1]

  // ---------------- 缺陷 1：重发中殿拱顶与肋
  let rs = -Z_SPRING, prev = naveVaultH(-Z_SPRING)
  const segs = []
  for (let z = -Z_SPRING + 1; z <= Z_SPRING + 1; z++) {
    const hv = z <= Z_SPRING ? naveVaultH(z) : null
    if (hv !== prev) { segs.push({ z1: rs, z2: z - 1, y: prev }); rs = z; prev = hv }
  }
  for (const seg of segs) {
    api.box(X0, seg.y, seg.z1, X1, seg.y + 2, seg.z2, M.vault, 'keep', `修复/拱壳y${seg.y}`)
  }
  for (const xi of AXIS.PIER_LINES) {
    for (const seg of segs) {
      api.box(xi, seg.y - 1, seg.z1, xi, seg.y - 1, seg.z2, M.rib, 'replace', `修复/横肋x${xi}`)
    }
  }
  for (const z of [0, -7, 7]) {
    api.box(X0, naveVaultH(z) - 1, z, X1, naveVaultH(z) - 1, z, M.rib, 'replace', `修复/纵肋z${z}`)
  }
  for (let i = 0; i < AXIS.PIER_LINES.length - 1; i++) {
    const xa = AXIS.PIER_LINES[i], xb = AXIS.PIER_LINES[i + 1]
    for (const dir of [1, -1]) {
      for (let k = 0; k <= 8; k++) {
        const t = k / 8
        const x = Math.round(xa + (xb - xa) * t)
        const z = Math.round(dir * Z_SPRING * (1 - t))
        const y = naveVaultH(z) - 1
        api.box(x, y, z, x, y, z, M.rib, 'replace', `修复/对角肋i${i}d${dir}k${k}`)
      }
    }
  }

  // ---------------- 缺陷 2：侧廊束柱柱头/顶板写回（top=36）
  for (const xi of AXIS.PIER_LINES) {
    for (const cz of [AXIS.Z_AISLE_INNER, -AXIS.Z_AISLE_INNER, AXIS.Z_AISLE_OUTER, -AXIS.Z_AISLE_OUTER]) {
      api.box(xi - 2, 32, cz - 2, xi + 2, 34, cz + 2, PIER_MAT.accent, 'replace', `修复/侧廊柱头x${xi}z${cz}`)
      api.box(xi - 3, 35, cz - 3, xi + 3, 36, cz + 3, PIER_MAT.abacus, 'replace', `修复/侧廊顶板x${xi}z${cz}`)
    }
  }

  return api.ops
}
