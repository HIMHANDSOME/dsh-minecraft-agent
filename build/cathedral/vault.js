/**
 * vault.js —— 肋拱与坡屋顶的可复用生成器
 *
 * PHASE 8 的中殿拱顶、PHASE 10 的屋面只适用于 x=43..155 一段。
 * 唱诗班（x=190..231）与东端需要同一套做法，这里抽成参数化函数，
 * 生成顺序与 PHASE 8/10 保持一致（保证同一套曲线与肋位）。
 */

export const V = {
  vault: 'stone_bricks',
  rib: 'polished_andesite',
  roof: 'deepslate_tiles',
  roofTrim: 'polished_deepslate',
  beam: 'dark_oak_log',
  strut: 'stripped_dark_oak_log',
}

/** 拱腹高度：z=0 最高 crown，|z|=zSpring 为起拱 spring */
export function vaultH(z, { zSpring = 14, spring = 48, crown = 68 } = {}) {
  const t = Math.min(1, Math.abs(z) / zSpring)
  return Math.round(crown - (crown - spring) * Math.pow(t, 1.5))
}

/**
 * 肋拱：拱壳（keep，不覆盖已有柱头）+ 横肋（柱线）+ 纵肋（z=0,±7）+ 对角肋（每开间两条）
 */
export function ribVault(api, { x1, x2, pierLines, zSpring = 14, spring = 48, crown = 68, tag = '拱顶' }) {
  const opt = { zSpring, spring, crown }
  let rs = -zSpring, prev = vaultH(-zSpring, opt)
  const segs = []
  for (let z = -zSpring + 1; z <= zSpring + 1; z++) {
    const hv = z <= zSpring ? vaultH(z, opt) : null
    if (hv !== prev) { segs.push({ z1: rs, z2: z - 1, y: prev }); rs = z; prev = hv }
  }
  for (const seg of segs) {
    api.box(x1, seg.y, seg.z1, x2, seg.y + 2, seg.z2, V.vault, 'keep', `${tag}/壳y${seg.y}`)
  }
  for (const xi of pierLines) {
    for (const seg of segs) {
      api.box(xi, seg.y - 1, seg.z1, xi, seg.y - 1, seg.z2, V.rib, 'replace', `${tag}/横肋x${xi}`)
    }
  }
  for (const z of [0, -7, 7]) {
    api.box(x1, vaultH(z, opt) - 1, z, x2, vaultH(z, opt) - 1, z, V.rib, 'replace', `${tag}/纵肋z${z}`)
  }
  const lines = [x1, ...pierLines, x2]
  for (let i = 0; i < lines.length - 1; i++) {
    const xa = lines[i], xb = lines[i + 1]
    for (const dir of [1, -1]) {
      for (let k = 0; k <= 8; k++) {
        const t = k / 8
        const x = Math.round(xa + (xb - xa) * t)
        const z = Math.round(dir * zSpring * (1 - t))
        const y = vaultH(z, opt) - 1
        api.box(x, y, z, x, y, z, V.rib, 'replace', `${tag}/对角肋i${i}d${dir}k${k}`)
      }
    }
  }
  return api
}

/** 南北坡屋面 + 檐口 + 屋脊 + 木屋架（每条柱线一道） */
export function gableRoof(api, { x1, x2, zEave = 19, yEave = 70, yRidge = 86, trussY = 72, pierLines, tag = '屋面' }) {
  const roofH = (z) => Math.round(yRidge - (yRidge - yEave) * (Math.min(1, Math.abs(z) / zEave)))
  for (const s of [1, -1]) {
    const side = s > 0 ? 'S' : 'N'
    let rs = 0, prev = roofH(0)
    const segs = []
    for (let z = 1; z <= zEave + 1; z++) {
      const hv = z <= zEave ? roofH(z) : null
      if (hv !== prev) { segs.push({ z1: rs, z2: z - 1, y: prev }); rs = z; prev = hv }
    }
    for (const seg of segs) {
      const a = s > 0 ? seg.z1 : -seg.z2
      const b = s > 0 ? seg.z2 : -seg.z1
      api.box(x1 - 1, seg.y, a, x2 + 1, seg.y + 1, b, V.roof, 'replace', `${tag}${side}/坡y${seg.y}`)
    }
    api.box(x1 - 1, yEave - 1, s * zEave, x2 + 1, yEave, s * (zEave + 1), V.roofTrim, 'replace', `${tag}${side}/檐口`)
  }
  api.box(x1 - 1, yRidge, -1, x2 + 1, yRidge + 1, 1, V.roofTrim, 'replace', `${tag}/屋脊`)
  api.box(x1 - 1, yRidge - 1, 0, x2 + 1, yRidge - 1, 0, V.roof, 'replace', `${tag}/脊瓦`)
  for (const xi of pierLines) {
    api.box(xi, trussY, -17, xi, trussY, 17, V.beam, 'replace', `${tag}/横梁x${xi}`)
    api.box(xi, trussY + 1, 0, xi, trussY + 6, 0, V.beam, 'replace', `${tag}/中柱x${xi}`)
    for (let k = 0; k < 4; k++) {
      const zz = 4 + k * 4
      const yy = trussY + 1 + k
      api.box(xi, yy, zz, xi, yy, zz, V.strut, 'replace', `${tag}/斜撑x${xi}k${k}`)
      api.box(xi, yy, -zz, xi, yy, -zz, V.strut, 'replace', `${tag}/斜撑x${xi}k${k}n`)
    }
  }
  return api
}

/** 高窗带（z=±(zIn..zOut)），每开间一个尖券彩窗 + 石中梃横档 */
export function clerestory(api, { x1, x2, zIn, zOut, ySpring = 48, yTop = 58, yApex = 64, style, tag = '高窗' }) {
  api.box(x1, ySpring - 4, zIn, x2, yApex - 2, zOut, V.vault, 'keep', `${tag}/墙`)
  const q = (xa, xb) => {
    const cx = Math.round((xa + xb) / 2)
    const halfSpan = Math.floor((xb - xa) / 2)
    api.box(xa, ySpring, zIn, xb, yTop, zOut, 'air', 'replace', `${tag}/洞`)
    const hwAt = (y) => Math.max(0, Math.round(halfSpan * Math.pow(1 - (y - (yTop + 1)) / (yApex - yTop - 1), 0.62) * 2) / 2)
    let s0 = yTop + 1, prev = hwAt(yTop + 1)
    for (let y = yTop + 2; y <= yApex + 1; y++) {
      const hv = y <= yApex ? hwAt(y) : null
      if (hv !== prev) {
        api.box(cx - Math.round(prev), s0, zIn, cx + Math.round(prev), y - 1, zOut, 'air', 'replace', `${tag}/券`)
        s0 = y; prev = hv
      }
    }
    api.box(xa, ySpring, zIn, xb, ySpring + 3, zOut, style[0], 'replace', `${tag}/玻下`)
    api.box(xa, ySpring + 4, zIn, xb, ySpring + 7, zOut, style[1], 'replace', `${tag}/玻中`)
    api.box(xa, ySpring + 8, zIn, xb, yTop, zOut, style[2], 'replace', `${tag}/玻上`)
    api.box(cx, ySpring, zIn, cx, yTop, zOut, V.rib, 'replace', `${tag}/中梃`)
    api.box(xa, ySpring + 4, zIn, xb, ySpring + 4, zOut, V.rib, 'replace', `${tag}/横档`)
  }
  return { eachBay: q }
}
