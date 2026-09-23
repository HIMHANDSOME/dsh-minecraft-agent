/**
 * PHASE 13 —— 东端多边形后殿 + 可通行环廊
 *
 * 几何见 eastend.js：中心 C=(232,0)，外墙壁线 R_out=26（6 段折线）、
 * 内环柱线 R_in=14、环廊宽 12；后殿屋面做阶梯攒尖，峰顶 y≈72。
 *
 * 内容：
 *   1. 唱诗班东端墙（x=228..231, z=-53..53），中间留后殿大券开口；
 *   2. 后殿外墙（折线 6 段，厚 4，y=0..47），棱位留 7 个礼拜堂开口，段中开 6 扇尖券彩窗；
 *   3. 内环 7 根束柱（到 y=36）；
 *   4. 环廊拱壳（y=33 的环形石板，中央圣所保持通高）；
 *   5. 后殿屋面：自墙顶 y=47 阶梯收到峰顶 y≈72 + 尖顶饰。
 */
import { createPlan } from '../layout.js'
import { bundlePier } from '../pier.js'
import { C, R_OUT, R_IN, OUTER_V, INNER_V, WALL_T, H_WALL, H_PIER, lineWall } from '../eastend.js'

const M = {
  wall: 'stone_bricks',
  trim: 'polished_deepslate',
  base: 'andesite',
  rib: 'polished_andesite',
  roof: 'deepslate_tiles',
}

/** 第 i 段外墙的中点（用作彩窗位置） */
const midOf = (i) => ({
  x: Math.round((OUTER_V[i].x + OUTER_V[i + 1].x) / 2),
  z: Math.round((OUTER_V[i].z + OUTER_V[i + 1].z) / 2),
})

export function build({ site }) {
  const api = createPlan(13)

  // =============================================================== 1. 唱诗班东端墙 + 后殿大券
  api.box(228, 0, -53, 231, H_WALL, 53, M.wall, 'replace', '后殿/东端墙')
  api.box(228, 1, -20, 231, 30, 20, 'air', 'replace', '后殿/大券开口')
  const hwAt = (y) => Math.max(0, Math.round(20 * Math.pow(1 - (y - 30) / 14, 0.62) * 2) / 2)
  let s0 = 30, prev = hwAt(30)
  for (let y = 31; y <= 44; y++) {
    const hv = hwAt(y)
    if (hv !== prev) {
      api.box(228, s0, -Math.round(prev), 231, y - 1, Math.round(prev), 'air', 'replace', '后殿/大券券头')
      s0 = y; prev = hv
    }
  }
  api.box(227, 0, -53, 231, 2, 53, M.base, 'replace', '后殿/东端墙脚')

  // =============================================================== 2. 后殿外墙（折线）
  for (let i = 0; i < OUTER_V.length - 1; i++) {
    lineWall(api, OUTER_V[i], OUTER_V[i + 1], 0, H_WALL, WALL_T, M.wall, 'replace', `后殿/外墙${i}`)
    lineWall(api, OUTER_V[i], OUTER_V[i + 1], 0, 2, WALL_T + 2, M.base, 'replace', `后殿/墙脚${i}`)
    lineWall(api, OUTER_V[i], OUTER_V[i + 1], 45, 46, WALL_T, M.trim, 'replace', `后殿/束带${i}`)
  }

  // 棱位：7 个礼拜堂开口（穿透厚墙）
  for (const v of OUTER_V) {
    api.box(v.x - 3, 1, v.z - 3, v.x + 3, 13, v.z + 3, 'air', 'replace', `后殿/礼拜堂开口${v.deg}`)
  }

  // 段中：6 扇尖券彩窗（中央金白蓝、两侧渐变）
  for (let i = 0; i < OUTER_V.length - 1; i++) {
    const m = midOf(i)
    const nearAxis = Math.abs(m.z) <= 13
    const glass = nearAxis
      ? ['yellow_stained_glass', 'white_stained_glass', 'light_blue_stained_glass']
      : (m.z < 0 ? ['blue_stained_glass', 'purple_stained_glass', 'light_blue_stained_glass']
        : ['red_stained_glass', 'purple_stained_glass', 'orange_stained_glass'])
    api.box(m.x - 3, 16, m.z - 3, m.x + 3, 34, m.z + 3, 'air', 'replace', `后殿/窗洞${i}`)
    api.box(m.x - 3, 35, m.z - 2, m.x + 3, 40, m.z + 2, 'air', 'replace', `后殿/窗券${i}`)
    api.box(m.x - 3, 16, m.z - 3, m.x + 3, 22, m.z + 3, glass[0], 'replace', `后殿/玻下${i}`)
    api.box(m.x - 3, 23, m.z - 3, m.x + 3, 28, m.z + 3, glass[1], 'replace', `后殿/玻中${i}`)
    api.box(m.x - 3, 29, m.z - 3, m.x + 3, 34, m.z + 3, glass[2], 'replace', `后殿/玻上${i}`)
    api.box(m.x, 16, m.z - 3, m.x, 34, m.z + 3, M.rib, 'replace', `后殿/中梃${i}`)
    api.box(m.x - 3, 24, m.z - 3, m.x + 3, 24, m.z + 3, M.rib, 'replace', `后殿/横档${i}`)
  }

  // =============================================================== 3. 环廊内环柱
  for (const v of INNER_V) bundlePier(api, v.x, v.z, H_PIER)

  // =============================================================== 4. 环廊拱壳（环形石板，中央圣所通高）
  for (let z = -R_OUT; z <= R_OUT; z++) {
    const outer = Math.round(Math.sqrt(Math.max(0, R_OUT * R_OUT - z * z)))
    const inner = Math.abs(z) < R_IN ? Math.round(Math.sqrt(Math.max(0, R_IN * R_IN - z * z))) : 0
    const x1 = C.x + inner, x2 = C.x + outer
    if (x2 <= x1) continue
    api.box(x1, 33, z, x2, 33, z, M.wall, 'keep', `后殿/环廊拱壳z${z}`)
    // 外半环再压一层，做出阶梯感
    if (x2 - x1 > 3) api.box(x1 + 2, 30, z, x2, 30, z, M.wall, 'keep', `后殿/环廊拱壳下z${z}`)
  }

  // =============================================================== 5. 后殿屋面（阶梯攒尖）
  for (let y = 48; y <= 72; y++) {
    const r = Math.round(R_OUT * (1 - (y - 47) / 25))
    if (r <= 0) break
    api.box(C.x - 2, y, -r, C.x + r, y, r, M.roof, 'replace', `后殿/屋面y${y}`)
  }
  api.box(C.x, 73, 0, C.x, 75, 0, M.trim, 'replace', '后殿/尖顶饰')

  return api.ops
}
