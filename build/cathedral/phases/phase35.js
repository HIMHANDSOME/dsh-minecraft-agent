/**
 * PHASE 35 —— 修复（五）：华丽度提升
 *
 * 用户实测反馈：教堂整体的华丽程度达不到要求。
 * 补上最具哥特特征的元素：
 *   1. 西立面玫瑰窗（building.md §2 明确要求：中心约 (x=3..5, y=43, z=0)、
 *      外半径 11，中心石核、半径 4/8 分环、放射状石窗格、蓝/红/紫彩玻）
 *   2. 外侧廊外墙扶壁顶的尖顶小塔（pinnacle）
 *   3. 西立面雕像长廊（雕像壁龛）
 *   4. 中殿外墙檐口线脚 + 飞扶壁塔尖点缀
 */
import { createPlan, AXIS } from '../layout.js'

const M = {
  glass: 'light_blue_stained_glass',
  glassIn: 'yellow_stained_glass',
  stone: 'polished_deepslate',
  calcite: 'calcite',
  wall: 'stone_bricks',
  statue: 'polished_andesite',
}

const CX = 3, CY = 43, R = 11

export function build({ site }) {
  const api = createPlan(35)

  // =============================================================== 1. 玫瑰窗
  // 1a. 整圆彩玻（逐行）
  for (let dy = -R; dy <= R; dy++) {
    const w = Math.floor(Math.sqrt(R * R - dy * dy))
    api.box(CX - 1, CY + dy, -w, CX + 1, CY + dy, w, M.glass, 'replace', `玫瑰窗/玻${dy}`)
  }
  // 1b. 内圈（r<=4）换金黄
  for (let dy = -4; dy <= 4; dy++) {
    const w = Math.floor(Math.sqrt(16 - dy * dy))
    api.box(CX - 1, CY + dy, -w, CX + 1, CY + dy, w, M.glassIn, 'replace', `玫瑰窗/内圈${dy}`)
  }
  // 1c. 放射状石窗格（8 向）
  api.box(CX - 1, CY - R, 0, CX + 1, CY + R, 0, M.stone, 'replace', '玫瑰窗/竖辐')
  api.box(CX - 1, CY, -R, CX + 1, CY, R, M.stone, 'replace', '玫瑰窗/横辐')
  for (let k = -7; k <= 7; k++) {
    api.box(CX - 1, CY + k, k, CX + 1, CY + k, k, M.stone, 'replace', '玫瑰窗/斜辐A')
    api.box(CX - 1, CY + k, -k, CX + 1, CY + k, -k, M.stone, 'replace', '玫瑰窗/斜辐B')
  }
  // 1d. 两个分环（r≈4、r≈8）
  for (const r of [4, 8]) {
    for (let dy = -r; dy <= r; dy++) {
      const dz = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)))
      api.box(CX - 1, CY + dy, dz, CX + 1, CY + dy, dz, M.stone, 'replace', '玫瑰窗/环')
      api.box(CX - 1, CY + dy, -dz, CX + 1, CY + dy, -dz, M.stone, 'replace', '玫瑰窗/环')
    }
  }
  // 1e. 中心石核
  api.box(CX - 1, CY - 1, -1, CX + 1, CY + 1, 1, M.calcite, 'replace', '玫瑰窗/石核')

  // =============================================================== 2. 外侧廊外墙扶壁尖顶（pinnacle）
  for (const s of [1, -1]) {
    for (const xi of AXIS.PIER_LINES) {
      const zc = s * 55
      api.box(xi - 2, 35, zc - 2, xi + 2, 37, zc + 2, M.wall, 'replace', '尖顶/座')
      api.box(xi - 1, 38, zc - 1, xi + 1, 41, zc + 1, M.stone, 'replace', '尖顶/身')
      api.box(xi, 42, zc, xi, 44, zc, M.calcite, 'replace', '尖顶/顶')
    }
  }

  // =============================================================== 3. 西立面雕像长廊（壁龛 + 雕像）
  for (const z of [-36, -24, -12, 12, 24, 36]) {
    api.box(-1, 8, z - 2, 5, 15, z + 2, 'air', 'replace', '雕像/壁龛')
    api.box(2, 9, z - 1, 3, 14, z + 1, M.statue, 'replace', '雕像/身')
    api.box(2, 15, z, 3, 16, z, M.calcite, 'replace', '雕像/头')
    api.box(0, 7, z - 2, 4, 7, z + 2, M.stone, 'replace', '雕像/龛楣')
  }

  // =============================================================== 4. 檐口线脚（中殿外墙檐下 + 西立面横带）
  for (const s of [1, -1]) {
    const zo = s * 53
    api.box(43, 47, zo - 2, 155, 48, zo + 2, M.stone, 'replace', '线脚/中殿外檐')
    api.box(43, 49, zo - 1, 155, 49, zo + 1, M.calcite, 'replace', '线脚/中殿外檐2')
  }
  api.box(-1, 26, -54, 5, 26, 54, M.stone, 'replace', '线脚/立面横带')
  api.box(-1, 34, -54, 5, 35, 54, M.calcite, 'replace', '线脚/立面束带')

  return api.ops
}
