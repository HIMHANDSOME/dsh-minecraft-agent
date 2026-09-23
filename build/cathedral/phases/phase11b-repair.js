/**
 * PHASE 11b —— 修复 PHASE 11 早期版本的两处实测缺陷
 *
 * 缺陷 1：耳堂西墙整片填 x=155..158、y=0..62，把中殿最后一道束柱（x=155 柱线，
 *   实占 x=152..158）连同柱头/顶板一起覆盖成 stone_bricks；开口又把它整段掏空。
 *   修法：按 PHASE 5/6 的同一生成器把 x=155 的 6 根束柱重新写回；
 *   phase11.js 已改为"只在柱与柱之间开口"。
 *
 * 缺陷 2：耳堂墙脚写成 x=154..190, y=0..2, z=-80..80 的实心板，等于在耳堂内部
 *   铺了两层 andesite（实测 y=1 上方不再是净空）。
 *   修法：把内部多余的垫层掏掉（避开交叉柱与端墙墙脚）；phase11.js 已改为只做一圈。
 */
import { createPlan, AXIS } from '../layout.js'
import { bundlePier } from '../pier.js'

const X1 = 155, X2 = 189, WT = 4, ZEND = 79

export function build({ site }) {
  const api = createPlan('11b-repair')

  // ---------------- 缺陷 1：中殿末柱（x=155 柱线）写回
  for (const z of [AXIS.Z_NAVE_PIER, -AXIS.Z_NAVE_PIER]) bundlePier(api, X1, z, 42)
  for (const z of [AXIS.Z_AISLE_INNER, -AXIS.Z_AISLE_INNER, AXIS.Z_AISLE_OUTER, -AXIS.Z_AISLE_OUTER]) bundlePier(api, X1, z, 36)

  // ---------------- 缺陷 2：掏掉耳堂内部多余的垫层
  api.box(X1 + WT, 1, -ZEND + WT, X2 - WT - 1, 2, ZEND - WT, 'air', 'replace', '修复/耳堂内部垫层')
  // x=183..185 是交叉柱所在，只在柱与柱之间掏
  const SEGS = [[-ZEND + WT, -48], [-41, -35], [-27, -22], [-14, 14], [22, 27], [35, 41], [48, ZEND - WT]]
  for (const [za, zb] of SEGS) {
    api.box(X2 - WT - 1, 1, za, X2 - WT + 1, 2, zb, 'air', 'replace', `修复/耳堂垫层x185_${za}_${zb}`)
  }

  // ---------------- 缺陷 3：墙脚横在通中殿/唱诗班的门洞里（y=1..2 挡住通行）
  const OPEN_SEGS = [[-14, 14], [22, 27], [-27, -22], [35, 40], [-40, -35], [48, 53], [-53, -48]]
  for (const [za, zb] of OPEN_SEGS) {
    api.box(X1 - 1, 1, za, X1 + WT, 2, zb, 'air', 'replace', `修复/西洞口墙脚${za}_${zb}`)
    api.box(X2 - WT + 1, 1, za, X2 + 1, 2, zb, 'air', 'replace', `修复/东洞口墙脚${za}_${zb}`)
  }

  return api.ops
}
