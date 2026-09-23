/**
 * pier.js —— 束柱（bundle pier）生成器
 *
 * building.md §2：主柱为 5×5–7×7 视觉尺度的束柱：3×3 核心、四向附柱、
 * 三级柱基和明显柱头；禁止仅用 2×2 直柱接屋顶。
 *
 * 构造（相对坐标，y=0 为地坪）：
 *   柱基1  7×7  y=0..1     polished_andesite
 *   柱基2  5×5  y=2..3     polished_andesite
 *   柱基3  3×3  y=4        mossy_stone_bricks（磨损层）
 *   附柱   5×5  y=5..top-5 polished_andesite（hollow，形成四向/四角附柱）
 *   核心   3×3  y=0..top   stone_bricks
 *   柱头   5×5  y=top-4..top-2  calcite
 *   顶板   7×7  y=top-1..top    polished_deepslate
 */
export const PIER_MAT = {
  core: 'stone_bricks',
  shaft: 'polished_andesite',
  plinth: 'polished_andesite',
  accent: 'calcite',
  abacus: 'polished_deepslate',
  weathered: 'mossy_stone_bricks',
}

export function bundlePier(api, cx, cz, top = 42) {
  const t = `柱(${cx},${cz})`
  const M = PIER_MAT
  api.box(cx - 3, 0, cz - 3, cx + 3, 1, cz + 3, M.plinth, 'replace', `${t}/柱基1`)
  api.box(cx - 2, 2, cz - 2, cx + 2, 3, cz + 2, M.plinth, 'replace', `${t}/柱基2`)
  api.box(cx - 1, 4, cz - 1, cx + 1, 4, cz + 1, M.weathered, 'replace', `${t}/柱基3`)
  api.box(cx - 2, 5, cz - 2, cx + 2, top - 5, cz + 2, M.shaft, 'hollow', `${t}/附柱`)
  api.box(cx - 1, 0, cz - 1, cx + 1, top, cz + 1, M.core, 'replace', `${t}/核心`)
  api.box(cx - 2, top - 4, cz - 2, cx + 2, top - 2, cz + 2, M.accent, 'replace', `${t}/柱头`)
  api.box(cx - 3, top - 1, cz - 3, cx + 3, top, cz + 3, M.abacus, 'replace', `${t}/顶板`)
  return api
}
