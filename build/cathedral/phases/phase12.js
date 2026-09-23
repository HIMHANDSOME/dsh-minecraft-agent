/**
 * PHASE 12 —— 唱诗班与主祭坛（choir + high altar）
 *
 * building.md §1.1 D 区 x=190..231；§2：主祭坛约 x=216..224, z=-7..7，高出地坪 3–5 格，
 * 设祭台、烛台、高背屏与十字架；西门中央能望见其中心视觉焦点；
 * 圣坛彩窗金白浅蓝；肋拱最高 y=68、屋脊 y=86（与中殿同一套剖面）。
 *
 * 柱线延续 14 格模数：43+14k → 197 / 211 / 225（190 与 232 为端部）。
 * 西侧 x=190 不设墙 —— 那里通向十字交叉部。
 */
import { createPlan, AXIS } from '../layout.js'
import { bundlePier } from '../pier.js'
import { ribVault, gableRoof, clerestory } from '../vault.js'

const M = {
  wall: 'stone_bricks',
  trim: 'polished_deepslate',
  base: 'andesite',
  mullion: 'polished_andesite',
  altar: 'quartz_block',
  altarTrim: 'smooth_quartz',
  gold: 'gold_block',
  screen: 'polished_tuff',
}

const X1 = 190, X2 = 231
const PIERS = [197, 211, 225]
const BAYS = [[190, 197], [197, 211], [211, 225], [225, 232]]
const OUTER_WALL_Z = 50
const Y_SPRING = 26, Y_APEX = 40

function carveArch(api, cx, z1, z2, tag) {
  const hwAt = (y) => Math.max(0, Math.round(3 * Math.pow(1 - (y - Y_SPRING) / (Y_APEX - Y_SPRING), 0.62) * 2) / 2)
  let s0 = Y_SPRING, prev = hwAt(Y_SPRING)
  for (let y = Y_SPRING + 1; y <= Y_APEX + 1; y++) {
    const hv = y <= Y_APEX ? hwAt(y) : null
    if (hv !== prev) {
      api.box(cx - Math.round(prev), s0, z1, cx + Math.round(prev), y - 1, z2, 'air', 'replace', `${tag}/券`)
      s0 = y; prev = hv
    }
  }
}

export function build({ site }) {
  const api = createPlan(12)

  // =============================================================== 1. 唱诗班拱廊（z=±18）
  for (const s of [1, -1]) {
    const side = s > 0 ? 'S' : 'N'
    const zw = s > 0 ? [17, 18] : [-18, -17]
    for (const [xa, xb] of [[197, 211], [211, 225]]) {
      api.box(xa, 0, zw[0], xb, 47, zw[1], M.wall, 'replace', `唱诗班/拱廊墙${side}${xa}`)
      api.box(xa, 0, zw[0], xb, Y_SPRING - 1, zw[1], 'air', 'replace', `唱诗班/券脚${side}${xa}`)
      carveArch(api, Math.round((xa + xb) / 2), zw[0], zw[1], `唱诗班/券${side}${xa}`)
    }
    api.box(X1, 44, zw[0], X2, 45, zw[1], M.trim, 'replace', `唱诗班/束带${side}`)
  }

  // =============================================================== 2. 唱诗班柱网
  for (const px of PIERS) {
    for (const z of [AXIS.Z_NAVE_PIER, -AXIS.Z_NAVE_PIER]) bundlePier(api, px, z, 42)
    for (const z of [AXIS.Z_AISLE_INNER, -AXIS.Z_AISLE_INNER, AXIS.Z_AISLE_OUTER, -AXIS.Z_AISLE_OUTER]) bundlePier(api, px, z, 36)
  }

  // =============================================================== 3. 外侧墙 + 圣坛大窗
  for (const s of [1, -1]) {
    const side = s > 0 ? 'S' : 'N'
    const wo = s > 0 ? [OUTER_WALL_Z, OUTER_WALL_Z + 3] : [-OUTER_WALL_Z - 3, -OUTER_WALL_Z]
    api.box(X1, 0, wo[0], X2, 47, wo[1], M.wall, 'replace', `唱诗班/外墙${side}`)
    api.box(X1, 0, wo[0] - 1, X2, 2, wo[1] + 1, M.trim, 'replace', `唱诗班/墙脚${side}`)
    api.box(X1, 45, wo[0] - 1, X2, 47, wo[1] + 1, M.trim, 'replace', `唱诗班/压顶${side}`)
    // 两个 11 格宽的尖券彩窗（圣坛：金白浅蓝）
    for (const cx of [204, 218]) {
      const a = cx - 5, b = cx + 5
      api.box(a, 12, wo[0], b, 30, wo[1], 'air', 'replace', `唱诗班/窗洞${side}${cx}`)
      const hwAt = (y) => Math.max(0, Math.round(5 * Math.pow(1 - (y - 31) / 9, 0.62) * 2) / 2)
      let s0 = 31, prev = hwAt(31)
      for (let y = 32; y <= 40; y++) {
        const hv = y <= 39 ? hwAt(y) : null
        if (hv !== prev) {
          api.box(cx - Math.round(prev), s0, wo[0], cx + Math.round(prev), y - 1, wo[1], 'air', 'replace', `唱诗班/窗券${side}${cx}`)
          s0 = y; prev = hv
        }
      }
      api.box(a, 12, wo[0], b, 19, wo[1], 'yellow_stained_glass', 'replace', `唱诗班/玻下${side}${cx}`)
      api.box(a, 20, wo[0], b, 25, wo[1], 'white_stained_glass', 'replace', `唱诗班/玻中${side}${cx}`)
      api.box(a, 26, wo[0], b, 30, wo[1], 'light_blue_stained_glass', 'replace', `唱诗班/玻上${side}${cx}`)
      api.box(cx, 12, wo[0], cx, 30, wo[1], M.mullion, 'replace', `唱诗班/中梃${side}${cx}`)
      api.box(a, 21, wo[0], b, 21, wo[1], M.mullion, 'replace', `唱诗班/横档${side}${cx}`)
    }
  }

  // =============================================================== 4. 唱诗班高窗（金白浅蓝）
  for (const s of [1, -1]) {
    const zi = s > 0 ? 14 : -18
    const zo = s > 0 ? 18 : -14
    const c = clerestory(api, { x1: X1 + 2, x2: X2 - 2, zIn: zi, zOut: zo, style: ['yellow_stained_glass', 'white_stained_glass', 'light_blue_stained_glass'], tag: `唱诗班/高窗${s > 0 ? 'S' : 'N'}` })
    // 开间对齐柱线：197-211 与 211-225，各取中间 11 格
    c.eachBay(199, 209)
    c.eachBay(213, 223)
  }

  // =============================================================== 5. 肋拱 + 屋面
  ribVault(api, { x1: X1, x2: X2, pierLines: PIERS, tag: '唱诗班/拱顶' })
  gableRoof(api, { x1: X1, x2: X2, pierLines: PIERS, tag: '唱诗班/屋面' })

  // =============================================================== 6. 主祭坛
  buildAltar(api)

  return api.ops
}

/**
 * 主祭坛。building.md 原稿为 x=216..224, z=-7..7；实测发现该位置正压在
 * PHASE 3 东侧地宫梯井（x=221..238, z=±5）的出口上，会把楼梯封死。
 * 故整体西移 8 格到 x=206..218，仍在唱诗班（190..231）内、仍在中轴上。
 */
export function buildAltar(api, tag = '祭坛') {
  api.box(206, 1, -10, 218, 3, 10, M.altarTrim, 'replace', `${tag}/平台`)
  api.box(208, 4, -8, 216, 4, 8, M.altarTrim, 'replace', `${tag}/台面`)
  api.box(203, 1, -8, 205, 1, 8, M.altarTrim, 'replace', `${tag}/台阶1`)
  api.box(204, 2, -8, 205, 2, 8, M.altarTrim, 'replace', `${tag}/台阶2`)
  api.box(205, 3, -8, 205, 3, 8, M.altarTrim, 'replace', `${tag}/台阶3`)
  api.box(210, 5, -3, 214, 5, 3, M.altar, 'replace', `${tag}/祭台`)
  api.box(209, 5, -4, 215, 6, 4, M.altarTrim, 'replace', `${tag}/祭台座`)
  api.box(217, 4, -6, 218, 14, 6, M.screen, 'replace', `${tag}/高背屏`)
  api.box(218, 15, -6, 218, 16, 6, M.trim, 'replace', `${tag}/屏顶`)
  api.box(212, 7, 0, 212, 14, 0, M.gold, 'replace', `${tag}/十字架竖`)
  api.box(209, 11, 0, 215, 11, 0, M.gold, 'replace', `${tag}/十字架横`)
  for (const z of [-5, 0, 5]) {
    api.box(212, 16, z, 212, 16, z, 'iron_chain', 'replace', `${tag}/链${z}`)
    api.box(212, 15, z, 212, 15, z, 'lantern', 'replace', `${tag}/烛台${z}`)
  }
}
