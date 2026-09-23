/**
 * PHASE 35b —— 西立面中央山墙 + 玫瑰窗（修正 PHASE 35 的悬空问题）
 *
 * 实测：PHASE 4 只把西立面建到 y=32，双塔之间（z=-21..21）在 y>32 是空的，
 * PHASE 35 直接在那里放玫瑰窗就成了悬空玻璃。
 * 修法：在双塔之间补一面中央山墙（x=0..4, z=-21..21, y=33..54，尖顶在 z=0），
 * 再把玫瑰窗正确"嵌"进这面墙里（先开洞、再填彩玻、再加放射石窗格与分环、中心石核）。
 */
import { createPlan } from '../layout.js'

const M = { wall: 'stone_bricks', glass: 'light_blue_stained_glass', glassIn: 'yellow_stained_glass', stone: 'polished_deepslate', calcite: 'calcite' }
const CX = 3, CY = 43, R = 11

export function build({ site }) {
  const api = createPlan('35b-repair')

  // =============================================================== 1. 中央山墙（尖顶 z=0, y=54，两肩 y=33 在 z=±21）
  for (let z = -21; z <= 21; z++) {
    const top = 54 - Math.abs(z)
    api.box(0, 33, z, 4, top, z, M.wall, 'replace', `山墙/墙${z}`)
  }
  // 山墙尖饰
  api.box(1, 55, -1, 3, 56, 1, M.stone, 'replace', '山墙/尖饰')
  // 山墙两侧与塔身交接的扶垛
  api.box(0, 33, -21, 4, 35, -19, M.wall, 'replace', '山墙/北垛')
  api.box(0, 33, 19, 4, 35, 21, M.wall, 'replace', '山墙/南垛')

  // =============================================================== 2. 玫瑰窗：开洞 → 玻璃 → 窗格
  for (let dy = -R; dy <= R; dy++) {
    const w = Math.floor(Math.sqrt(R * R - dy * dy))
    api.box(0, CY + dy, -w, 4, CY + dy, w, 'air', 'replace', `玫瑰窗/洞${dy}`)
    api.box(2, CY + dy, -w, 4, CY + dy, w, M.glass, 'replace', `玫瑰窗/玻${dy}`)
  }
  // 内圈（r<=4）金黄
  for (let dy = -4; dy <= 4; dy++) {
    const w = Math.floor(Math.sqrt(16 - dy * dy))
    api.box(2, CY + dy, -w, 4, CY + dy, w, M.glassIn, 'replace', `玫瑰窗/内圈${dy}`)
  }
  // 放射石窗格（8 向）
  api.box(2, CY - R, 0, 4, CY + R, 0, M.stone, 'replace', '玫瑰窗/竖辐')
  api.box(2, CY, -R, 4, CY, R, M.stone, 'replace', '玫瑰窗/横辐')
  for (let k = -7; k <= 7; k++) {
    api.box(2, CY + k, k, 4, CY + k, k, M.stone, 'replace', '玫瑰窗/斜辐A')
    api.box(2, CY + k, -k, 4, CY + k, -k, M.stone, 'replace', '玫瑰窗/斜辐B')
  }
  // 分环 r=4、r=8
  for (const r of [4, 8]) {
    for (let dy = -r; dy <= r; dy++) {
      const dz = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)))
      api.box(2, CY + dy, dz, 4, CY + dy, dz, M.stone, 'replace', '玫瑰窗/环')
      api.box(2, CY + dy, -dz, 4, CY + dy, -dz, M.stone, 'replace', '玫瑰窗/环')
    }
  }
  // 中心石核
  api.box(2, CY - 1, -1, 4, CY + 1, 1, M.calcite, 'replace', '玫瑰窗/石核')

  return api.ops
}
