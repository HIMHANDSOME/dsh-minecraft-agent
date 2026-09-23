/**
 * eastend.js —— 东端（后殿 / 环廊 / 放射礼拜堂）共享几何
 *
 * building.md §1.1 E 区 x=232..273；§2：多边形后殿、可通行环廊、七座可进入的放射礼拜堂
 * （北三、中央一、南三）；彩窗分区：北侧深蓝/蓝紫/紫白，中央金白蓝，南侧红紫/深红/金红。
 *
 * 采用极坐标控制（中心 C=(232,0)，即唱诗班东端）：
 *   外墙壁线半径 R_out = 26，用 6 段折线近似半圆 → 得到"多边形"后殿；
 *   内环柱线半径 R_in = 14，二者之间为可通行的环廊（宽 12）；
 *   七座放射礼拜堂沿 θ = -90,-60,-30,0,30,60,90 布置在半径 30 处，外包 9×9。
 */

export const C = { x: 232, z: 0 }
export const R_OUT = 26
export const R_IN = 14
export const R_CHAPEL = 30
export const WALL_T = 4
export const H_WALL = 47
export const H_PIER = 36

const polar = (r, deg) => {
  const a = (deg * Math.PI) / 180
  return { x: Math.round(C.x + r * Math.cos(a)), z: Math.round(C.z + r * Math.sin(a)) }
}

/** 外墙壁线折点（6 段折线，= 多边形后殿的棱） */
export const OUTER_V = [-90, -60, -30, 0, 30, 60, 90].map((d) => ({ deg: d, ...polar(R_OUT, d) }))
/** 内环柱位 */
export const INNER_V = [-90, -60, -30, 0, 30, 60, 90].map((d) => ({ deg: d, ...polar(R_IN, d) }))

/** 七座放射礼拜堂：位置 + 配色（北蓝紫 / 中央金白蓝 / 南红金） */
export const CHAPELS = [-90, -60, -30, 0, 30, 60, 90].map((deg) => {
  const p = polar(R_CHAPEL, deg)
  let glass
  if (p.z < -3) glass = ['blue_stained_glass', 'purple_stained_glass', 'light_blue_stained_glass']
  else if (p.z > 3) glass = ['red_stained_glass', 'purple_stained_glass', 'orange_stained_glass']
  else glass = ['yellow_stained_glass', 'white_stained_glass', 'light_blue_stained_glass']
  return { deg, ...p, glass, tag: deg === 0 ? '中央礼拜堂' : `放射礼拜堂${deg > 0 ? 'S' : 'N'}${Math.abs(deg)}` }
})

/** 沿 p1→p2 逐格摆放 thick×thick 的柱，形成折线墙 */
export function lineWall(api, p1, p2, y1, y2, thick, block, mode, tag) {
  const steps = Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.z - p1.z))
  const seen = new Set()
  const h = Math.floor(thick / 2)
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0
    const x = Math.round(p1.x + (p2.x - p1.x) * t)
    const z = Math.round(p1.z + (p2.z - p1.z) * t)
    const key = `${x},${z}`
    if (seen.has(key)) continue
    seen.add(key)
    api.box(x - h, y1, z - h, x - h + thick - 1, y2, z - h + thick - 1, block, mode, tag)
  }
}

/** 从礼拜堂中心指向后殿中心的单位方向（取主轴） */
export function inwardAxis(chapel) {
  const dx = C.x - chapel.x, dz = C.z - chapel.z
  if (Math.abs(dx) >= Math.abs(dz)) return { axis: 'x', sign: Math.sign(dx) || -1 }
  return { axis: 'z', sign: Math.sign(dz) || -1 }
}
