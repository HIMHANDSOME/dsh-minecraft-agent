/**
 * PHASE 10 —— 中殿屋架 + 主屋脊
 *
 * building.md §2：屋架约 y=72；主屋脊 y=86；用现场剖面校核。
 * 屋面材料 deepslate_tiles / polished_deepslate（§2 屋面与木作）。
 *
 * 体素做法：
 *   1. 屋面：从檐口 z=±19、y=70 沿直线升到脊 z=0、y=86（真实坡面，逐层 fill）；
 *   2. 屋脊：脊线压顶 polished_deepslate；
 *   3. 木屋架：每个柱线一道横梁 y=72（dark_oak），并加斜撑；
 *   4. 檐口收边与檐下石带。
 */
import { createPlan, AXIS } from '../layout.js'

const M = {
  roof: 'deepslate_tiles',
  roofTrim: 'polished_deepslate',
  beam: 'dark_oak_log',
  strut: 'stripped_dark_oak_log',
  wall: 'stone_bricks',
}

const EAVE_Z = 19
const EAVE_Y = 70
const RIDGE_Y = 86
const TRUSS_Y = 72

/** 屋面高度：|z|=19 → 70，z=0 → 86 */
function roofH(z) {
  const t = Math.min(1, Math.abs(z) / EAVE_Z)
  return Math.round(RIDGE_Y - (RIDGE_Y - EAVE_Y) * t)
}

export function build({ site }) {
  const api = createPlan(10)
  const X0 = AXIS.PIER_LINES[0]
  const X1 = AXIS.PIER_LINES[AXIS.PIER_LINES.length - 1]

  // ---------------- 1. 屋面（南北两个坡面，逐层 fill）
  for (const s of [1, -1]) {
    const side = s > 0 ? 'S' : 'N'
    let rs = 0, prev = roofH(0)
    const segs = []
    for (let z = 1; z <= EAVE_Z + 1; z++) {
      const hv = z <= EAVE_Z ? roofH(z) : null
      if (hv !== prev) { segs.push({ z1: rs, z2: z - 1, y: prev }); rs = z; prev = hv }
    }
    for (const seg of segs) {
      const z1 = seg.z1, z2 = seg.z2
      const a = s > 0 ? z1 : -z2
      const b = s > 0 ? z2 : -z1
      api.box(X0 - 1, seg.y, a, X1 + 1, seg.y + 1, b, M.roof, 'replace', `屋面${side}/坡y${seg.y}`)
    }
    // 檐口收边
    api.box(X0 - 1, EAVE_Y - 1, s * EAVE_Z, X1 + 1, EAVE_Y, s * (EAVE_Z + 1), M.roofTrim, 'replace', `屋面${side}/檐口`)
  }

  // ---------------- 2. 主屋脊
  api.box(X0 - 1, RIDGE_Y, -1, X1 + 1, RIDGE_Y + 1, 1, M.roofTrim, 'replace', '屋脊')
  api.box(X0 - 1, RIDGE_Y - 1, 0, X1 + 1, RIDGE_Y - 1, 0, M.roof, 'replace', '屋脊/脊瓦')

  // ---------------- 3. 木屋架（每条柱线一道）
  for (const xi of AXIS.PIER_LINES) {
    api.box(xi, TRUSS_Y, -17, xi, TRUSS_Y, 17, M.beam, 'replace', `屋架/横梁x${xi}`)
    api.box(xi, TRUSS_Y + 1, 0, xi, TRUSS_Y + 6, 0, M.beam, 'replace', `屋架/中柱x${xi}`)
    // 斜撑（各 4 段）
    for (let k = 0; k < 4; k++) {
      const zz = 4 + k * 4
      const yy = TRUSS_Y + 1 + k
      api.box(xi, yy, zz, xi, yy, zz, M.strut, 'replace', `屋架/斜撑x${xi}k${k}`)
      api.box(xi, yy, -zz, xi, yy, -zz, M.strut, 'replace', `屋架/斜撑x${xi}k${k}n`)
    }
    // 注：此处原本用 hollow 建"檐下山墙"，会把中殿拱顶在柱线处掏空（已实测确认）。
    // 山墙位于拱顶与屋面之间、从室内外都看不到，收益低、fill 数量大，故不建；
    // 屋顶靠 y=72 的木屋架（横梁/中柱/斜撑）表达结构。被掏空的部分由
    // phases/phase10b-repair.js 复原。
  }

  return api.ops
}
