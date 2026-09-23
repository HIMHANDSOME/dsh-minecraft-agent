/**
 * PHASE 32 —— 修复（二）：主体屋顶闭合
 *
 * 用户实测反馈：教堂主体屋顶没有闭合。
 * 实测：中殿/唱诗班的主坡屋面只盖到 z=±19，侧廊（z=19..52）上方直接露天；
 * 高窗墙（z=±14..18）只到 y=62，与屋面之间也有缝隙；坡屋面两端是开口三角。
 *
 * 修法（对中殿 x=43..155 与唱诗班 x=190..231 各做一遍）：
 *   1. 侧廊坡顶：从 z=±19(y=70) 单坡斜到 z=±52(y=47，落到外墙顶)；
 *   2. 高窗上沿封口：z=±14..18 从 y=63 补到屋脊高度（贴合坡面）；
 *   3. 屋面两端山墙：把 x 两端开口三角封上。
 */
import { createPlan } from '../layout.js'

const M = { roof: 'deepslate_tiles', wall: 'stone_bricks', trim: 'polished_deepslate' }

const Z_IN = 19, Z_OUT = 52, Y_IN = 70, Y_OUT = 47

/** 侧廊单坡屋面高度 */
const rh = (z) => Math.round(Y_IN - (Y_IN - Y_OUT) * (z - Z_IN) / (Z_OUT - Z_IN))

/** 为 x1..x2 这一段的南/北侧廊闭合屋顶 */
function closeAisles(api, x1, x2, tag) {
  for (const s of [1, -1]) {
    const side = s > 0 ? 'S' : 'N'
    // 1. 侧廊坡顶（沿 z 合并）
    let rs = Z_IN, prev = rh(Z_IN)
    for (let z = Z_IN + 1; z <= Z_OUT + 1; z++) {
      const hv = z <= Z_OUT ? rh(z) : null
      if (hv !== prev) {
        const za = Math.min(rs, z - 1), zb = Math.max(rs, z - 1)
        api.box(x1, prev, s * za, x2, prev + 1, s * zb, M.roof, 'replace', `${tag}/侧廊坡${side}`)
        rs = z; prev = hv
      }
    }
    // 2. 屋面两端山墙（x1 与 x2），沿 z 合并
    for (const ex of [x1, x2]) {
      let es = Z_IN, ep = rh(Z_IN)
      for (let z = Z_IN + 1; z <= Z_OUT + 1; z++) {
        const hv = z <= Z_OUT ? rh(z) : null
        if (hv !== ep) {
          api.box(ex, Y_OUT, s * Math.min(es, z - 1), ex, ep, s * Math.max(es, z - 1), M.wall, 'replace', `${tag}/山墙${side}${ex}`)
          es = z; ep = hv
        }
      }
    }
  }
  // 3. 高窗上沿封口（z=±14..18 补到屋脊，贴合原有主坡面）
  for (const s of [1, -1]) {
    const side = s > 0 ? 'S' : 'N'
    for (let z = 14; z <= 18; z++) {
      const gy = Math.round(86 - 16 * z / 19)      // 中殿主坡在 z 处的高度
      const zz = s * z
      api.box(x1, 63, zz, x2, gy, zz, M.wall, 'replace', `${tag}/高窗封口${side}${z}`)
    }
  }
  // 4. 主坡屋面两端山墙（中殿主坡 z=-19..19 在 x1/x2 的三角）
  for (const ex of [x1, x2]) {
    for (let z = 0; z <= 19; z++) {
      const gy = Math.round(86 - 16 * z / 19)
      api.box(ex, 70, z, ex, gy, z, M.wall, 'replace', `${tag}/主坡山墙${z}`)
      api.box(ex, 70, -z, ex, gy, -z, M.wall, 'replace', `${tag}/主坡山墙n${z}`)
    }
  }
  return api
}

export function build({ site }) {
  const api = createPlan(32)
  closeAisles(api, 43, 155, '中殿')
  closeAisles(api, 190, 231, '唱诗班')
  return api.ops
}
