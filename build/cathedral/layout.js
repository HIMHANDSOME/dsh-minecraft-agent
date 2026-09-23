/**
 * layout.js —— Cathedralis Magna Montis 的**冻结坐标契约**
 *
 * 相对坐标（building.md §1）：x 向东、z<0 为北、z>0 为南；世界换算
 *   X = X0 + x,  Y = Y0 + y,  Z = Z0 + z        （Minecraft: +X 东、+Z 南，无需旋转）
 *
 * PHASE 1 冻结决定（§1.1 的推荐方案，全文只用这一套，绝不中途混用）：
 *   中殿主柱中心      z = ±18      → 中央净通视带 z=-14..14（29 格）
 *   内侧廊柱线        z = ±31
 *   外侧廊柱线        z = ±44
 *   外围墙体          z = ±52（厚 4：z=50..53）
 *   飞扶壁基础自      z = ±56 起
 *   中殿柱线          x = 43,57,71,85,99,113,127,141,155（9 条，8 个 14 格开间）
 *   主体范围          x = 0..273；地坪 y = 0
 *   西塔中心          z = ∓34（北塔）/ +34（南塔），塔身 27×27
 *   西立面总宽        z = -54..54（109 格，关于 z=0 镜像）
 *   西立面主门        z = -8..8，高约 28
 *   玫瑰窗            x = 3..5, y = 43, z = 0，外半径 11
 *
 * 竖直剖面（相对地坪）：柱基 0..8；侧廊拱顶 ~35；主柱顶 42；主拱起拱 44；
 *   高窗 48..61；肋拱最高 68；屋架 72；主屋脊 86；双塔最高 180。
 */

// ---------------------------------------------------------------- 轴线常量
export const AXIS = {
  // x 方向分区
  X_WEST_FRONT: [0, 42],       // A 西立面
  X_NAVE: [43, 154],           // B 中殿
  X_TRANSEPT: [155, 189],      // C 耳堂
  X_CHOIR: [190, 231],         // D 唱诗班/圣坛
  X_EAST: [232, 273],          // E 东端
  X_END: 273,

  // x 方向关键线
  PIER_LINES: [43, 57, 71, 85, 99, 113, 127, 141, 155],
  BAY: 14,

  // z 方向柱线（关于 z=0 镜像）
  Z_NAVE_PIER: 18,
  Z_AISLE_INNER: 31,
  Z_AISLE_OUTER: 44,
  Z_OUTER_WALL: 52,            // 墙中心；墙 z=50..53
  Z_BUTTRESS_BASE: 56,
  Z_TRANSEPT_END: 78,

  // 皮尔几何
  PIER_CORE: 3,                // 3x3 核心
  PIER_PLINTH: 7,              // 柱基/柱头视觉 7x7
  PIER_TOP: 42,

  // 西立面
  FACADE_HALF: 54,
  TOWER_Z: 34,                 // 塔中心 |z|
  TOWER_BODY: 27,              // 塔身 27x27
  TOWER_TOP: 180,
  CENTRAL_DOOR_HALF: 8,
  SIDE_DOOR_N: [-38, -28],     // 北副门（净洞 11 格）
  SIDE_DOOR_S: [28, 38],

  // 玫瑰窗
  ROSE_X: [3, 5],
  ROSE_Y: 43,
  ROSE_R: 11,

  // 竖直剖面
  Y: {
    plinth: [0, 8],
    aisleVault: 35,
    pierTop: 42,
    archSpring: 44,
    clerestory: [48, 61],
    vaultTop: 68,
    truss: 72,
    ridge: 86,
    towerTop: 180,
  },

  // 地下墓室
  CRYPT: { x: [75, 244], y: [-17, -3], z: [-35, 35] },
}

export const mirrorZ = (z) => -z

// ---------------------------------------------------------------- 坐标换算
export function makeTransform(site) {
  const { X0, Y0, Z0 } = site.origin
  return {
    X: (x) => X0 + x,
    Y: (y) => Y0 + y,
    Z: (z) => Z0 + z,
    wx: (x) => X0 + x,
    wy: (y) => Y0 + y,
    wz: (z) => Z0 + z,
    origin: site.origin,
  }
}

/** 相对坐标的轴对齐盒 → 世界坐标盒（x1<=x2 等）。 */
export function toWorldBox(T, rb) {
  const xs = [T.X(rb.x1 ?? rb.x[0]), T.X(rb.x2 ?? rb.x[1])].sort((a, b) => a - b)
  const ys = [T.Y(rb.y1 ?? rb.y[0]), T.Y(rb.y2 ?? rb.y[1])].sort((a, b) => a - b)
  const zs = [T.Z(rb.z1 ?? rb.z[0]), T.Z(rb.z2 ?? rb.z[1])].sort((a, b) => a - b)
  return { x1: xs[0], y1: ys[0], z1: zs[0], x2: xs[1], y2: ys[1], z2: zs[1] }
}

// ---------------------------------------------------------------- 计划构造器
/** 一个施工计划 = 有序 op 列表。op: {kind:'fill'|'set', box, block, mode, tag, phase} */
export function createPlan(phase) {
  const ops = []
  const api = {
    ops,
    /** 相对坐标实心盒 */
    box(x1, y1, z1, x2, y2, z2, block, mode = 'replace', tag = '') {
      ops.push({ kind: 'fill', rel: { x1, y1, z1, x2, y2, z2 }, block, mode, tag, phase })
      return api
    },
    /** 相对坐标单块 */
    set(x, y, z, block, tag = '') {
      ops.push({ kind: 'set', rel: { x1: x, y1: y, z1: z, x2: x, y2: y, z2: z }, block, tag, phase })
      return api
    },
    /** 沿 z 镜像成对生成（z 与 -z 对称） */
    mirroredZ(fn) {
      fn((...a) => api.box(...a), 1)
      fn((...a) => {
        // 把 z 区间关于 0 镜像后再调用
        const [x1, y1, z1, x2, y2, z2, block, mode, tag] = a
        return api.box(x1, y1, -z1, x2, y2, -z2, block, mode, tag)
      }, -1)
      return api
    },
    /** 逐格水平平台（y 固定） */
    plate(x1, z1, x2, z2, y, block, mode = 'replace', tag = '') {
      return api.box(x1, y, z1, x2, y, z2, block, mode, tag)
    },
    /** 四壁（中空盒） */
    shell(x1, y1, z1, x2, y2, z2, block, tag = '') {
      const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)]
      const [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)]
      const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)]
      api.box(ax, ay, az, bx, by, az, block, 'replace', tag + '/n')
      api.box(ax, ay, bz, bx, by, bz, block, 'replace', tag + '/s')
      api.box(ax, ay, az, ax, by, bz, block, 'replace', tag + '/w')
      api.box(bx, ay, az, bx, by, bz, block, 'replace', tag + '/e')
      return api
    },
  }
  return api
}

/** 把任意大盒拆成 <=32768 的子盒（沿最长的水平轴切）。 */
export function splitBox(box, maxVol = 32768) {
  const vol = (box.x2 - box.x1 + 1) * (box.y2 - box.y1 + 1) * (box.z2 - box.z1 + 1)
  if (vol <= maxVol) return [box]
  const out = []
  const dx = box.x2 - box.x1 + 1, dy = box.y2 - box.y1 + 1, dz = box.z2 - box.z1 + 1
  // 选切分轴：优先沿 z，然后 x，最后 y
  const candidates = [
    { axis: 'z', size: dz }, { axis: 'x', size: dx }, { axis: 'y', size: dy },
  ].sort((a, b) => b.size - a.size)
  const { axis, size } = candidates[0]
  const per = Math.max(1, Math.floor(maxVol / (dx * dy * dz / size)))
  if (axis === 'z') {
    for (let z = box.z1; z <= box.z2; z += per) out.push({ ...box, z1: z, z2: Math.min(box.z2, z + per - 1) })
  } else if (axis === 'x') {
    for (let x = box.x1; x <= box.x2; x += per) out.push({ ...box, x1: x, x2: Math.min(box.x2, x + per - 1) })
  } else {
    for (let y = box.y1; y <= box.y2; y += per) out.push({ ...box, y1: y, y2: Math.min(box.y2, y + per - 1) })
  }
  return out.flatMap((b) => splitBox(b, maxVol))
}

export const DEFAULT_MATERIALS = {
  structure: 'stone_bricks',
  plinth: 'polished_andesite',
  highlight: 'polished_andesite',
  accent: 'calcite',
  weathered: 'cracked_stone_bricks',
  mossy: 'mossy_stone_bricks',
  tuff: 'tuff_bricks',
  tuffPolished: 'polished_tuff',
  dark: 'deepslate_bricks',
  roof: 'deepslate_tiles',
  roofTrim: 'polished_deepslate',
  wood: 'dark_oak_log',
  woodBeam: 'stripped_dark_oak_log',
  woodPlank: 'dark_oak_planks',
  fence: 'dark_oak_fence',
  metal: 'iron_bars',
  chain: 'iron_chain',
  lantern: 'lantern',
  air: 'air',
  foundation: 'stone',
  foundationCore: 'andesite',
}
