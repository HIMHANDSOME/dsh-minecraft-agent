/**
 * PHASE 8 —— 高窗（彩窗）+ 中殿肋拱
 *
 * building.md §2：高窗约 y=48..61；肋拱最高 y=68；每个标准开间由四角主柱、
 * 两条对角肋、横肋和纵肋形成真实上升的肋拱；肋材相对填充突出至少 1 格；
 * 北侧彩窗偏深蓝/蓝紫/紫白，南侧红紫/深红/金红。
 *
 * 体素做法：
 *   1. 高窗墙：z=±(14..18)、y=44..62，每开间掏一个尖券窗；
 *   2. 窗内填彩窗玻璃，并留石窗格（中梃 + 横档），不是一整块矩形；
 *   3. 中殿拱顶：拱腹自 z=±14 的 y=48 上升到 z=0 的 y=68（真实上升），
 *      壳为 3 格厚；横肋（每条柱线）、纵肋（脊线）、对角肋（每开间两条）。
 */
import { createPlan, AXIS } from '../layout.js'

const M = {
  wall: 'stone_bricks',
  rib: 'polished_andesite',
  trim: 'polished_deepslate',
  vault: 'stone_bricks',
  mullion: 'polished_andesite',
}

const Y_CLER_SPRING = 48
const Y_CLER_TOP = 58
const Y_VAULT_SPRING = 48
const Y_VAULT_CROWN = 68
const Z_SPRING = 14

/** 中殿拱腹高度：z=0 最高 (68)，|z|=14 为起拱 (48) */
export function naveVaultH(z) {
  const t = Math.min(1, Math.abs(z) / Z_SPRING)
  return Math.round(Y_VAULT_CROWN - (Y_VAULT_CROWN - Y_VAULT_SPRING) * Math.pow(t, 1.5))
}

/** 尖券半宽收缩（相邻同宽合并） */
function archSegments(ySpring, yApex, halfSpan) {
  const rise = yApex - ySpring
  const hwAt = (y) => Math.max(0, Math.round(halfSpan * Math.pow(1 - (y - ySpring) / rise, 0.62) * 2) / 2)
  const out = []
  let s = ySpring, prev = hwAt(ySpring)
  for (let y = ySpring + 1; y <= yApex + 1; y++) {
    const hv = y <= yApex ? hwAt(y) : null
    if (hv !== prev) { out.push({ y1: s, y2: y - 1, w: Math.round(prev) }); s = y; prev = hv }
  }
  return out
}

export function build({ site }) {
  const api = createPlan(8)
  const X0 = AXIS.PIER_LINES[0]
  const X1 = AXIS.PIER_LINES[AXIS.PIER_LINES.length - 1]

  // =============================================================== 1. 高窗
  for (const s of [1, -1]) {
    const side = s > 0 ? 'S' : 'N'
    const zw = s > 0 ? [14, 18] : [-18, -14]
    // 彩窗配色（§2：北蓝紫、南红金）
    const glassMain = s > 0 ? 'red_stained_glass' : 'blue_stained_glass'
    const glassAlt = s > 0 ? 'orange_stained_glass' : 'purple_stained_glass'
    const glassTop = s > 0 ? 'yellow_stained_glass' : 'light_blue_stained_glass'

    api.box(X0 + 2, 44, zw[0], X1 - 2, 62, zw[1], M.wall, 'replace', `高窗${side}/墙`)
    for (let i = 0; i < AXIS.PIER_LINES.length - 1; i++) {
      const xi = AXIS.PIER_LINES[i]
      const a = xi + 4, b = xi + 10, cxm = xi + 7
      // 矩形窗洞
      api.box(a, Y_CLER_SPRING, zw[0], b, Y_CLER_TOP, zw[1], 'air', 'replace', `高窗${side}/洞i${i}`)
      // 尖券窗头
      for (const seg of archSegments(Y_CLER_TOP + 1, 64, 3.0)) {
        if (seg.w >= 0) api.box(cxm - seg.w, seg.y1, zw[0], cxm + seg.w, seg.y2, zw[1], 'air', 'replace', `高窗${side}/券i${i}`)
      }
      // 彩窗玻璃（分三段配色）
      api.box(a, Y_CLER_SPRING, zw[0], b, Y_CLER_SPRING + 3, zw[1], glassMain, 'replace', `高窗${side}/玻下i${i}`)
      api.box(a, Y_CLER_SPRING + 4, zw[0], b, Y_CLER_SPRING + 7, zw[1], glassAlt, 'replace', `高窗${side}/玻中i${i}`)
      api.box(a, Y_CLER_SPRING + 8, zw[0], b, Y_CLER_TOP, zw[1], glassTop, 'replace', `高窗${side}/玻上i${i}`)
      // 石窗格：中梃 + 两道横档（不是一整块矩形）
      api.box(cxm, Y_CLER_SPRING, zw[0], cxm, Y_CLER_TOP, zw[1], M.mullion, 'replace', `高窗${side}/中梃i${i}`)
      api.box(a, Y_CLER_SPRING + 4, zw[0], b, Y_CLER_SPRING + 4, zw[1], M.mullion, 'replace', `高窗${side}/横档i${i}`)
      // 窗券边框（突出 1 格）
      api.box(a - 1, Y_CLER_SPRING - 1, zw[0] - (s > 0 ? 1 : 0), b + 1, Y_CLER_SPRING - 1, zw[1] + (s > 0 ? 0 : 1), M.trim, 'replace', `高窗${side}/窗台i${i}`)
    }
  }

  // =============================================================== 2. 中殿拱顶壳
  {
    let runStart = -Z_SPRING, prev = naveVaultH(-Z_SPRING)
    const pushed = []
    for (let z = -Z_SPRING + 1; z <= Z_SPRING + 1; z++) {
      const hv = z <= Z_SPRING ? naveVaultH(z) : null
      if (hv !== prev) { pushed.push({ z1: runStart, z2: z - 1, y: prev }); runStart = z; prev = hv }
    }
    for (const seg of pushed) {
      api.box(X0, seg.y, seg.z1, X1, seg.y + 2, seg.z2, M.vault, 'keep', `拱顶/壳y${seg.y}`)
    }

    // 横肋：每条柱线
    for (const xi of AXIS.PIER_LINES) {
      for (const seg of pushed) {
        api.box(xi, seg.y - 1, seg.z1, xi, seg.y - 1, seg.z2, M.rib, 'replace', `拱顶/横肋x${xi}`)
      }
    }
    // 纵肋：脊线与两侧
    for (const z of [0, -7, 7]) {
      api.box(X0, naveVaultH(z) - 1, z, X1, naveVaultH(z) - 1, z, M.rib, 'replace', `拱顶/纵肋z${z}`)
    }
    // 对角肋：每开间两条，从角柱顶升到开间中心脊
    for (let i = 0; i < AXIS.PIER_LINES.length - 1; i++) {
      const xa = AXIS.PIER_LINES[i], xb = AXIS.PIER_LINES[i + 1]
      const cx = (xa + xb) / 2
      for (const dir of [1, -1]) {
        for (let k = 0; k <= 8; k++) {
          const t = k / 8
          const x = Math.round(xa + (xb - xa) * t)
          const z = Math.round(dir * Z_SPRING * (1 - t))
          const y = naveVaultH(z) - 1
          api.box(x, y, z, x, y, z, M.rib, 'replace', `拱顶/对角肋i${i}d${dir}k${k}`)
        }
      }
    }
  }

  return api.ops
}
