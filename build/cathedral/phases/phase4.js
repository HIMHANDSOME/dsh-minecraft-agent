/**
 * PHASE 4 —— 西立面下部（x=0..42, y=0..32）：三门、双塔基、西厅
 *
 * building.md §2：西立面整体约宽 109 格，严格以 z=0 镜像；中门控制范围 z=-8..8、
 * 高约 28；副门北约 z=-38..-28、南镜像 z=+28..+38（净洞 11 格）。
 * 双塔中心 z=±34，塔身 27×27（z=-47..-21 / +21..+47）。
 *
 * 本阶段只做 y=0..32 的下部（门户层 + 塔基），上部留到 PHASE 15-17。
 */
import { createPlan, AXIS } from '../layout.js'

const MAT = {
  wall: 'stone_bricks',
  wallAlt: 'polished_andesite',
  trim: 'polished_deepslate',
  base: 'andesite',
  accent: 'calcite',
  weathered: 'cracked_stone_bricks',
  mossy: 'mossy_stone_bricks',
  door: 'dark_oak_door',
  iron: 'iron_bars',
}

const FACADE_X = [0, 4]          // 西立面前墙厚度（x=0..4）
const TOWER_DEPTH = 26          // 塔身 x=0..26

export function build({ site }) {
  const api = createPlan(4)
  const H = 32

  // ---------------------------------------------------------------- 1. 西立面前墙
  api.box(FACADE_X[0], 0, -54, FACADE_X[1], H, 54, MAT.wall, 'replace', '西立面/前墙')
  // 墙脚基座（外凸 1 格）
  api.box(-1, 0, -55, 5, 3, 55, MAT.base, 'replace', '西立面/墙脚')

  // ---------------------------------------------------------------- 2. 三门洞（挖空）
  // 中门 z=-8..8，高 28（洞口净高 27，门楣在上）
  api.box(FACADE_X[0] - 1, 1, -8, FACADE_X[1] + 1, 27, 8, 'air', 'replace', '中门/门洞')
  // 北副门 z=-38..-28（净洞 11 格），高 22
  api.box(FACADE_X[0] - 1, 1, -38, FACADE_X[1] + 1, 21, -28, 'air', 'replace', '北副门/门洞')
  // 南副门 z=28..38
  api.box(FACADE_X[0] - 1, 1, 28, FACADE_X[1] + 1, 21, 38, 'air', 'replace', '南副门/门洞')

  // 中门门框与尖券收边（扇形石券：逐层内收）
  for (let i = 0; i < 3; i++) {
    const zz = 8 - i
    const y = 27 + i * 2
    api.box(FACADE_X[0] - 1, y, -zz, FACADE_X[1] + 1, y + 1, zz, MAT.trim, 'replace', `中门/尖券${i}`)
    api.box(FACADE_X[0] - 1, y + 1, -zz + 1, FACADE_X[1] + 1, y + 2, zz - 1, 'air', 'replace', `中门/券洞${i}`)
  }
  // 门柱（mullion）：中门分成两扇
  api.box(FACADE_X[0] - 1, 1, 0, FACADE_X[1] + 1, 20, 0, MAT.trim, 'replace', '中门/门柱')
  // 副门尖券
  for (const [z1, z2, tag] of [[-38, -28, '北副门'], [28, 38, '南副门']]) {
    api.box(FACADE_X[0] - 1, 22, z1, FACADE_X[1] + 1, 23, z2, MAT.trim, 'replace', `${tag}/券脚`)
    api.box(FACADE_X[0] - 1, 23, z1 + 2, FACADE_X[1] + 1, 24, z2 - 2, MAT.trim, 'replace', `${tag}/券顶`)
  }

  // 立面上部横带（y=29..32），预留给玫瑰窗层
  api.box(-1, 29, -54, FACADE_X[1] + 1, 31, 54, MAT.wallAlt, 'replace', '西立面/横带')

  // ---------------------------------------------------------------- 3. 双塔塔基 27×27
  for (const zc of [AXIS.TOWER_Z, -AXIS.TOWER_Z]) {
    const z1 = zc - 13, z2 = zc + 13
    // 塔身四壁（shell）
    api.shell(0, 0, z1, TOWER_DEPTH, H, z2, MAT.wall, `塔(z=${zc})/塔身`)
    // 塔基座（外扩 1）+ 束带
    api.box(-1, 0, z1 - 1, TOWER_DEPTH + 1, 3, z2 + 1, MAT.base, 'replace', `塔(z=${zc})/基座`)
    api.box(-1, 4, z1 - 1, TOWER_DEPTH + 1, 4, z2 + 1, MAT.trim, 'replace', `塔(z=${zc})/束带`)
    // 四角扶壁柱 5×5
    for (const [cx, cz] of [[0, z1], [TOWER_DEPTH, z1], [0, z2], [TOWER_DEPTH, z2]]) {
      api.box(cx - 2, 0, cz - 2, cx + 2, H, cz + 2, MAT.wallAlt, 'replace', `塔(z=${zc})/角扶壁`)
    }
    // 塔内掏空（可通行）
    api.box(3, 1, z1 + 3, TOWER_DEPTH - 3, H, z2 - 3, 'air', 'replace', `塔(z=${zc})/内部`)
    // 塔基内与西厅连通的开口
    api.box(TOWER_DEPTH - 2, 1, zc - 3, TOWER_DEPTH, 8, zc + 3, 'air', 'replace', `塔(z=${zc})/西厅门洞`)
    // 塔身外部风化点缀（限墙外皮 x=TOWER_DEPTH 面）
    api.box(TOWER_DEPTH, 10, z1 + 4, TOWER_DEPTH, 20, z1 + 8, MAT.weathered, 'replace', `塔(z=${zc})/风化`)
  }

  // ---------------------------------------------------------------- 4. 西厅（narthex）地面与侧墙
  api.box(5, 0, -21, 26, 0, 21, MAT.trim, 'replace', '西厅/地面')
  api.box(5, 1, -21, 26, H, -21, MAT.wall, 'replace', '西厅/北墙')
  api.box(5, 1, 21, 26, H, 21, MAT.wall, 'replace', '西厅/南墙')

  return api.ops
}
