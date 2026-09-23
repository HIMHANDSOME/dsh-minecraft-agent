/**
 * PHASE 29 —— 收尾（二）：拆除临时放线标记
 *
 * building.md §3 PHASE 1 的坐标标记是临时的，§3 PHASE 28–30 要求"拆临时脚手架和坐标标记"。
 * PHASE 1 共放了 40 处 gold_block 标记：
 *   13 条 x 柱线 × z=±62（26 处）、x=0/273 的中轴标记（2 处）、
 *   x=-2 处的 z 向柱线标记（6 条 × 南北 = 12 处）。
 *
 * 拆法：
 *   · 落在 PHASE 9 飞扶壁塔（x=xi±4, z=58..66）内部的标记 → 用 stone_bricks 回填，
 *     避免在塔身里留下空洞；
 *   · 其余标记 → 掏成空气；
 *   · x=-2 的标记位于台地西缘压顶内，掏空后把压顶按 PHASE 2 的原样补回。
 */
import { createPlan, AXIS } from '../layout.js'

const X_LINES = [0, ...AXIS.PIER_LINES, 190, 232, 273]
const ZMARK = [18, 31, 44, 52, 56, 78]
const PIER_SET = new Set(AXIS.PIER_LINES)

export function build({ site }) {
  const api = createPlan(29)

  // ---------------- 1. x 柱线在 z=±62 的标记
  for (const x of X_LINES) {
    for (const z of [-62, 62]) {
      if (PIER_SET.has(x)) {
        api.box(x, 1, z, x, 4, z, 'stone_bricks', 'replace', '拆标记/塔内回填')
      } else {
        api.box(x, 1, z, x, 4, z, 'air', 'replace', '拆标记')
      }
    }
  }
  // ---------------- 2. 中轴标记
  for (const x of [0, 273]) api.box(x, 1, 0, x, 4, 0, 'air', 'replace', '拆标记/中轴')

  // ---------------- 3. x=-2 的 z 向柱线标记
  for (const z of ZMARK) {
    for (const s of [1, -1]) api.box(-2, 1, s * z, -2, 4, s * z, 'air', 'replace', '拆标记/z线')
  }
  // 把台地西缘压顶补回（PHASE 2 的 教堂/西缘压顶：x=-8..-2, y=0..3, z=-66..66）
  api.box(-8, 0, -66, -2, 3, 66, 'polished_andesite', 'replace', '拆标记/补西缘压顶')

  return api.ops
}
