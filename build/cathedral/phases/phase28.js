/**
 * PHASE 28 —— 收尾（一）：克制老化
 *
 * building.md §2：墙体老化与阴影用少量 cracked_stone_bricks / mossy_stone_bricks；
 * 大面积石墙参考比例 55% 石砖 / 15% 安山岩 / 10% 磨制安山岩 / 8% 凝灰岩砖 /
 * 5% 裂纹石砖 / 3% 方解石 / 2% 苔石砖 / 2% 其他——**仅用于墙面视觉分布**，
 * 柱、拱肋、窗框和承重点必须有固定结构规律，不可随机噪声化。
 * §4：无超过 9×9 的空白大墙与破坏氛围的裸露光源。
 *
 * 做法：只在外墙"外皮"上按**固定周期**点少量苔石/裂纹石砖补丁，
 * 一律避开柱、拱肋、窗框、窗台与承重点；不用随机数，保证可复现、可审计。
 */
import { createPlan, AXIS } from '../layout.js'

const M = { mossy: 'mossy_stone_bricks', cracked: 'cracked_stone_bricks', tuff: 'tuff_bricks' }

export function build({ site }) {
  const api = createPlan(28)

  // =============================================================== 1. 外侧廊外墙外皮（z=±53 / ±50）
  for (let i = 0; i < 8; i++) {
    const x = 47 + i * 14
    const y = 6 + (i % 3) * 9
    api.box(x, y, 53, x + 2, y + 1, 53, M.mossy, 'replace', '老化/外墙S')
    api.box(x + 3, y, -53, x + 5, y + 1, -53, M.mossy, 'replace', '老化/外墙N')
    api.box(x, y + 4, 53, x, y + 5, 53, M.cracked, 'replace', '老化/外墙S裂')
    api.box(x + 3, y + 4, -53, x + 3, y + 5, -53, M.cracked, 'replace', '老化/外墙N裂')
  }

  // =============================================================== 2. 后殿外墙外皮（沿折线外侧顶点）
  const OUTER_DIRS = [-90, -60, -30, 0, 30, 60, 90]
  for (let i = 0; i < OUTER_DIRS.length; i++) {
    const a = (OUTER_DIRS[i] * Math.PI) / 180
    const x = Math.round(232 + (26 + 1) * Math.cos(a))
    const z = Math.round(0 + (26 + 1) * Math.sin(a))
    api.box(x, 8, z, x, 9, z, M.mossy, 'replace', '老化/后殿')
    api.box(x, 22, z, x, 22, z, M.cracked, 'replace', '老化/后殿裂')
  }

  // =============================================================== 3. 双塔外皮（塔身四角之间，避开角扶壁）
  for (const zc of [AXIS.TOWER_Z, -AXIS.TOWER_Z]) {
    for (const y of [12, 38, 62, 78]) {
      api.box(0, y, zc - 4, 0, y + 2, zc + 4, M.mossy, 'replace', '老化/塔W')
      api.box(26, y + 6, zc - 4, 26, y + 8, zc + 4, M.cracked, 'replace', '老化/塔E')
    }
  }

  // =============================================================== 4. 台地挡土墙外皮（东/南/北缘）
  for (let x = 0; x <= 260; x += 26) {
    api.box(x, -6, 62, x + 6, -4, 62, M.mossy, 'replace', '老化/挡土墙S')
    api.box(x, -14, -62, x + 6, -12, -62, M.mossy, 'replace', '老化/挡土墙N')
  }
  for (let z = -50; z <= 50; z += 26) {
    api.box(278, -8, z, 278, -6, z + 6, M.cracked, 'replace', '老化/挡土墙E')
  }

  // =============================================================== 5. 地宫（潮湿，苔石更多但克制）
  for (const x of [95, 125, 155, 185, 215]) {
    api.box(x, -12, -28, x + 3, -11, -28, M.mossy, 'replace', '老化/地宫N')
    api.box(x, -12, 28, x + 3, -11, 28, M.mossy, 'replace', '老化/地宫S')
  }

  // =============================================================== 6. 耳堂/唱诗班外皮
  for (const x of [160, 172, 184]) {
    api.box(x, 6, -79, x + 2, 8, -79, M.mossy, 'replace', '老化/耳堂N')
    api.box(x, 6, 79, x + 2, 8, 79, M.mossy, 'replace', '老化/耳堂S')
  }
  for (const x of [196, 214]) {
    api.box(x, 8, 53, x + 3, 10, 53, M.tuff, 'replace', '老化/唱诗班S')
    api.box(x, 8, -53, x + 3, 10, -53, M.tuff, 'replace', '老化/唱诗班N')
  }

  return api.ops
}
