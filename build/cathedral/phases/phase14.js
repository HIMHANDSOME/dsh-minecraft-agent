/**
 * PHASE 14 —— 七座可进入的放射礼拜堂
 *
 * building.md §1.1 E 区 / §2：七座可进入的放射礼拜堂（北三、中央一、南三）；
 * 彩窗分区：北侧深蓝/蓝紫/紫白，中央金白蓝，南侧红紫/深红/金红；
 * 所有彩窗要有石窗格与尖券轮廓，不能只是矩形彩色玻璃。
 *
 * 位置见 eastend.js：θ = -90,-60,-30,0,30,60,90（绕中心 C=(232,0)、半径 30）。
 * 每座：9×9 外包、墙厚 2、高 26；朝殿内一侧开 5×13 通道口接通环廊；
 * 朝外一侧开 5×13 尖券彩窗（带石中梃与横档、券顶）；上部阶梯攒尖小屋顶。
 */
import { createPlan } from '../layout.js'
import { CHAPELS, inwardAxis, WALL_T } from '../eastend.js'

const M = {
  wall: 'stone_bricks',
  floor: 'polished_andesite',
  trim: 'polished_deepslate',
  mullion: 'polished_andesite',
  roof: 'deepslate_tiles',
}

const H_WALL = 26

export function build({ site }) {
  const api = createPlan(14)

  for (const ch of CHAPELS) {
    const { x: cx, z: cz, glass, tag } = ch
    const ax = inwardAxis(ch)

    // 墙身 → 内部掏空（墙厚 2）
    api.box(cx - 4, 0, cz - 4, cx + 4, H_WALL, cz + 4, M.wall, 'replace', `${tag}/墙身`)
    api.box(cx - 3, 1, cz - 3, cx + 3, H_WALL - 1, cz + 3, 'air', 'replace', `${tag}/内部`)
    api.box(cx - 3, 0, cz - 3, cx + 3, 0, cz + 3, M.floor, 'replace', `${tag}/地坪`)

    // 朝殿内：通道口（穿透 9 格，接到后殿环廊）
    const IN = 9
    if (ax.axis === 'x') {
      const xa = ax.sign < 0 ? cx - 4 - IN : cx + 3
      const xb = ax.sign < 0 ? cx - 3 : cx + 4 + IN
      api.box(xa, 1, cz - 2, xb, 13, cz + 2, 'air', 'replace', `${tag}/通道`)
    } else {
      const za = ax.sign < 0 ? cz - 4 - IN : cz + 3
      const zb = ax.sign < 0 ? cz - 3 : cz + 4 + IN
      api.box(cx - 2, 1, za, cx + 2, 13, zb, 'air', 'replace', `${tag}/通道`)
    }

    // 朝外：尖券彩窗（贯穿整面墙厚 = WALL_T）
    const outSign = -ax.sign
    if (ax.axis === 'x') {
      const xa = outSign > 0 ? cx + 4 - WALL_T + 1 : cx - 4
      const xb = outSign > 0 ? cx + 4 : cx - 4 + WALL_T - 1
      api.box(xa, 10, cz - 2, xb, 13, cz + 2, glass[0], 'replace', `${tag}/玻下`)
      api.box(xa, 14, cz - 2, xb, 16, cz + 2, glass[1], 'replace', `${tag}/玻中`)
      api.box(xa, 17, cz - 2, xb, 22, cz + 2, glass[2], 'replace', `${tag}/玻上`)
      api.box(xb, 10, cz, xb, 22, cz, M.mullion, 'replace', `${tag}/中梃`)
      api.box(xa, 14, cz - 2, xb, 14, cz + 2, M.mullion, 'replace', `${tag}/横档`)
      api.box(xa - 1, 23, cz - 3, xb + 1, 24, cz + 3, M.trim, 'replace', `${tag}/券顶`)
    } else {
      const za = outSign > 0 ? cz + 4 - WALL_T + 1 : cz - 4
      const zb = outSign > 0 ? cz + 4 : cz - 4 + WALL_T - 1
      api.box(cx - 2, 10, za, cx + 2, 13, zb, glass[0], 'replace', `${tag}/玻下`)
      api.box(cx - 2, 14, za, cx + 2, 16, zb, glass[1], 'replace', `${tag}/玻中`)
      api.box(cx - 2, 17, za, cx + 2, 22, zb, glass[2], 'replace', `${tag}/玻上`)
      api.box(cx, 10, zb, cx, 22, zb, M.mullion, 'replace', `${tag}/中梃`)
      api.box(cx - 2, 14, za, cx + 2, 14, zb, M.mullion, 'replace', `${tag}/横档`)
      api.box(cx - 3, 23, za - 1, cx + 3, 24, zb + 1, M.trim, 'replace', `${tag}/券顶`)
    }

    // 阶梯攒尖小屋顶
    api.box(cx - 4, H_WALL + 1, cz - 4, cx + 4, H_WALL + 1, cz + 4, M.roof, 'replace', `${tag}/屋面1`)
    api.box(cx - 3, H_WALL + 2, cz - 3, cx + 3, H_WALL + 3, cz + 3, M.roof, 'replace', `${tag}/屋面2`)
    api.box(cx - 2, H_WALL + 4, cz - 2, cx + 2, H_WALL + 4, cz + 2, M.roof, 'replace', `${tag}/屋面3`)
    api.box(cx - 1, H_WALL + 5, cz - 1, cx + 1, H_WALL + 5, cz + 1, M.roof, 'replace', `${tag}/屋面4`)
    api.box(cx, H_WALL + 6, cz, cx, H_WALL + 6, cz, M.trim, 'replace', `${tag}/尖顶`)
  }

  return api.ops
}
