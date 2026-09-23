/**
 * PHASE 26 —— 外围（三）：南主教宫
 *
 * building.md §2：南主教宫含庭院、接待厅、小礼拜堂和花园。
 * 实测地形：该区地表世界 y 58..170，平台取 **世界 y=106**（rel y=-16）。
 *
 * 布局（rel）：方形宫院，内院居中；西侧接待厅（大厅）、东侧小礼拜堂（带尖塔）、
 * 北侧居所、南侧花园（绿篱 + 甬路 + 水池）。
 */
import { createPlan } from '../layout.js'

const M = {
  stone: 'stone',
  wall: 'stone_bricks',
  trim: 'polished_deepslate',
  floor: 'polished_andesite',
  path: 'smooth_stone',
  roof: 'deepslate_tiles',
  wood: 'dark_oak_planks',
  beam: 'dark_oak_log',
  grass: 'grass_block',
  glass: 'gray_stained_glass',
  quartz: 'smooth_quartz',
  water: 'water',
  gold: 'gold_block',
}

const Y = -16
const DZ = 24                       // 南移 24 格：耳堂南臂到 z=79、台地到 z=84，必须避开
const FOOT = { x1: 62, x2: 178, z1: 66 + DZ, z2: 134 + DZ }

export function build({ site }) {
  const api = createPlan(26)
  buildInto(api)
  return api.ops
}

export function buildInto(api) {
  const Z = (z) => z + DZ

  // =============================================================== 1. 台地
  api.box(FOOT.x1, -60, FOOT.z1, FOOT.x2, Y - 1, FOOT.z2, M.stone, 'replace', '主教宫/基础')
  api.box(FOOT.x1 - 2, Y + 1, FOOT.z1 - 2, FOOT.x2 + 2, Y + 30, FOOT.z2 + 2, 'air', 'replace', '主教宫/清场')
  api.box(FOOT.x1, Y, FOOT.z1, FOOT.x2, Y, FOOT.z2, M.floor, 'replace', '主教宫/地坪')
  api.box(FOOT.x1, Y, FOOT.z1, FOOT.x2, Y + 1, FOOT.z1, M.trim, 'replace', '主教宫/北缘')
  api.box(FOOT.x1, Y, FOOT.z2, FOOT.x2, Y + 1, FOOT.z2, M.trim, 'replace', '主教宫/南缘')
  api.box(FOOT.x1, Y, FOOT.z1, FOOT.x1, Y + 1, FOOT.z2, M.trim, 'replace', '主教宫/西缘')
  api.box(FOOT.x2, Y, FOOT.z1, FOOT.x2, Y + 1, FOOT.z2, M.trim, 'replace', '主教宫/东缘')

  // =============================================================== 2. 宫体（口字形，内院 41×27）
  const C = { x1: 84, x2: 156, z1: Z(78), z2: Z(122) }
  const court = { x1: 100, x2: 140, z1: Z(92), z2: Z(108) }
  const H = 14
  api.box(C.x1, Y + 1, C.z1, C.x2, Y + H, C.z2, M.wall, 'replace', '主教宫/宫体')
  api.box(court.x1, Y + 1, court.z1, court.x2, Y + H - 1, court.z2, 'air', 'replace', '主教宫/内院')
  api.box(court.x1 - 2, Y + 2, court.z1 - 2, court.x2 + 2, Y + H - 2, court.z2 + 2, 'air', 'replace', '主教宫/内院廊')
  api.box(court.x1, Y + 1, court.z1, court.x2, Y + 1, court.z2, M.floor, 'replace', '主教宫/内院地坪')
  api.box(C.x1 - 1, Y + 1, C.z1 - 1, C.x2 + 1, Y + 3, C.z2 + 1, M.trim, 'replace', '主教宫/基座')
  api.box(C.x1 - 1, Y + H + 1, C.z1 - 1, C.x2 + 1, Y + H + 1, C.z2 + 1, M.roof, 'replace', '主教宫/檐')
  api.box(C.x1, Y + H + 2, C.z1, C.x2, Y + H + 3, C.z2, M.roof, 'replace', '主教宫/屋面')
  api.box((court.x1 + court.x2) / 2, Y + H + 4, (court.z1 + court.z2) / 2, (court.x1 + court.x2) / 2, Y + H + 5, (court.z1 + court.z2) / 2, M.trim, 'replace', '主教宫/顶饰')
  // 内院廊柱
  for (let x = court.x1 - 1; x <= court.x2 + 1; x += 4) {
    api.box(x, Y + 2, court.z1 - 1, x, Y + H - 2, court.z1 - 1, M.wall, 'replace', '主教宫/内院柱N')
    api.box(x, Y + 2, court.z2 + 1, x, Y + H - 2, court.z2 + 1, M.wall, 'replace', '主教宫/内院柱S')
  }
  for (let z = court.z1 - 1; z <= court.z2 + 1; z += 4) {
    api.box(court.x1 - 1, Y + 2, z, court.x1 - 1, Y + H - 2, z, M.wall, 'replace', '主教宫/内院柱W')
    api.box(court.x2 + 1, Y + 2, z, court.x2 + 1, Y + H - 2, z, M.wall, 'replace', '主教宫/内院柱E')
  }
  // 窗带
  for (const zw of [C.z1, C.z2]) {
    for (let x = C.x1 + 4; x <= C.x2 - 4; x += 8) {
      api.box(x, Y + 5, zw, x + 2, Y + 9, zw, M.glass, 'replace', '主教宫/窗')
    }
  }
  // 正门（西向）
  api.box(C.x1, Y + 1, Z(98), C.x1, Y + 4, Z(102), 'air', 'replace', '主教宫/正门')

  // =============================================================== 3. 接待厅（西侧外凸大厅）
  const HALL = { x1: 70, x2: 84, z1: Z(92), z2: Z(116) }
  api.box(HALL.x1, Y + 1, HALL.z1, HALL.x2, Y + 12, HALL.z2, M.wall, 'replace', '接待厅/墙身')
  api.box(HALL.x1 + 2, Y + 2, HALL.z1 + 2, HALL.x2 - 1, Y + 11, HALL.z2 - 2, 'air', 'replace', '接待厅/内部')
  api.box(HALL.x1, Y + 1, HALL.z1, HALL.x2, Y + 3, HALL.z2, M.trim, 'replace', '接待厅/基座')
  api.box(HALL.x1 - 1, Y + 13, HALL.z1 - 1, HALL.x2 + 1, Y + 13, HALL.z2 + 1, M.roof, 'replace', '接待厅/檐')
  api.box(HALL.x1, Y + 14, HALL.z1, HALL.x2, Y + 15, HALL.z2, M.roof, 'replace', '接待厅/屋面')
  api.box(HALL.x1, Y + 1, Z(102), HALL.x1, Y + 4, Z(106), 'air', 'replace', '接待厅/门')
  api.box(HALL.x1 + 4, Y + 5, HALL.z1, HALL.x2 - 2, Y + 9, HALL.z1, M.glass, 'replace', '接待厅/北窗')
  api.box(HALL.x1 + 4, Y + 5, HALL.z2, HALL.x2 - 2, Y + 9, HALL.z2, M.glass, 'replace', '接待厅/南窗')

  // =============================================================== 4. 小礼拜堂（东侧外凸，带尖塔）
  const CHAP = { x1: 156, x2: 172, z1: Z(94), z2: Z(114) }
  api.box(CHAP.x1, Y + 1, CHAP.z1, CHAP.x2, Y + 13, CHAP.z2, M.wall, 'replace', '小礼拜堂/墙身')
  api.box(CHAP.x1 + 1, Y + 2, CHAP.z1 + 2, CHAP.x2 - 2, Y + 12, CHAP.z2 - 2, 'air', 'replace', '小礼拜堂/内部')
  api.box(CHAP.x1, Y + 1, CHAP.z1, CHAP.x2, Y + 3, CHAP.z2, M.trim, 'replace', '小礼拜堂/基座')
  api.box(CHAP.x1 - 1, Y + 14, CHAP.z1 - 1, CHAP.x2 + 1, Y + 14, CHAP.z2 + 1, M.roof, 'replace', '小礼拜堂/檐')
  api.box(CHAP.x1, Y + 15, CHAP.z1, CHAP.x2, Y + 16, CHAP.z2, M.roof, 'replace', '小礼拜堂/屋面')
  api.box(CHAP.x2, Y + 1, Z(102), CHAP.x2, Y + 4, Z(106), 'air', 'replace', '小礼拜堂/门')
  api.box(CHAP.x2, Y + 17, Z(102), CHAP.x2, Y + 22, Z(106), M.wall, 'replace', '小礼拜堂/尖塔')
  api.box(CHAP.x2, Y + 23, Z(104), CHAP.x2, Y + 25, Z(104), M.roof, 'replace', '小礼拜堂/塔尖')
  api.box(CHAP.x2, Y + 26, Z(104), CHAP.x2, Y + 26, Z(104), M.gold, 'replace', '小礼拜堂/顶饰')
  api.box(CHAP.x1 + 1, Y + 6, CHAP.z1, CHAP.x2 - 2, Y + 11, CHAP.z1, M.glass, 'replace', '小礼拜堂/北窗')

  // =============================================================== 5. 花园（南侧）
  const G = { x1: 88, x2: 152, z1: Z(124), z2: Z(132) }
  api.box(G.x1, Y + 1, G.z1, G.x2, Y + 1, G.z2, M.grass, 'replace', '花园/草地')
  api.box((G.x1 + G.x2) / 2, Y + 1, G.z1, (G.x1 + G.x2) / 2, Y + 1, G.z2, M.path, 'replace', '花园/甬路')
  api.box(G.x1, Y + 1, (G.z1 + G.z2) / 2, G.x2, Y + 1, (G.z1 + G.z2) / 2, M.path, 'replace', '花园/甬路EW')
  api.box(116, Y + 1, Z(126), 124, Y + 1, Z(130), M.water, 'replace', '花园/水池')
  api.box(115, Y + 2, Z(125), 125, Y + 2, Z(131), M.trim, 'replace', '花园/池沿')
  api.box(116, Y + 2, Z(126), 124, Y + 2, Z(130), M.water, 'replace', '花园/水面')
  for (const [hx, hz] of [[92, Z(126)], [92, Z(131)], [148, Z(126)], [148, Z(131)], [120, Z(133)]]) {
    api.box(hx - 1, Y + 2, hz - 1, hx + 1, Y + 3, hz + 1, M.grass, 'replace', '花园/绿篱')
  }
}
