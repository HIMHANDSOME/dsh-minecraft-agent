/**
 * PHASE 1 —— 放线与冻结标记（临时）
 *
 * building.md §3 PHASE 1：定 x=0,43,155,190,232,273；中轴、最终柱线、外墙、扶壁、
 * 耳堂端线临时标记；冻结统一柱网。
 *
 * 标记物为 gold_block 柱，落在台地边缘（z=±68）与中轴两端，不挡主体空间。
 * 全部标记登记到 build/cathedral/markers.json，PHASE 30 收尾时按此清单拆除。
 */
import { createPlan, AXIS } from '../layout.js'

export function build({ site }) {
  const api = createPlan(1)
  const X_LINES = [0, ...AXIS.PIER_LINES, 190, 232, 273]
  for (const x of X_LINES) {
    for (const z of [-62, 62]) {
      api.box(x, 1, z, x, 4, z, 'gold_block', 'replace', `标记/x=${x}/z=${z}`)
    }
  }
  // 中轴线标记（东端与西端）
  for (const x of [0, 273]) {
    api.box(x, 1, 0, x, 4, 0, 'gold_block', 'replace', `标记/中轴x=${x}`)
  }
  // z 向柱线标记：在 x=-2 处标出 ±18/±31/±44/±52/±56 与耳堂端线 ±78
  for (const z of [18, 31, 44, 52, 56, 78]) {
    for (const s of [1, -1]) {
      api.box(-2, 1, s * z, -2, 4, s * z, 'gold_block', 'replace', `标记/z=${s * z}`)
    }
  }
  return api.ops
}
