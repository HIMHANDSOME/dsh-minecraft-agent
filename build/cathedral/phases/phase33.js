/**
 * PHASE 33 —— 修复（三）：各建筑之间道路联通
 *
 * 用户实测反馈：各个建筑之间没有联通性。
 * 现状：教堂在山顶台地（y=0），西广场在湖岸（y=-64，已由大台阶连通），
 * 北修道院（y=-30）、南主教宫（y=-16）、东墓园（y=-48）各自孤立。
 *
 * 修法：修 3 条石板阶梯 + 平路，把外围建筑接到教堂台地；西广场→大台阶→教堂保持。
 *   A. 教堂 → 北修道院（x=118..121，台地北缘下梯到 y=-30，再平路到修道院南门）
 *   B. 教堂 → 南主教宫（x=130..133，台地南缘下梯到 y=-16，再平路到宫北）
 *   C. 教堂 → 东墓园（z=0 中轴东延，从后殿 x=273 逐级下到 y=-48，再平路到墓园西墙）
 * 台阶用 smooth_stone，平路用 polished_andesite，沿途点灯。
 */
import { createPlan } from '../layout.js'

const M = { path: 'polished_andesite', step: 'smooth_stone' }

/** 沿 z 方向从 (x, yFrom, zFrom) 到 (x, yTo, zTo) 的 4 格宽台阶 */
function stairZ(api, x1, x2, zFrom, zTo, yFrom, yTo, tag) {
  const n = Math.abs(zTo - zFrom)
  for (let k = 0; k <= n; k++) {
    const z = zFrom + Math.sign(zTo - zFrom) * k
    const y = yFrom + Math.round((yTo - yFrom) * k / Math.max(1, n))
    api.box(x1, y, z, x2, y, z, M.step, 'replace', `${tag}/阶${k}`)
  }
}
/** 沿 x 方向从 (xFrom, yFrom, z) 到 (xTo, yTo, z) 的 4 格宽台阶 */
function stairX(api, xFrom, xTo, yFrom, yTo, z1, z2, tag) {
  const n = Math.abs(xTo - xFrom)
  for (let k = 0; k <= n; k++) {
    const x = xFrom + Math.sign(xTo - xFrom) * k
    const y = yFrom + Math.round((yTo - yFrom) * k / Math.max(1, n))
    api.box(x, y, z1, x, y, z2, M.step, 'replace', `${tag}/阶${k}`)
  }
}
function flat(api, x1, z1, x2, z2, y, tag) {
  const [xa, xb] = [Math.min(x1, x2), Math.max(x1, x2)]
  const [za, zb] = [Math.min(z1, z2), Math.max(z1, z2)]
  api.box(xa, y, za, xb, y, zb, M.path, 'replace', tag)
}

export function build({ site }) {
  const api = createPlan(33)

  // =============================================================== A. 教堂 → 北修道院
  stairZ(api, 118, 121, -64, -94, 0, -30, '道路/北梯')
  flat(api, 118, -94, 121, -60, -30, '道路/北平路')
  flat(api, 118, -60, 127, -60, -30, '道路/北接门')

  // =============================================================== B. 教堂 → 南主教宫
  stairZ(api, 130, 133, 64, 90, 0, -16, '道路/南梯')
  flat(api, 130, 90, 133, 108, -16, '道路/南平路')
  flat(api, 84, 102, 133, 102, -16, '道路/南接门')

  // =============================================================== C. 教堂 → 东墓园
  stairX(api, 273, 300, 0, -48, -3, 3, '道路/东梯')
  flat(api, 300, -3, 392, 3, -48, '道路/东平路')

  // =============================================================== D. 西广场 → 大台阶 → 教堂（已有，补一段连接）
  flat(api, -118, -14, -108, 14, -64, '道路/西接台阶')

  // 沿途灯笼
  const lamps = [
    [118, -29, -64], [118, -29, -80], [118, -30, -100], [130, -15, 64], [130, -15, 82],
    [130, -16, 102], [280, -47, 0], [320, -47, 0], [360, -47, 0], [392, -48, 0],
  ]
  for (const [x, y, z] of lamps) {
    api.box(x, y + 3, z, x, y + 3, z, 'iron_chain', 'replace', '道路/链')
    api.box(x, y + 2, z, x, y + 2, z, 'lantern', 'replace', '道路/灯')
  }

  return api.ops
}
