/**
 * PHASE 5 —— 中殿柱网（束柱）
 *
 * building.md §3 PHASE 5：每 14 格建一组束柱至 y=42；停止点：不做屋顶。
 * §2：主柱为 5×5–7×7 视觉尺度的束柱：3×3 核心、四向附柱、三级柱基和明显柱头；
 *      禁止仅用 2×2 直柱接屋顶；楼梯和柱子不横跨中心轴。
 *
 * 本阶段只做**中殿拱廊柱**（z=±18，9 条柱线 = 18 根），侧廊柱（±31/±44）留到 PHASE 6。
 */
import { createPlan, AXIS } from '../layout.js'

const MAT = {
  core: 'stone_bricks',
  shaft: 'polished_andesite',
  plinth: 'polished_andesite',
  accent: 'calcite',
  abacus: 'polished_deepslate',
  weathered: 'mossy_stone_bricks',
}

/** 构造成一根 7x7 束柱的全部 op */
function bundlePier(api, cx, cz) {
  const t = `柱(${cx},${cz})`
  // 三级柱基：7x7 -> 5x5 -> 3x3
  api.box(cx - 3, 0, cz - 3, cx + 3, 1, cz + 3, MAT.plinth, 'replace', `${t}/柱基1`)
  api.box(cx - 2, 2, cz - 2, cx + 2, 3, cz + 2, MAT.plinth, 'replace', `${t}/柱基2`)
  api.box(cx - 1, 4, cz - 1, cx + 1, 4, cz + 1, MAT.weathered, 'replace', `${t}/柱基3`)
  // 5x5 外壳（hollow）→ 4 向/4 角附柱，包住 3x3 核心
  api.box(cx - 2, 5, cz - 2, cx + 2, 37, cz + 2, MAT.shaft, 'hollow', `${t}/附柱`)
  // 3x3 核心
  api.box(cx - 1, 0, cz - 1, cx + 1, 42, cz + 1, MAT.core, 'replace', `${t}/核心`)
  // 柱头：5x5 柱头 + 7x7 顶板
  api.box(cx - 2, 38, cz - 2, cx + 2, 40, cz + 2, MAT.accent, 'replace', `${t}/柱头`)
  api.box(cx - 3, 41, cz - 3, cx + 3, 42, cz + 3, MAT.abacus, 'replace', `${t}/顶板`)
  return api
}

export function build({ site }) {
  const api = createPlan(5)
  const zLines = [AXIS.Z_NAVE_PIER, -AXIS.Z_NAVE_PIER]
  for (const x of AXIS.PIER_LINES) {
    for (const z of zLines) bundlePier(api, x, z)
  }
  return api.ops
}
