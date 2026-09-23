/**
 * PHASE 2 —— 台地与地基
 *
 * 目标（building.md §3）：西塔、中殿、耳堂、唱诗班、东端地基，并支撑山坡；
 * 停止点：无悬空结构。
 *
 * 做法（相对坐标 y=0 为教堂地坪 = 世界 y=122 山脊台地面）：
 *   1. 清场：把台地以上 y=1..34 的天然地形/植被削平，得到水平地坪；
 *   2. 核心填充：大教堂 + 广场下方 y=-20..-1 实心石（隐藏结构，兼作地宫外壳）；
 *   3. 周边挡土墙（ring，厚 6）：从 y=-80 一直落到山坡，保证外缘不悬空；
 *   4. 广场为西侧断崖上的"棱堡"台地（天然地形在其西缘骤降 ~64 格）；
 *   5. 西门大台阶：自广场西缘逐级下降 64 格到谷底。
 */
import { createPlan } from '../layout.js'

const M = {
  cut: 'air',
  core: 'stone',
  wall: 'stone_bricks',
  wallAccent: 'polished_andesite',
  stair: 'smooth_stone',
  stairEdge: 'polished_deepslate',
  plazaFloor: 'stone_bricks',
  plazaEdge: 'polished_deepslate',
}

/** 台地：清场 + 核心填充 + 周边挡土墙（四带 × 16 层分带） */
function terrace(api, foot, { ringBottom = -80, coreBottom = -20, coreBlock = M.core, ringBlock = M.wall, tag = '' } = {}) {
  const { x1, x2, z1, z2 } = foot
  const ring = 6
  api.box(x1 - 2, 1, z1 - 2, x2 + 2, 34, z2 + 2, M.cut, 'replace', `${tag}清场`)
  api.box(x1, coreBottom, z1, x2, -1, z2, coreBlock, 'replace', `${tag}核心填充`)
  for (let ya = ringBottom; ya < coreBottom; ya += 16) {
    const yb = Math.min(coreBottom - 1, ya + 15)
    api.box(x1, ya, z1, x2, yb, z1 + ring - 1, ringBlock, 'replace', `${tag}挡土墙N`)
    api.box(x1, ya, z2 - ring + 1, x2, yb, z2, ringBlock, 'replace', `${tag}挡土墙S`)
    api.box(x1, ya, z1 + ring, x1 + ring - 1, yb, z2 - ring, ringBlock, 'replace', `${tag}挡土墙W`)
    api.box(x2 - ring + 1, ya, z1 + ring, x2, yb, z2 - ring, ringBlock, 'replace', `${tag}挡土墙E`)
  }
  return api
}

export function build({ site }) {
  const api = createPlan(2)
  const cat = site.footprints.cathedral.rel
  const plaza = site.footprints.plaza.rel

  // =============================================================== A. 广场棱堡
  terrace(api, plaza, { ringBottom: -80, coreBottom: -20, tag: '广场/' })

  // 广场地坪（棱堡顶面，方便行走/放线）：x=-44..-8 铺石
  api.box(plaza.x1 + 2, 0, plaza.z1 + 2, plaza.x2 - 2, 0, plaza.z2 - 2, M.plazaFloor, 'replace', '广场/地坪')
  // 广场西缘女儿墙基座
  api.box(plaza.x1 - 2, 0, plaza.z1 - 2, plaza.x1 + 1, 2, plaza.z2 + 2, M.plazaEdge, 'replace', '广场/西缘压顶')
  api.box(plaza.x1 - 2, 0, plaza.z1 - 2, plaza.x2 + 2, 2, plaza.z1 + 1, M.plazaEdge, 'replace', '广场/北缘压顶')
  api.box(plaza.x1 - 2, 0, plaza.z2 - 1, plaza.x2 + 2, 2, plaza.z2 + 2, M.plazaEdge, 'replace', '广场/南缘压顶')

  // =============================================================== B. 大教堂台地
  terrace(api, cat, { ringBottom: -80, coreBottom: -20, tag: '教堂/' })

  // 地坪面层：全台地铺一层 polished_andesite 作为"石铺地面"，后续内部再改木地板
  api.box(cat.x1 + 6, 0, cat.z1 + 6, cat.x2 - 6, 0, cat.z2 - 6, M.plazaFloor, 'replace', '教堂/地坪面层')

  // =============================================================== C. 西缘挡土墙压顶（棱堡感）
  api.box(cat.x1 - 2, 0, cat.z1 - 2, cat.x1 + 2, 3, cat.z2 + 2, M.wallAccent, 'replace', '教堂/西缘压顶')
  api.box(cat.x1 - 2, 0, cat.z1 - 2, cat.x2 + 2, 3, cat.z1 + 2, M.wallAccent, 'replace', '教堂/北缘压顶')
  api.box(cat.x1 - 2, 0, cat.z2 - 1, cat.x2 + 2, 3, cat.z2 + 2, M.wallAccent, 'replace', '教堂/南缘压顶')
  api.box(cat.x2 - 1, 0, cat.z1 - 2, cat.x2 + 2, 3, cat.z2 + 2, M.wallAccent, 'replace', '教堂/东缘压顶')

  // =============================================================== D. 西门大台阶（广场西缘 → 谷底）
  // 从广场西缘 x=plaza.x1-2 (=rel -48) 起，每级下降 2 格、西进 2 格，共 32 级 → 64 格
  const sx0 = plaza.x1 - 2
  for (let i = 0; i < 32; i++) {
    const x = sx0 - i * 2
    const y = -1 - i * 2
    api.box(x - 1, y, -10, x, y, 10, M.stair, 'replace', `台阶/踏面${i}`)
    api.box(x - 1, y + 1, -10, x, y + 1, -9, M.stairEdge, 'replace', `台阶/北栏${i}`)
    api.box(x - 1, y + 1, 9, x, y + 1, 10, M.stairEdge, 'replace', `台阶/南栏${i}`)
    // 每级下方的实心支撑，落到下一级，避免悬空
    api.box(x - 1, y - 6, -10, x, y - 1, 10, M.wall, 'replace', `台阶/基础${i}`)
  }
  // 台阶末端广场（谷底）
  api.box(sx0 - 70, -64, -14, sx0 - 60, -64, 14, M.stair, 'replace', '台阶/谷底平台')

  return api.ops
}
