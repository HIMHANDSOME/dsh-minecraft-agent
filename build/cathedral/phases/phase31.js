/**
 * PHASE 31 —— 修复（一）：主门、塔梯拐弯、地宫入口
 *
 * 用户实测反馈三处：
 *   1. 正门主门不能直接走 —— 实测：西立面中门前有 PHASE 2 的"教堂/西缘压顶"
 *      （x=-8..-2, y=0..3, z=-66..66 的 4 格高墙）挡在门前，且门中央有一根
 *      x=-1..5、y=1..20 的门柱把门洞劈成两半。修法：掏通门前通道（加三级台阶），
 *      拆掉门柱，并加三重同心尖券 + 门框 + 门楣，提升华丽度。
 *   2. 塔内回折楼梯拐弯是直角 —— 实测：每段 18 级、z 错 2 格，拐弯处是 90° 直角
 *      且无平台。修法：在每段拐弯处加 6×5 的平台，把直角拐弯变成带平台的回头弯。
 *   3. 地宫西入口与中殿长椅重叠 —— 实测：地宫西梯井 x=81..98、z=±5 穿过
 *      x=78/83/88/93/98 的长椅。修法：清掉井口周边长椅，加一圈石栏与入口台阶，
 *      使入口成为明确的"忏悔室式"下沉入口。
 */
import { createPlan, AXIS } from '../layout.js'
import { TX } from '../tower.js'

const M = {
  wall: 'stone_bricks',
  trim: 'polished_deepslate',
  accent: 'polished_andesite',
  calcite: 'calcite',
  fence: 'dark_oak_fence',
}

export function build({ site }) {
  const api = createPlan(31)

  // =============================================================== 1. 主门
  // 1a. 掏通门前通道（清掉挡门的西缘压顶），z=-8..8
  api.box(-8, 1, -8, -1, 3, 8, 'air', 'replace', '主门/清通道')
  // 1b. 门前平层通道（清掉压顶后，广场 y=0 与门内地面 y=0 同高，铺门槛石收边）
  api.box(-3, 0, -9, -1, 0, 9, M.trim, 'replace', '主门/门槛')
  // 1c. 拆掉中央门柱（z=0）
  api.box(-1, 1, 0, 5, 20, 0, 'air', 'replace', '主门/拆门柱')
  // 1d. 门洞重新修整：确保 y=1..27 全净空
  api.box(-1, 1, -8, 5, 27, 8, 'air', 'replace', '主门/门洞')
  // 1e. 门框（两侧门垛）
  api.box(-1, 0, -9, 5, 27, -8, M.wall, 'replace', '主门/北门垛')
  api.box(-1, 0, 8, 5, 27, 9, M.wall, 'replace', '主门/南门垛')
  // 1f. 三重同心尖券（逐层内收）
  for (let order = 0; order < 3; order++) {
    const r0 = 9 + order * 1
    const y0 = 27 - order * 2
    const hwAt = (y) => Math.max(0, Math.round(r0 * Math.pow(1 - (y - y0) / 12, 0.62) * 2) / 2)
    let s = y0, prev = hwAt(y0)
    for (let y = y0 + 1; y <= y0 + 13; y++) {
      const hv = hwAt(y)
      if (hv !== prev) {
        const w = Math.round(prev)
        if (w >= 0) api.box(-1 - order, s, -w, 5 + order, y - 1, w, order === 1 ? M.calcite : M.trim, 'replace', `主门/券${order}`)
        s = y; prev = hv
      }
    }
  }
  // 1g. 门楣 + 山花（tympanum）
  api.box(-2, 28, -9, 6, 29, 9, M.trim, 'replace', '主门/门楣')
  api.box(-3, 30, -6, 7, 31, 6, M.accent, 'replace', '主门/山花')
  api.box(-3, 32, -2, 7, 33, 2, M.calcite, 'replace', '主门/山花顶')

  // =============================================================== 2. 塔内楼梯拐弯平台
  for (const zc of [AXIS.TOWER_Z, -AXIS.TOWER_Z]) {
    const tag = `塔${zc > 0 ? 'S' : 'N'}`
    for (let f = 0; f < 6; f++) {
      const z = zc - 8 + f * 2
      const yEnd = f * 18 + 17
      const dir = f % 2 === 0 ? 1 : -1
      const x1 = dir > 0 ? 18 : 3
      const x2 = dir > 0 ? 23 : 8
      // 拐弯平台（6×5），桥接 z 方向的 2 格错位，把直角拐弯变成带平台的回头弯
      api.box(x1, yEnd, z - 1, x2, yEnd, z + 3, M.wall, 'replace', `${tag}/拐弯平台${f}`)
    }
  }

  // =============================================================== 3. 地宫西入口 vs 长椅
  // 3a. 清掉井口周边长椅（x=77..99，z=-12..12，y=1..2）
  api.box(77, 1, -12, 99, 2, 12, 'air', 'replace', '地宫入口/清长椅')
  // 3b. 井口石栏（南北两侧 z=±6，东西留出入口）
  api.box(80, 1, -6, 98, 3, -6, M.wall, 'replace', '地宫入口/北栏')
  api.box(80, 1, 6, 98, 3, 6, M.wall, 'replace', '地宫入口/南栏')
  api.box(80, 1, -6, 80, 3, -2, M.wall, 'replace', '地宫入口/西栏N')
  api.box(80, 1, 2, 80, 3, 6, M.wall, 'replace', '地宫入口/西栏S')
  // 3c. 西侧入口台阶（从 z=-1..1 下到井口）
  api.box(79, 0, -1, 79, 0, 1, M.trim, 'replace', '地宫入口/阶')
  api.box(78, 0, -1, 78, 0, 1, M.trim, 'replace', '地宫入口/阶2')
  // 3d. 井口两盏灯笼
  for (const z of [-5, 5]) {
    api.box(80, 4, z, 80, 4, z, 'iron_chain', 'replace', '地宫入口/链')
    api.box(80, 3, z, 80, 3, z, 'lantern', 'replace', '地宫入口/灯')
  }

  return api.ops
}
