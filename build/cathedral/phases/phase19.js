/**
 * PHASE 19 —— 室内细化（二）：长椅、忏悔室、圣器室、隐蔽照明
 *
 * building.md §2：另配忏悔室、圣器室、唱诗班席、长椅和维修通道；
 * 金属与照明用 iron_bars / chains / lantern / 少量 soul_lantern，
 * **避免大量裸露萤石和火把**；§4：西门到祭坛无遮挡、无破坏氛围的裸露光源。
 *
 * 内容：
 *   1. 中殿长椅（南北两列，中央走道 z=-1..1 保持畅通）
 *   2. 忏悔室沿内侧廊南北各 4 间（暗橡木 + 铁栅窗）
 *   3. 圣器室（唱诗班北侧外挂小室，含门、桌、箱、书架）
 *   4. 隐蔽照明：链吊灯笼，分布在中殿拱顶下、侧廊、地宫、唱诗班、耳堂、后殿、塔内
 */
import { createPlan, AXIS } from '../layout.js'
import { C as EC } from '../eastend.js'
import { TX } from '../tower.js'

const M = {
  wood: 'dark_oak_planks',
  slab: 'dark_oak_slab',
  beam: 'dark_oak_log',
  wall: 'stone_bricks',
  trim: 'polished_deepslate',
  roof: 'deepslate_tiles',
  grille: 'iron_bars',
}

/** 链吊灯笼：chain 在上、lantern 在下（隐蔽光源，不用萤石/火把） */
function lantern(api, x, y, z, tag) {
  api.box(x, y, z, x, y, z, 'iron_chain', 'replace', `${tag}/链`)
  api.box(x, y - 1, z, x, y - 1, z, 'lantern', 'replace', `${tag}/灯`)
}

export function build({ site }) {
  const api = createPlan(19)

  // =============================================================== 1. 中殿长椅
  for (let x = 48; x <= 148; x += 5) {
    for (const s of [1, -1]) {
      const za = s > 0 ? 2 : -12
      const zb = s > 0 ? 12 : -2
      api.box(x, 1, za, x, 1, zb, M.slab, 'replace', '长椅/座')
      api.box(x - 1, 2, za, x - 1, 2, zb, M.wood, 'replace', '长椅/靠背')
    }
  }
  // 中央走道地坪纹（保持畅通的视觉提示）
  api.box(46, 0, -1, 152, 0, 1, 'polished_andesite', 'replace', '长椅/中央走道')

  // =============================================================== 2. 忏悔室（南北内侧廊各 4 间）
  for (const s of [1, -1]) {
    const zc = s * 26
    for (const x of [57, 85, 113, 141]) {
      api.box(x - 1, 0, zc - 1, x + 1, 4, zc + 1, M.wood, 'replace', '忏悔室/柜体')
      api.box(x, 1, zc, x, 3, zc, 'air', 'replace', '忏悔室/内室')
      api.box(x, 1, zc + s, x, 3, zc + s, M.grille, 'replace', '忏悔室/铁栅')
      api.box(x - 1, 4, zc - 1, x + 1, 4, zc + 1, M.trim, 'replace', '忏悔室/顶')
    }
  }

  // =============================================================== 3. 圣器室（唱诗班北侧外挂）
  api.box(196, 0, -62, 210, 5, -54, M.wall, 'replace', '圣器室/墙身')
  api.box(197, 1, -61, 209, 4, -55, 'air', 'replace', '圣器室/内部')
  api.box(201, 1, -53, 203, 3, -54, 'air', 'replace', '圣器室/门洞')
  api.box(196, 0, -63, 210, 1, -63, M.trim, 'replace', '圣器室/北墙脚')
  api.box(196, 6, -62, 210, 6, -54, M.roof, 'replace', '圣器室/屋面')
  api.box(198, 1, -60, 208, 1, -58, M.wood, 'replace', '圣器室/长桌')
  api.box(198, 2, -60, 198, 2, -58, M.beam, 'replace', '圣器室/桌腿')
  api.box(207, 1, -60, 208, 1, -59, 'chest', 'replace', '圣器室/箱')
  api.box(198, 1, -56, 200, 2, -56, 'bookshelf', 'replace', '圣器室/书架')

  // =============================================================== 4. 隐蔽照明（链吊灯笼）
  const L = []
  // 中殿拱顶下（柱线上，吊在脊肋下方）
  for (const x of [57, 85, 113, 141]) L.push([x, 66, 0, '中殿'])
  // 侧廊（内廊拱腹下）
  for (const x of [57, 85, 113, 141]) { L.push([x, 34, 24, '侧廊']); L.push([x, 34, -24, '侧廊']) }
  // 地宫
  for (const x of [99, 141, 183, 225]) L.push([x, -5, 0, '地宫'])
  // 唱诗班
  for (const x of [204, 218]) L.push([x, 66, 0, '唱诗班'])
  // 耳堂
  for (const z of [-40, 40]) L.push([172, 58, z, '耳堂'])
  // 后殿环廊
  L.push([EC.x + 20, 30, 8, '后殿'])
  L.push([EC.x + 20, 30, -8, '后殿'])
  // 塔内楼梯间
  for (const zc of [AXIS.TOWER_Z, -AXIS.TOWER_Z]) { L.push([TX - 8, 40, zc, '塔内']); L.push([TX - 8, 100, zc, '塔内']) }
  // 西门内（前厅）—— 必须偏离中轴，否则挡住"西门→祭坛"的中央通视
  L.push([14, 10, 6, '前厅'])
  L.push([14, 10, -6, '前厅'])
  for (const [x, y, z, tag] of L) lantern(api, x, y, z, `照明/${tag}`)

  return api.ops
}
