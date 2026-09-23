/**
 * PHASE 12b —— 修复 PHASE 3 楼梯与 PHASE 12 祭坛的两处实测缺陷
 *
 * 缺陷 A（地宫两条楼梯都是死路）：PHASE 3 的井道比踏步多挖了一格
 *   （西梯挖到 x=98、东梯挖到 x=221），正好把楼梯顶端的出口平台挖穿成竖井；
 *   踏步顶面在 y=0（可行走层 y=1），旁边却是洞，走不出去。
 *   修法：把 x=98 与 x=221 的 y=-1..0 补回石砖作为出口平台；
 *   phase3.js 已改为"井道只挖踏步所在列"。
 *
 * 缺陷 B（东梯被祭坛封死）：主祭坛原稿 x=216..224 正压在东梯出口上。
 *   修法：phase12.js 把祭坛整体西移 8 格到 x=206..218（仍在唱诗班内、仍在中轴），
 *   这里把旧祭坛残留整体清除后按新位置重建。
 */
import { createPlan } from '../layout.js'
import { buildAltar } from './phase12.js'

export function build({ site }) {
  const api = createPlan('12b-repair')

  // ---------------- 缺陷 A：补回两条楼梯的出口平台
  api.box(98, -1, -5, 98, 0, 5, 'stone_bricks', 'replace', '修复/西梯出口平台')
  api.box(221, -1, -5, 221, 0, 5, 'stone_bricks', 'replace', '修复/东梯出口平台')

  // ---------------- 缺陷 B：清除旧祭坛（x=210..227 的 y=1..17）
  api.box(210, 1, -11, 227, 17, 11, 'air', 'replace', '修复/清除旧祭坛')
  // 按新位置重建
  buildAltar(api)

  return api.ops
}
