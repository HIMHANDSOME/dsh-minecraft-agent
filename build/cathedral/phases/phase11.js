/**
 * PHASE 11 —— 耳堂 / 十字交叉部（transept）
 *
 * building.md §1.1 C 区：x=155..189，横向至 z=±78；§2：南北耳堂、大型花窗；
 * 北耳堂蓝青淡蓝，南耳堂红橙黄。
 *
 * 几何（相对坐标）：
 *   耳堂外包 x=155..189（墙厚 4），z=∓79..79；
 *   十字交叉部 |z|<=53 处东西两侧不设墙 —— 那里是通向中殿与唱诗班的开口；
 *   下部墙 y=0..47，高窗层 y=48..62；南北端墙各开一扇 19 格宽大型尖券花窗；
 *   屋顶为南北向山墙屋顶：x=155/189 檐口 y=62 → x=172 屋脊 y=80。
 *
 * 前置：PHASE 2 台地只到 z=±64，耳堂要伸到 ±79，故本阶段自带台地外扩。
 * 注意：PHASE 9 在柱线 x=155 处有扶壁塔（x=151..159, z=58..66），
 *       外扩清场从 z=67 起，避免把它挖掉。
 */
import { createPlan, AXIS } from '../layout.js'
import { bundlePier } from '../pier.js'

const M = {
  wall: 'stone_bricks',
  trim: 'polished_deepslate',
  base: 'andesite',
  mullion: 'polished_andesite',
  roof: 'deepslate_tiles',
  roofTrim: 'polished_deepslate',
}

const X1 = 155, X2 = 189
const WT = 4
const ZEND = 79
const H_LOWER = 47
const H_CLER = 62
const RIDGE_Y = 80
const NAVE_OPEN_HALF = 53
const PLAT_Z = 84

/** 大型尖券花窗（含石窗格）；窗在 zA..zB 这层墙里 */
function bigWindow(api, xa, xb, zA, zB, { glassMain, glassAlt, glassTop, tag }) {
  const cx = Math.round((xa + xb) / 2)
  const halfSpan = Math.floor((xb - xa) / 2)
  api.box(xa, 14, zA, xb, 46, zB, 'air', 'replace', `${tag}/窗身`)
  const hwAt = (y) => Math.max(0, Math.round(halfSpan * Math.pow(1 - (y - 47) / 12, 0.62) * 2) / 2)
  let s0 = 47, prev = hwAt(47)
  for (let y = 48; y <= 59; y++) {
    const hv = y <= 58 ? hwAt(y) : null
    if (hv !== prev) {
      api.box(cx - Math.round(prev), s0, zA, cx + Math.round(prev), y - 1, zB, 'air', 'replace', `${tag}/窗券`)
      s0 = y; prev = hv
    }
  }
  api.box(xa, 14, zA, xb, 24, zB, glassMain, 'replace', `${tag}/玻下`)
  api.box(xa, 25, zA, xb, 35, zB, glassAlt, 'replace', `${tag}/玻中`)
  api.box(xa, 36, zA, xb, 46, zB, glassTop, 'replace', `${tag}/玻上`)
  const q = Math.round((xb - xa) / 4)
  for (const mx of [xa + q, cx, xb - q]) {
    api.box(mx, 14, zA, mx, 46, zB, M.mullion, 'replace', `${tag}/中梃${mx}`)
  }
  api.box(xa, 25, zA, xb, 25, zB, M.mullion, 'replace', `${tag}/横档1`)
  api.box(xa, 36, zA, xb, 36, zB, M.mullion, 'replace', `${tag}/横档2`)
  api.box(xa - 2, 12, zA - 1, xb + 2, 13, zB + 1, M.trim, 'replace', `${tag}/窗台`)
  api.box(xa - 2, 58, zA - 1, xb + 2, 60, zB + 1, M.trim, 'replace', `${tag}/窗楣`)
}

export function build({ site }) {
  const api = createPlan(11)

  // =============================================================== 1. 台地外扩
  for (const s of [1, -1]) {
    const zs = s > 0 ? 67 : -PLAT_Z
    const ze = s > 0 ? PLAT_Z : -67
    const tag = s > 0 ? '南' : '北'
    api.box(155, -80, zs, 194, -1, ze, 'stone', 'replace', `外扩${tag}/实心基础`)
    // 清场只在平台范围内（z 不含 65..66，那里有 PHASE 9 的扶壁塔）
    api.box(155, 1, zs, 194, 34, ze, 'air', 'replace', `外扩${tag}/清场`)
    api.box(155, 0, zs, 194, 0, ze, M.wall, 'replace', `外扩${tag}/地坪`)
    // 补上 z=65..66（避开 x=151..159 的扶壁塔）
    const zs2 = s > 0 ? 65 : -66
    const ze2 = s > 0 ? 66 : -65
    api.box(160, -80, zs2, 194, -1, ze2, 'stone', 'replace', `外扩${tag}/基础补`)
    api.box(160, 1, zs2, 194, 34, ze2, 'air', 'replace', `外扩${tag}/清场补`)
    api.box(160, 0, zs2, 194, 0, ze2, M.wall, 'replace', `外扩${tag}/地坪补`)
  }

  // =============================================================== 2. 四面墙
  api.box(X1, 0, -ZEND, X2, H_CLER, -ZEND + WT - 1, M.wall, 'replace', '耳堂/北端墙')
  api.box(X1, 0, ZEND - WT + 1, X2, H_CLER, ZEND, M.wall, 'replace', '耳堂/南端墙')
  api.box(X1, 0, -ZEND, X1 + WT - 1, H_CLER, ZEND, M.wall, 'replace', '耳堂/西墙')
  api.box(X2 - WT + 1, 0, -ZEND, X2, H_CLER, ZEND, M.wall, 'replace', '耳堂/东墙')
  // 开口只在"柱与柱之间"掏：柱线上的束柱（x=155 的中殿末柱、x=186 的交叉柱）
  // 必须保留，否则中殿最后一道柱会被墙与开口一起吃掉（已实测踩过）。
  const OPEN_SEGS = [[-14, 14], [22, 27], [-27, -22], [35, 40], [-40, -35], [48, NAVE_OPEN_HALF], [-NAVE_OPEN_HALF, -48]]
  for (const [za, zb] of OPEN_SEGS) {
    api.box(X1, 1, za, X1 + WT - 1, H_LOWER, zb, 'air', 'replace', `耳堂/通中殿开口${za}_${zb}`)
    api.box(X2 - WT + 1, 1, za, X2, H_LOWER, zb, 'air', 'replace', `耳堂/通唱诗班开口${za}_${zb}`)
  }
  // 墙脚只做一圈（不是一整块实心板，否则会铺满耳堂内部）
  api.box(X1 - 1, 0, -ZEND - 1, X2 + 1, 2, -ZEND + WT, M.base, 'replace', '耳堂/墙脚N')
  api.box(X1 - 1, 0, ZEND - WT + 1, X2 + 1, 2, ZEND + 1, M.base, 'replace', '耳堂/墙脚S')
  // 东西墙脚同样只在"有墙/有柱"的 z 段上做，否则会横在通中殿的门洞中间（实测踩过）
  const PLINTH_SEGS = [[15, 21], [-21, -15], [28, 34], [-34, -28], [41, 47], [-47, -41], [54, ZEND], [-ZEND, -54]]
  for (const [za, zb] of PLINTH_SEGS) {
    api.box(X1 - 1, 0, za, X1 + WT, 2, zb, M.base, 'replace', `耳堂/墙脚W${za}_${zb}`)
    api.box(X2 - WT + 1, 0, za, X2 + 1, 2, zb, M.base, 'replace', `耳堂/墙脚E${za}_${zb}`)
  }
  api.box(X1, 45, -ZEND, X2, 46, ZEND, M.trim, 'replace', '耳堂/檐下束带')

  // =============================================================== 3. 南北端墙大型花窗
  bigWindow(api, 163, 181, -ZEND, -ZEND + WT - 1, {
    glassMain: 'light_blue_stained_glass', glassAlt: 'cyan_stained_glass', glassTop: 'blue_stained_glass', tag: '耳堂/北花窗',
  })
  bigWindow(api, 163, 181, ZEND - WT + 1, ZEND, {
    glassMain: 'red_stained_glass', glassAlt: 'orange_stained_glass', glassTop: 'yellow_stained_glass', tag: '耳堂/南花窗',
  })

  // =============================================================== 4. 耳堂臂侧窗
  for (const s of [1, -1]) {
    for (const wz of [s * 66, s * 72]) {
      for (const [wx, wallTag] of [[X1, '西'], [X2 - WT + 1, '东']]) {
        api.box(wx, 20, wz - 3, wx + WT - 1, 34, wz + 3, s > 0 ? 'red_stained_glass' : 'blue_stained_glass', 'replace', `耳堂/侧玻${wallTag}z${wz}`)
        api.box(wx, 28, wz - 3, wx + WT - 1, 28, wz + 3, M.mullion, 'replace', `耳堂/侧窗横档${wallTag}z${wz}`)
      }
    }
  }

  // =============================================================== 5. 十字交叉柱（东侧 x=189）
  for (const z of [AXIS.Z_NAVE_PIER, -AXIS.Z_NAVE_PIER]) bundlePier(api, X2 - 3, z, 42)
  for (const z of [AXIS.Z_AISLE_INNER, -AXIS.Z_AISLE_INNER, AXIS.Z_AISLE_OUTER, -AXIS.Z_AISLE_OUTER]) bundlePier(api, X2 - 3, z, 36)

  // =============================================================== 6. 南北向山墙屋顶
  {
    const xMid = (X1 + X2) / 2
    const roofH = (x) => Math.round(RIDGE_Y - (RIDGE_Y - H_CLER) * (Math.abs(x - xMid) / (xMid - X1)))
    for (const [xa, xb, side] of [[X1, xMid, '西坡'], [xMid, X2, '东坡']]) {
      let rs = xa, prev = roofH(xa)
      const segs = []
      for (let x = xa + 1; x <= xb + 1; x++) {
        const hv = x <= xb ? roofH(x) : null
        if (hv !== prev) { segs.push({ x1: rs, x2: x - 1, y: prev }); rs = x; prev = hv }
      }
      for (const seg of segs) {
        api.box(seg.x1, seg.y, -ZEND, seg.x2, seg.y + 1, ZEND, M.roof, 'replace', `耳堂/${side}y${seg.y}`)
      }
    }
    api.box(Math.round(xMid) - 1, RIDGE_Y, -ZEND, Math.round(xMid) + 1, RIDGE_Y + 1, ZEND, M.roofTrim, 'replace', '耳堂/屋脊')
    // 端部山墙（把端墙与坡屋面之间封住），按坡面高度合并成段
    for (const [za, zb, tag] of [[-ZEND, -ZEND + WT - 1, '北'], [ZEND - WT + 1, ZEND, '南']]) {
      let rs = X1, prevTop = roofH(X1)
      const segs = []
      for (let x = X1 + 1; x <= X2 + 1; x++) {
        const hv = x <= X2 ? roofH(x) : null
        if (hv !== prevTop) { segs.push({ x1: rs, x2: x - 1, top: prevTop }); rs = x; prevTop = hv }
      }
      for (const seg of segs) {
        if (seg.top <= H_CLER) continue
        api.box(seg.x1, H_CLER + 1, za, seg.x2, seg.top, zb, M.wall, 'replace', `耳堂/山墙${tag}`)
      }
    }
  }

  return api.ops
}
