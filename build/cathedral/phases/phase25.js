/**
 * PHASE 25 —— 外围（二）：北修道院
 *
 * building.md §2：北修道院含回廊、庭院、宿舍、图书室、食堂和小礼拜堂。
 * 实测地形（probe-sites.js）：该区地表世界 y 58..122，故平台取 **世界 y=92**（rel y=-30）：
 * 水下/低处填实到平台下，高处削平。
 *
 * 布局（rel）：回廊围绕中央庭院（回廊院 garth），四面各有功能翼：
 *   西翼 食堂、东翼 图书室、南翼 宿舍、北翼 小礼拜堂（带小钟塔）。
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
  glass: 'light_gray_stained_glass',
  fence: 'dark_oak_fence',
}

const Y = -30                 // 平台标高（块；可行走面 y=-29）
const FOOT = { x1: 60, x2: 180, z1: -142, z2: -56 }
const GARTH = { x1: 106, x2: 144, z1: -118, z2: -82 }

export function build({ site }) {
  const api = createPlan(25)

  // =============================================================== 1. 台地
  api.box(FOOT.x1, -72, FOOT.z1, FOOT.x2, Y - 1, FOOT.z2, M.stone, 'replace', '修道院/基础')
  api.box(FOOT.x1 - 2, Y + 1, FOOT.z1 - 2, FOOT.x2 + 2, Y + 34, FOOT.z2 + 2, 'air', 'replace', '修道院/清场')
  api.box(FOOT.x1, Y, FOOT.z1, FOOT.x2, Y, FOOT.z2, M.floor, 'replace', '修道院/地坪')
  api.box(FOOT.x1, Y, FOOT.z1, FOOT.x2, Y + 1, FOOT.z1, M.trim, 'replace', '修道院/北缘')
  api.box(FOOT.x1, Y, FOOT.z2, FOOT.x2, Y + 1, FOOT.z2, M.trim, 'replace', '修道院/南缘')
  api.box(FOOT.x1, Y, FOOT.z1, FOOT.x1, Y + 1, FOOT.z2, M.trim, 'replace', '修道院/西缘')
  api.box(FOOT.x2, Y, FOOT.z1, FOOT.x2, Y + 1, FOOT.z2, M.trim, 'replace', '修道院/东缘')

  // =============================================================== 2. 庭院（garth）与十字甬路
  api.box(GARTH.x1, Y + 1, GARTH.z1, GARTH.x2, Y + 1, GARTH.z2, M.grass, 'replace', '修道院/庭院')
  api.box(GARTH.x1, Y + 1, -100, GARTH.x2, Y + 1, -100, M.path, 'replace', '修道院/甬路NS')
  api.box(125, Y + 1, GARTH.z1, 125, Y + 1, GARTH.z2, M.path, 'replace', '修道院/甬路EW')

  // =============================================================== 3. 回廊（四面廊道 + 庭院侧柱列 + 单坡顶）
  const WALK = [
    { x1: GARTH.x1, x2: GARTH.x2, z1: GARTH.z1 - 8, z2: GARTH.z1 - 1, tag: '北廊' },
    { x1: GARTH.x1, x2: GARTH.x2, z1: GARTH.z2 + 1, z2: GARTH.z2 + 8, tag: '南廊' },
    { x1: GARTH.x1 - 8, x2: GARTH.x1 - 1, z1: GARTH.z1, z2: GARTH.z2, tag: '西廊' },
    { x1: GARTH.x2 + 1, x2: GARTH.x2 + 8, z1: GARTH.z1, z2: GARTH.z2, tag: '东廊' },
  ]
  for (const w of WALK) {
    api.box(w.x1, Y + 1, w.z1, w.x2, Y + 1, w.z2, M.floor, 'replace', `回廊/${w.tag}地面`)
    api.box(w.x1, Y + 8, w.z1, w.x2, Y + 8, w.z2, M.roof, 'replace', `回廊/${w.tag}顶`)
    api.box(w.x1, Y + 9, w.z1, w.x2, Y + 9, w.z2, M.trim, 'replace', `回廊/${w.tag}顶脊`)
  }
  // 庭院侧柱列（每 4 格一根）
  for (let x = GARTH.x1; x <= GARTH.x2; x += 4) {
    api.box(x, Y + 2, GARTH.z1 - 1, x, Y + 7, GARTH.z1 - 1, M.wall, 'replace', '回廊/北柱')
    api.box(x, Y + 2, GARTH.z2 + 1, x, Y + 7, GARTH.z2 + 1, M.wall, 'replace', '回廊/南柱')
  }
  for (let z = GARTH.z1; z <= GARTH.z2; z += 4) {
    api.box(GARTH.x1 - 1, Y + 2, z, GARTH.x1 - 1, Y + 7, z, M.wall, 'replace', '回廊/西柱')
    api.box(GARTH.x2 + 1, Y + 2, z, GARTH.x2 + 1, Y + 7, z, M.wall, 'replace', '回廊/东柱')
  }
  // 廊下长凳与灯笼
  api.box(GARTH.x1 + 2, Y + 2, GARTH.z1 - 4, GARTH.x2 - 2, Y + 2, GARTH.z1 - 4, M.wood, 'replace', '回廊/长凳N')
  api.box(GARTH.x1 + 2, Y + 2, GARTH.z2 + 4, GARTH.x2 - 2, Y + 2, GARTH.z2 + 4, M.wood, 'replace', '回廊/长凳S')

  // =============================================================== 4. 四翼
  const wing = (b, tag, h = 14) => {
    api.box(b.x1, Y + 1, b.z1, b.x2, Y + h, b.z2, M.wall, 'replace', `${tag}/墙身`)
    api.box(b.x1 + 2, Y + 2, b.z1 + 2, b.x2 - 2, Y + h - 1, b.z2 - 2, 'air', 'replace', `${tag}/内部`)
    api.box(b.x1 - 1, Y + 1, b.z1 - 1, b.x2 + 1, Y + 3, b.z2 + 1, M.trim, 'replace', `${tag}/基座`)
    api.box(b.x1 - 1, Y + h + 1, b.z1 - 1, b.x2 + 1, Y + h + 1, b.z2 + 1, M.roof, 'replace', `${tag}/檐`)
    api.box(b.x1, Y + h + 2, b.z1, b.x2, Y + h + 3, b.z2, M.roof, 'replace', `${tag}/屋面`)
    api.box(b.x1 + 2, Y + 4, b.z1, b.x2 - 2, Y + h - 2, b.z1, M.glass, 'replace', `${tag}/北窗`)
    api.box(b.x1 + 2, Y + 4, b.z2, b.x2 - 2, Y + h - 2, b.z2, M.glass, 'replace', `${tag}/南窗`)
    api.box(b.x1, Y + 4, b.z1 + 3, b.x1, Y + h - 2, b.z2 - 3, M.glass, 'replace', `${tag}/西窗`)
    api.box(b.x2, Y + 4, b.z1 + 3, b.x2, Y + h - 2, b.z2 - 3, M.glass, 'replace', `${tag}/东窗`)
  }
  wing({ x1: 86, x2: 97, z1: -126, z2: -74 }, '修道院/食堂')          // 西翼
  wing({ x1: 153, x2: 166, z1: -126, z2: -74 }, '修道院/图书室')      // 东翼
  wing({ x1: 98, x2: 152, z1: -73, z2: -60 }, '修道院/宿舍')          // 南翼
  // 北翼：小礼拜堂（更高，带小钟塔）
  wing({ x1: 112, x2: 140, z1: -142, z2: -127 }, '修道院/小礼拜堂', 18)
  api.box(124, Y + 1, -127, 128, Y + 4, -126, 'air', 'replace', '修道院/礼拜堂门')
  api.box(124, Y + 19, -142, 128, Y + 21, -138, M.wall, 'replace', '修道院/钟塔')
  api.box(125, Y + 22, -141, 127, Y + 25, -139, M.roof, 'replace', '修道院/钟塔顶')
  api.box(126, Y + 26, -140, 126, Y + 27, -140, 'gold_block', 'replace', '修道院/钟塔尖')
  api.box(118, Y + 12, -134, 134, Y + 12, -134, M.beam, 'replace', '修道院/堂内横梁')

  // =============================================================== 5. 入口（南翼开正门，接东侧道路）
  api.box(123, Y + 1, -60, 127, Y + 4, -59, 'air', 'replace', '修道院/南门')

  return api.ops
}
