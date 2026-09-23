/**
 * PHASE 34 —— 修复（四）：全域照明补强（防刷怪）
 *
 * 用户实测反馈：整个建筑的照明不佳，容易刷怪。
 * 修法：按"每约 14 格一盏链吊灯笼"的密度，系统补灯——
 * 中殿拱顶、侧廊、耳堂、唱诗班、后殿环廊、地宫、双塔、修道院、主教宫、墓园、
 * 西广场与台地边缘。全部用 iron_chain + lantern（隐蔽，无裸露萤石/火把）。
 */
import { createPlan, AXIS } from '../layout.js'
import { C as EC } from '../eastend.js'

export function build({ site }) {
  const api = createPlan(34)
  const lamps = []

  // 中殿：柱线上 y=44 挂灯，每 2 开间一盏
  for (const x of [57, 85, 113, 141]) for (const z of [0, -24, 24]) lamps.push([x, 44, z, '中殿'])
  // 侧廊（内廊拱腹下）
  for (const x of [57, 85, 113, 141]) { lamps.push([x, 33, 24, '侧廊']); lamps.push([x, 33, -24, '侧廊']) }
  // 耳堂
  for (const z of [-66, -40, 0, 40, 66]) lamps.push([172, 58, z, '耳堂'])
  // 唱诗班
  for (const x of [204, 218]) lamps.push([x, 44, 0, '唱诗班'])
  // 后殿环廊（沿内环）
  for (const d of [-75, -45, -15, 15, 45, 75]) {
    const a = (d * Math.PI) / 180
    lamps.push([Math.round(EC.x + 14 * Math.cos(a)), 30, Math.round(14 * Math.sin(a)), '后殿'])
  }
  // 地宫
  for (const x of [99, 127, 155, 183, 211]) for (const z of [-18, 0, 18]) lamps.push([x, -5, z, '地宫'])
  // 双塔塔内
  for (const zc of [AXIS.TOWER_Z, -AXIS.TOWER_Z]) for (const y of [30, 60, 100]) lamps.push([13, y, zc, '塔内'])
  // 管风琴平台
  for (const z of [-6, 6]) lamps.push([40, 26, z, '管风琴'])
  // 西厅/前厅
  lamps.push([14, 10, 6, '前厅']); lamps.push([14, 10, -6, '前厅'])
  // 修道院
  for (const x of [92, 120, 148]) for (const z of [-138, -112, -78]) lamps.push([x, -27, z, '修道院'])
  // 主教宫
  for (const x of [78, 120, 160]) for (const z of [96, 118, 140]) lamps.push([x, -13, z, '主教宫'])
  // 墓园
  for (const x of [306, 340, 380]) for (const z of [-40, 0, 40]) lamps.push([x, -45, z, '墓园'])
  // 西广场
  for (const x of [-192, -160, -128]) for (const z of [-64, 0, 64]) lamps.push([x, -61, z, '广场'])
  // 台地边缘
  for (const x of [-4, 60, 120, 180, 240]) lamps.push([x, 1, 58, '台地'])

  for (const [x, y, z, tag] of lamps) {
    api.box(x, y + 1, z, x, y + 1, z, 'iron_chain', 'replace', `照明/${tag}/链`)
    api.box(x, y, z, x, y, z, 'lantern', 'replace', `照明/${tag}/灯`)
  }
  return api.ops
}
