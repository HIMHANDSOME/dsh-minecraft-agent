/**
 * PHASE 7 —— 中殿拱廊 + 侧廊拱顶 + 外侧廊外墙
 *
 * building.md §2：每个标准开间由四角主柱、对角肋、横肋和纵肋形成**真实上升**的肋拱；
 * 侧廊拱顶约 y=35；主拱起拱 y=44；不得用平顶下贴假拱；肋材相对填充突出至少 1 格。
 *
 * 体素做法：
 *   1. 拱廊墙：z=±18 平面，每个 14 格开间内、柱间净宽 7 格（x=x_i+4..x_i+10）建墙 y=0..47；
 *   2. 掏尖券：开口 y=0..25 全宽；y=26..40 按双圆心尖券半宽逐层内收（相邻同宽合并）；
 *   3. 侧廊拱顶：内廊 z=19..30、外廊 z=32..49，拱壳为沿曲线 **3 格厚** 的石板，
 *      拱腹（内表面）由边缘 y=29 升到脊 y=35；曲线以下的廊内空间保持净空；
 *   4. 横肋：每条柱线上、拱腹下方 1 格放 polished_andesite 肋（比填充突出 1 格）；
 *   5. 外侧廊外墙 z=±(50..53)，y=0..47，柱线处外凸扶壁墩。
 */
import { createPlan, AXIS } from '../layout.js'

const M = {
  wall: 'stone_bricks',
  rib: 'polished_andesite',
  trim: 'polished_deepslate',
  vault: 'stone_bricks',
  vaultRib: 'polished_andesite',
}

const Y_SPRING = 26
const Y_APEX = 40
const AISLE_Y_EDGE = 29
const AISLE_Y_CROWN = 35
const OUTER_WALL_Z = 50

/** 双圆心尖券半宽随高度收缩；相邻同宽合并成一条 fill（air 掏空） */
function carveArch(api, cx, z1, z2, { ySpring = Y_SPRING, yApex = Y_APEX, halfSpan = 3.0, tag = '' } = {}) {
  const rise = yApex - ySpring
  const hwAt = (y) => Math.max(0, Math.round(halfSpan * Math.pow(1 - (y - ySpring) / rise, 0.62) * 2) / 2)
  let runStart = ySpring, prev = hwAt(ySpring)
  for (let y = ySpring + 1; y <= yApex + 1; y++) {
    const hv = y <= yApex ? hwAt(y) : null
    if (hv !== prev) {
      const w = Math.round(prev)
      if (w >= 0) api.box(cx - w, runStart, z1, cx + w, y - 1, z2, 'air', 'replace', `${tag}/券`)
      runStart = y; prev = hv
    }
  }
}

/** 某条侧廊的拱腹高度（抛物上升） */
function vaultProfile(lo, hi) {
  const mid = (lo + hi) / 2, half = (hi - lo + 1) / 2
  return (z) => Math.round(AISLE_Y_EDGE + (AISLE_Y_CROWN - AISLE_Y_EDGE) * (1 - Math.pow((z - mid) / half, 2)))
}

export function build({ site }) {
  const api = createPlan(7)
  const X0 = AXIS.PIER_LINES[0]
  const X1 = AXIS.PIER_LINES[AXIS.PIER_LINES.length - 1]

  for (const s of [1, -1]) {
    const side = s > 0 ? 'S' : 'N'
    const zw = s > 0 ? [17, 18] : [-18, -17]
    const aisles = s > 0
      ? [[19, 30, '内'], [32, 49, '外']]
      : [[-30, -19, '内'], [-49, -32, '外']]

    // ---------------- 1+2. 拱廊墙与尖券
    for (let i = 0; i < AXIS.PIER_LINES.length - 1; i++) {
      const xi = AXIS.PIER_LINES[i]
      const a = xi + 4, b = xi + 10
      api.box(a, 0, zw[0], b, 47, zw[1], M.wall, 'replace', `拱廊${side}/墙i${i}`)
      api.box(a, 0, zw[0], b, Y_SPRING - 1, zw[1], 'air', 'replace', `拱廊${side}/券脚i${i}`)
      carveArch(api, xi + 7, zw[0], zw[1], { tag: `拱廊${side}/券i${i}` })
    }
    api.box(X0 + 4, 44, zw[0], X1 - 4, 45, zw[1], M.trim, 'replace', `拱廊${side}/束带`)

    // ---------------- 3+4. 侧廊拱壳与横肋
    for (const [za, zb, name] of aisles) {
      const lo = Math.min(za, zb), hi = Math.max(za, zb)
      const h = vaultProfile(lo, hi)
      let runStart = lo, prev = h(lo)
      for (let z = lo + 1; z <= hi + 1; z++) {
        const hv = z <= hi ? h(z) : null
        if (hv !== prev) {
          api.box(X0, prev, runStart, X1, prev + 2, z - 1, M.vault, 'keep', `侧廊${side}${name}/拱壳`)
          runStart = z; prev = hv
        }
      }
      for (const xi of AXIS.PIER_LINES) {
        let rs = lo, ph = h(lo)
        for (let z = lo + 1; z <= hi + 1; z++) {
          const hv = z <= hi ? h(z) : null
          if (hv !== ph) {
            api.box(xi, ph - 1, rs, xi, ph - 1, z - 1, M.vaultRib, 'replace', `侧廊${side}${name}/横肋x${xi}`)
            rs = z; ph = hv
          }
        }
      }
      const crownZ = Math.round((lo + hi) / 2)
      api.box(X0, h(crownZ) - 1, crownZ, X1, h(crownZ) - 1, crownZ, M.vaultRib, 'replace', `侧廊${side}${name}/纵肋`)
    }

    // ---------------- 5. 外侧廊外墙 + 扶壁墩 + 侧廊窗
    const wo = s > 0 ? [OUTER_WALL_Z, OUTER_WALL_Z + 3] : [-OUTER_WALL_Z - 3, -OUTER_WALL_Z]
    api.box(X0, 0, wo[0], X1, 47, wo[1], M.wall, 'replace', `外墙${side}/墙身`)
    api.box(X0, 0, wo[0] - 1, X1, 2, wo[1] + 1, M.trim, 'replace', `外墙${side}/墙脚`)
    api.box(X0, 45, wo[0] - 1, X1, 47, wo[1] + 1, M.trim, 'replace', `外墙${side}/压顶`)
    for (let i = 0; i < AXIS.PIER_LINES.length - 1; i++) {
      const xi = AXIS.PIER_LINES[i]
      const a = xi + 4, b = xi + 10
      api.box(a, 14, wo[0], b, 26, wo[1], 'air', 'replace', `外墙${side}/窗i${i}`)
      carveArch(api, xi + 7, wo[0], wo[1], { ySpring: 26, yApex: 34, halfSpan: 3.0, tag: `外墙${side}/窗券i${i}` })
    }
    for (const xi of AXIS.PIER_LINES) {
      const bz = s > 0 ? [OUTER_WALL_Z + 4, OUTER_WALL_Z + 7] : [-OUTER_WALL_Z - 7, -OUTER_WALL_Z - 4]
      api.box(xi - 3, 0, bz[0], xi + 3, 34, bz[1], M.wall, 'replace', `外墙${side}/扶壁x${xi}`)
      api.box(xi - 4, 0, bz[0] - 1, xi + 4, 2, bz[1] + 1, M.trim, 'replace', `外墙${side}/扶壁基x${xi}`)
    }
  }

  return api.ops
}
