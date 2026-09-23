/**
 * tower.js —— 西立面双塔上半段的共享生成器
 *
 * 塔位：北塔中心 (x=13, z=-34)、南塔 (x=13, z=+34)；塔身 27×27（±13）。
 * PHASE 4 已建下部 y=0..32；本模块供 PHASE 15–17 使用。
 *
 * building.md §2 分层：
 *   y=32..58  尖券窗      y=59..94  钟楼
 *   y=95..118 开放石廊    y=119..137 方形到八角过渡
 *   y=138..160 镂空尖塔   y=161..176 细尖顶    y=177..180 顶饰
 */

export const TX = 13
export const TZ = 34
export const HALF = 13

export const TMAT = {
  wall: 'stone_bricks',
  trim: 'polished_deepslate',
  accent: 'polished_andesite',
  calcite: 'calcite',
  roof: 'deepslate_tiles',
  bars: 'iron_bars',
  mossy: 'mossy_stone_bricks',
}

/** 方形塔身环墙（thick 厚），并把内部清空 */
export function ring(api, zc, y1, y2, half, thick, block, tag, mode = 'replace') {
  const x1 = TX - half, x2 = TX + half
  const z1 = zc - half, z2 = zc + half
  const t = thick
  api.box(x1, y1, z1, x2, y2, z1 + t - 1, block, mode, `${tag}/N`)
  api.box(x1, y1, z2 - t + 1, x2, y2, z2, block, mode, `${tag}/S`)
  api.box(x1, y1, z1 + t, x1 + t - 1, y2, z2 - t, block, mode, `${tag}/W`)
  api.box(x2 - t + 1, y1, z1 + t, x2, y2, z2 - t, block, mode, `${tag}/E`)
  api.box(x1 + t, y1, z1 + t, x2 - t, y2, z2 - t, 'air', mode === 'keep' ? 'replace' : 'replace', `${tag}/内`)
  return api
}

/** 四个面上的尖券窗（带券头逐层内收 + 彩玻 + 石中梃） */
export function lancetWindows(api, zc, { y1, y2, half, apex, glass, thick = 3, half0 = HALF, tag = '' }) {
  const faces = [
    { f: 'N', box: (w) => [TX - w, y1, zc - half0, TX + w, y2, zc - half0 + thick - 1] },
    { f: 'S', box: (w) => [TX - w, y1, zc + half0 - thick + 1, TX + w, y2, zc + half0] },
    { f: 'W', box: (w) => [TX - half0, y1, zc - w, TX - half0 + thick - 1, y2, zc + w] },
    { f: 'E', box: (w) => [TX + half0 - thick + 1, y1, zc - w, TX + half0, y2, zc + w] },
  ]
  for (const face of faces) {
    // 矩形窗身
    api.box(...face.box(half), 'air', 'replace', `${tag}${face.f}/窗身`)
    // 券头
    const hwAt = (y) => Math.max(0, Math.round(half * Math.pow(1 - (y - (y2 + 1)) / (apex - y2 - 1), 0.62) * 2) / 2)
    let s0 = y2 + 1, prev = hwAt(y2 + 1)
    for (let y = y2 + 2; y <= apex + 1; y++) {
      const hv = y <= apex ? hwAt(y) : null
      if (hv !== prev) {
        const w = Math.round(prev)
        if (w >= 0) api.box(...face.box(w), 'air', 'replace', `${tag}${face.f}/券`)
        s0 = y; prev = hv
      }
    }
    // 彩玻（三段）
    const span = y2 - y1
    const c1 = y1 + Math.floor(span / 3), c2 = y1 + Math.floor((2 * span) / 3)
    for (const [ya, yb, gl] of [[y1, c1, glass[0]], [c1 + 1, c2, glass[1]], [c2 + 1, y2, glass[2]]]) {
      if (yb < ya) continue
      const b = face.box(half)
      b[1] = ya; b[4] = yb
      api.box(...b, gl, 'replace', `${tag}${face.f}/玻`)
    }
    // 石中梃 + 横档
    const mid = face.f === 'N' || face.f === 'S'
      ? [TX, y1, (face.f === 'N' ? zc - half0 : zc + half0 - thick + 1), TX, y2, (face.f === 'N' ? zc - half0 + thick - 1 : zc + half0)]
      : [(face.f === 'W' ? TX - half0 : TX + half0 - thick + 1), y1, zc, (face.f === 'W' ? TX - half0 + thick - 1 : TX + half0), y2, zc]
    api.box(...mid, TMAT.accent, 'replace', `${tag}${face.f}/中梃`)
  }
  return api
}
