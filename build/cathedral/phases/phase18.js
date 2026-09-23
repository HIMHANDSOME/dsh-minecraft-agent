/**
 * PHASE 18 —— 室内细化（一）：管风琴平台 + 塔内实体楼梯
 *
 * building.md §2：西端中殿上方约 x=28..41, y=23..40 建**可到达**的管风琴平台：
 * 琴柜、不同长度管道、键盘台、栏杆和风箱。
 * §4 验收：塔楼、屋顶楼梯全部连通。
 *
 * 另建：两塔内部的实体回折楼梯（y=0 → 116 观察层），并把塔内楼板中部掏空
 * 让楼梯通过（保留一圈 2 格宽环形挑台）。
 */
import { createPlan, AXIS } from '../layout.js'
import { TX, HALF } from '../tower.js'

const M = {
  platform: 'polished_deepslate',
  beam: 'stripped_dark_oak_log',
  wood: 'dark_oak_planks',
  darkWood: 'dark_oak_log',
  pipes: 'iron_bars',
  pipes2: 'polished_deepslate',
  fence: 'dark_oak_fence',
  wall: 'stone_bricks',
  trim: 'polished_deepslate',
}

const PLAT = { x1: 28, x2: 41, z1: -14, z2: 14, y: 23 }
const STAIR_Z_END = 9      // 入口楼梯到达的 z（y=23）

export function build({ site }) {
  const api = createPlan(18)

  // =============================================================== 一、管风琴平台
  for (const [cx, cz] of [[30, -12], [30, 12], [39, -12], [39, 12]]) {
    api.box(cx - 1, 0, cz - 1, cx + 1, PLAT.y - 1, cz + 1, M.wall, 'replace', '管风琴/支柱')
    api.box(cx - 2, 0, cz - 2, cx + 2, 1, cz + 2, M.trim, 'replace', '管风琴/柱础')
    api.box(cx - 2, PLAT.y - 2, cz - 2, cx + 2, PLAT.y - 1, cz + 2, M.trim, 'replace', '管风琴/柱头')
  }
  // 平台板（x=28..30, z<=10 为楼梯井）
  api.box(PLAT.x1, PLAT.y, PLAT.z1, PLAT.x2, PLAT.y, PLAT.z2, M.platform, 'replace', '管风琴/平台')
  api.box(PLAT.x1, PLAT.y, PLAT.z1, PLAT.x1 + 2, PLAT.y, 10, 'air', 'replace', '管风琴/楼梯井')
  // 栏杆
  api.box(PLAT.x2, PLAT.y + 1, PLAT.z1, PLAT.x2, PLAT.y + 2, PLAT.z2, M.fence, 'replace', '管风琴/东栏杆')
  api.box(PLAT.x1 + 3, PLAT.y + 1, PLAT.z1, PLAT.x2 - 1, PLAT.y + 2, PLAT.z1, M.fence, 'replace', '管风琴/北栏杆')
  api.box(PLAT.x1 + 3, PLAT.y + 1, PLAT.z2, PLAT.x2 - 1, PLAT.y + 2, PLAT.z2, M.fence, 'replace', '管风琴/南栏杆')

  // 入口楼梯：x=28..30，z=-14(y=0) → z=9(y=23)
  for (let k = 0; k <= 23; k++) {
    const z = -14 + k
    api.box(28, 0, z, 30, k, z, M.platform, 'replace', '管风琴/楼梯')
  }

  // 琴柜（靠西北，避开楼梯出口 z=9）
  api.box(28, PLAT.y + 1, -10, 32, 40, 1, M.wood, 'replace', '管风琴/琴柜')
  api.box(29, PLAT.y + 2, -8, 31, 38, 0, 'air', 'replace', '管风琴/琴柜内')
  for (let i = 0; i < 5; i++) {
    const z = -8 + i * 2   // 必须落在琴柜内腔 z=-8..0 之内，否则音管埋进柜壁
    const h = 5 + ((2 - Math.abs(i - 2)) * 4)   // 5,9,13,9,5
    const blk = i % 2 === 0 ? M.pipes : M.pipes2
    api.box(30, PLAT.y + 2, z, 30, PLAT.y + 1 + h, z, blk, 'replace', '管风琴/音管')
    api.box(29, PLAT.y + 1 + h, z, 29, PLAT.y + 1 + h, z, M.trim, 'replace', '管风琴/管口')
  }
  api.box(27, 41, -11, 33, 41, 2, M.trim, 'replace', '管风琴/柜檐')

  // 键盘台（平台中部偏南，与琴柜分开）
  api.box(34, PLAT.y + 1, 3, 38, PLAT.y + 1, 8, M.darkWood, 'replace', '管风琴/键盘台')
  api.box(34, PLAT.y + 2, 4, 37, PLAT.y + 2, 7, M.wood, 'replace', '管风琴/键盘')
  api.box(38, PLAT.y + 1, 2, 38, PLAT.y + 3, 9, M.darkWood, 'replace', '管风琴/谱架')
  // 风箱（南北两侧）
  for (const zz of [-12, 12]) {
    api.box(34, PLAT.y + 1, zz - 2, 39, PLAT.y + 3, zz + 2, M.darkWood, 'replace', '管风琴/风箱')
    api.box(35, PLAT.y + 2, zz - 1, 38, PLAT.y + 2, zz + 1, M.beam, 'replace', '管风琴/风箱带')
  }

  // =============================================================== 二、塔内实体楼梯
  const FLOORS = [60, 95, 113, 114]
  for (const zc of [AXIS.TOWER_Z, -AXIS.TOWER_Z]) {
    const tag = `塔${zc > 0 ? 'S' : 'N'}`
    for (const y of FLOORS) {
      api.box(TX - 9, y, zc - 9, TX + 9, y, zc + 9, 'air', 'replace', `${tag}/楼板开口${y}`)
    }
    // 顶部观察层（y=116）：先铺板、再在楼梯到达处开槽（必须在楼梯之前，
    // 否则会把梯顶踏步覆盖掉）
    api.box(TX - 9, 116, zc - 9, TX + 9, 116, zc + 9, M.trim, 'replace', `${tag}/观察层`)
    api.box(4, 116, zc + 4, 12, 116, zc + 5, 'air', 'replace', `${tag}/观察层梯口`)
    // 回折楼梯：每段 18 级，沿 x 来回，逐段在 z 上错开 2 格
    for (let f = 0; f < 7; f++) {
      const z = zc - 8 + f * 2
      const dir = f % 2 === 0 ? 1 : -1
      for (let k = 0; k < 18; k++) {
        const x = dir > 0 ? 4 + k : 22 - k
        const y = f * 18 + k
        if (y > 116) break
        api.box(x, y, z, x, y, z + 1, M.wall, 'replace', `${tag}/塔梯踏步`)
        if (k % 6 === 0 && y >= 6) api.box(x, y - 5, z, x, y - 1, z + 1, M.wall, 'replace', `${tag}/塔梯支柱`)
      }
    }
    // 观察层周边栏板
    api.box(TX - 9, 117, zc - 9, TX + 9, 117, zc - 9, M.fence, 'replace', `${tag}/观察层栏N`)
    api.box(TX - 9, 117, zc + 9, TX + 9, 117, zc + 9, M.fence, 'replace', `${tag}/观察层栏S`)
    api.box(TX - 9, 117, zc - 9, TX - 9, 117, zc + 9, M.fence, 'replace', `${tag}/观察层栏W`)
    api.box(TX + 9, 117, zc - 9, TX + 9, 117, zc + 9, M.fence, 'replace', `${tag}/观察层栏E`)
  }

  return api.ops
}
