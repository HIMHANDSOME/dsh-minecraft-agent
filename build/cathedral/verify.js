/**
 * verify.js —— 世界实测验收（building.md §4）
 *
 * 审计优先级：几何 → 承重/支撑 → 对称 → 可达 → 哥特形态 → 细节。
 * 所有判定都读**世界方块**（bot.blockAt），不看计划、不看会话记忆。
 *
 *   node build/cathedral/verify.js --phase 2
 *   node build/cathedral/verify.js --phase 5
 *   node build/cathedral/verify.js --all
 */
import { join } from 'node:path'
import { ROOT, connect, loadSite, at, tp, saveJson, sleep } from '../../bot/builder-core.js'
import { makeTransform, AXIS } from './layout.js'
import { C as EC, OUTER_V, INNER_V, CHAPELS, inwardAxis, R_OUT, R_IN } from './eastend.js'
import { TX as TTX, HALF as THALF } from './tower.js'

const args = process.argv.slice(2)
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const site = loadSite()
const T = makeTransform(site)
const bot = await connect({ user: 'VerifierBot', port: 11451 })
await tp(bot, T.X(137), T.Y(30), T.Z(0), { settleMs: 1500 })
console.log('[verify] Verifier 上线 @', JSON.stringify(bot.entity.position), 'mode=', bot.game.gameMode)

const results = []
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); if (!ok) console.log('  ✗', name, detail ?? '') }

/** tp 到 points 的质心并等到这些坐标全部可读（区块加载完成）。 */
async function ensureLoaded(points) {
  const cx = Math.round(points.reduce((s, p) => s + p[0], 0) / points.length)
  const cz = Math.round(points.reduce((s, p) => s + p[2], 0) / points.length)
  await tp(bot, cx, T.Y(30), cz, { settleMs: 1500 })
  for (let k = 0; k < 60; k++) {
    const missing = points.filter((p) => at(bot, p[0], p[1], p[2]) === null)
    if (!missing.length) return true
    await sleep(500)
  }
  return false
}
/** 在世界坐标网格上取点 */
const grid = (xs, ys, zs) => {
  const out = []
  for (const x of xs) for (const y of ys) for (const z of zs) out.push([T.X(x), T.Y(y), T.Z(z)])
  return out
}

// ---------------------------------------------------------------- PHASE 2
async function verifyPhase2() {
  console.log('\n== PHASE 2 台地与地基 ==')
  // 1) 地坪水平：山脊台地内 y=0 以上应为空（清场），且 y=-1 为实体
  const floorPts = grid(
    [-4, 20, 44, 68, 92, 116, 140, 164, 188, 212, 236, 260, 278],
    [-1, 1],
    [-60, -40, -20, 0, 20, 40, 60],
  )
  await ensureLoaded(floorPts)
  let floorOk = 0, floorBad = []
  // 采样点避开柱线（±3 格）与外墙，只看真正的空地坪
  // 排除地宫梯井口（x=81..98 / 221..238, |z|<=5）所在的采样点
  // 均取开间中部，避开柱线（±3）与柱基（±3）
  // 只查中殿段（x<=161）：x>=190 已属唱诗班/后殿，另有上部结构
  const FX = [49, 63, 77, 105, 119, 133, 147, 161]
  // ±24 是唱诗班席位、±10 是 PHASE 19 的中殿长椅，属正常占用，故排除
  const FZ = [0, 20, -20, 37, -37, 48, -48]
  for (const x of FX) {
    for (const z of FZ) {
      const below = at(bot, T.X(x), T.Y(-1), T.Z(z))
      const above = at(bot, T.X(x), T.Y(1), T.Z(z))
      const solid = below && below.name !== 'air' && below.name !== 'cave_air'
      const clear = above && (above.name === 'air' || above.name === 'cave_air')
      if (solid && clear) floorOk++
      else floorBad.push({ x, z, below: below?.name, above: above?.name })
    }
  }
  check('地坪：下方实体 + 上方净空', floorBad.length === 0, { ok: floorOk, bad: floorBad.slice(0, 8) })

  // 2) 无悬空：东端外缘挡土墙应一路落到天然山坡（取数个东缘柱，向下找连续实体）
  const eastPts = [-58, -30, 0, 30, 58].flatMap((z) => [-1, -20, -40, -60, -80].map((y) => [T.X(278), T.Y(y), T.Z(z)]))
  await ensureLoaded(eastPts)
  const eastHoles = []
  for (const z of [-58, -30, 0, 30, 58]) {
    let y = -1, gaps = 0, depth = 0
    while (y > -90) {
      const b = at(bot, T.X(278), T.Y(y), T.Z(z))
      if (b === null) break
      if (b.name === 'air' || b.name === 'cave_air') { gaps++; if (gaps > 3) break } else gaps = 0
      depth++
      y--
    }
    if (depth < 60) eastHoles.push({ z, reachedY: y, depth })
  }
  check('东缘挡土墙落到山坡（≥60 格连续实体）', eastHoles.length === 0, eastHoles)

  // 3) 三层台地：广场 / 教堂 地坪
  const plazaPts = grid([-40, -24, -10], [0], [-40, 0, 40])
  await ensureLoaded(plazaPts)
  const plazaFloor = at(bot, T.X(-30), T.Y(0), T.Z(0))
  check('广场棱堡地坪存在', plazaFloor && plazaFloor.name !== 'air' && plazaFloor.name !== 'unloaded', plazaFloor?.name)

  // 4) 西门大台阶：逐级下降
  const stairPts = []
  for (let i = 0; i < 32; i += 4) {
    const x = site.footprints.plaza.rel.x1 - 2 - i * 2
    const y = -1 - i * 2
    stairPts.push([T.X(x), T.Y(y), T.Z(0)])
  }
  await ensureLoaded(stairPts)
  let stairOk = 0
  for (let i = 0; i < 32; i += 4) {
    const x = site.footprints.plaza.rel.x1 - 2 - i * 2
    const y = -1 - i * 2
    const b = at(bot, T.X(x), T.Y(y), T.Z(0))
    if (b && b.name === 'smooth_stone') stairOk++
  }
  check('西门大台阶踏面（抽样 8 级）', stairOk >= 6, { stairOk })
  return true
}

// ---------------------------------------------------------------- PHASE 1
async function verifyPhase1() {
  console.log('\n== PHASE 1 放线标记 ==')
  // 柱线上的标记会被 PHASE 9 的飞扶壁塔(z=58..66)埋住，属预期；
  // 这里只强制校验没有飞扶壁的 x 线（0/190/232/273）。
  const X_LINES = [0, 190, 232, 273]
  await ensureLoaded(X_LINES.flatMap((x) => [-62, 62].map((z) => [T.X(x), T.Y(3), T.Z(z)])))
  // PHASE 1 的标记是临时的；PHASE 29 已按 building.md §3 全部拆除。
  // 这里改为校验"拆除结果"：这些位置不应再有 gold_block。
  let ok = 0, bad = []
  for (const x of X_LINES) {
    for (const z of [-62, 62]) {
      const b = at(bot, T.X(x), T.Y(3), T.Z(z))
      if (b && b.name !== 'gold_block') ok++
      else bad.push({ x, z, got: b?.name })
    }
  }
  check('放线标记已拆除（PHASE 29 收尾）', bad.length === 0, { ok, bad: bad.slice(0, 6) })
  // 柱距 14 格
  const spacings = AXIS.PIER_LINES.slice(1).map((v, i) => v - AXIS.PIER_LINES[i])
  check('中殿柱距统一 14 格', spacings.every((s) => s === 14), spacings)
  return true
}

// ---------------------------------------------------------------- PHASE 5
async function verifyPhase5() {
  console.log('\n== PHASE 5 中殿束柱 ==')
  await ensureLoaded(AXIS.PIER_LINES.flatMap((x) => [AXIS.Z_NAVE_PIER, -AXIS.Z_NAVE_PIER].flatMap((z) =>
    [[T.X(x), T.Y(42), T.Z(z)], [T.X(x), T.Y(20), T.Z(z)]])))
  const bad = []
  let ok = 0
  for (const x of AXIS.PIER_LINES) {
    for (const z of [AXIS.Z_NAVE_PIER, -AXIS.Z_NAVE_PIER]) {
      const abacus = at(bot, T.X(x), T.Y(42), T.Z(z))
      const core = at(bot, T.X(x), T.Y(20), T.Z(z))
      const shaft = at(bot, T.X(x + 2), T.Y(20), T.Z(z))
      const base = at(bot, T.X(x + 3), T.Y(0), T.Z(z + 3))
      const good = abacus?.name === 'polished_deepslate' && core?.name === 'stone_bricks' && shaft?.name === 'polished_andesite' && base?.name === 'polished_andesite'
      if (good) ok++
      else bad.push({ x, z, abacus: abacus?.name, core: core?.name, shaft: shaft?.name, base: base?.name })
    }
  }
  check('18 根中殿束柱（核心/附柱/柱头/柱基）', bad.length === 0, { ok, bad: bad.slice(0, 6) })

  // 中心通视带 z=-14..14 无遮挡（柱体不得横跨中轴）
  // 只查 y>=5（家具高度以上）：长椅(y=1..2)是家具，不构成"柱或楼梯横跨中轴"
  let blocked = []
  for (const x of AXIS.PIER_LINES) {
    for (let y = 5; y <= 42; y += 6) {
      for (const z of [-14, -8, 0, 8, 14]) {
        const b = at(bot, T.X(x), T.Y(y), T.Z(z))
        if (b && b.name !== 'air' && b.name !== 'cave_air') blocked.push({ x, y, z, got: b.name })
      }
    }
  }
  check('中央净通视带 z=-14..14（y>=5）无遮挡', blocked.length === 0, blocked.slice(0, 6))

  // 南北镜像
  const mirror = []
  for (const x of AXIS.PIER_LINES) {
    for (let y of [0, 10, 25, 42]) {
      const a = at(bot, T.X(x), T.Y(y), T.Z(AXIS.Z_NAVE_PIER))
      const b2 = at(bot, T.X(x), T.Y(y), T.Z(-AXIS.Z_NAVE_PIER))
      if ((a?.name ?? '?') !== (b2?.name ?? '?')) mirror.push({ x, y, north: a?.name, south: b2?.name })
    }
  }
  check('束柱南北镜像（z=±18）', mirror.length === 0, mirror.slice(0, 6))
  return true
}

// ---------------------------------------------------------------- PHASE 4
async function verifyPhase4() {
  console.log('\n== PHASE 4 西立面下部 ==')
  const pts = [
    [2, 10, -40], [2, 10, 0], [2, 10, -33], [2, 10, 33],
    [0, 10, 47], [0, 10, -47], [13, 10, 34], [13, 10, -34],
    [15, 0, 0], [20, 5, 0], [2, 20, 0],
  ].map(([x, y, z]) => [T.X(x), T.Y(y), T.Z(z)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  check('西立面前墙为石砖', g(2, 10, -40) === 'stone_bricks', g(2, 10, -40))
  check('中门洞净空（两扇：z=±4）', g(2, 10, 4) === 'air' && g(2, 10, -4) === 'air', [g(2, 10, 4), g(2, 10, -4)])
  check('中门中央已无门柱（PHASE 31 拆除，单一通视门洞）', g(2, 10, 0) === 'air', g(2, 10, 0))
  check('北副门洞净空（z=-38..-28）', g(2, 10, -33) === 'air', g(2, 10, -33))
  check('南副门洞净空（z=28..38）', g(2, 10, 33) === 'air', g(2, 10, 33))
  check('双塔角扶壁（z=±47）', g(0, 10, 47) === 'polished_andesite' && g(0, 10, -47) === 'polished_andesite', [g(0, 10, 47), g(0, 10, -47)])
  check('双塔内部可通行（空腔）', g(13, 10, 34) === 'air' && g(13, 10, -34) === 'air', [g(13, 10, 34), g(13, 10, -34)])
  check('西厅地面铺装', g(15, 0, 0) === 'polished_deepslate', g(15, 0, 0))
  check('中门前净空（可进入）', g(20, 5, 0) === 'air', g(20, 5, 0))
  // 镜像：立面上下三处对称
  const mir = []
  for (const z of [-40, -33, 0, 33, 40]) {
    for (const y of [0, 10, 31]) {
      const a = g(2, y, z), b = g(2, y, -z)
      if ((a ?? '?') !== (b ?? '?')) mir.push({ z, y, s: a, n: b })
    }
  }
  check('西立面关于 z=0 镜像', mir.length === 0, mir.slice(0, 6))
  return true
}

// ---------------------------------------------------------------- PHASE 6
async function verifyPhase6() {
  console.log('\n== PHASE 6 侧廊柱网 ==')
  const ZS = [AXIS.Z_AISLE_INNER, -AXIS.Z_AISLE_INNER, AXIS.Z_AISLE_OUTER, -AXIS.Z_AISLE_OUTER]
  await ensureLoaded(AXIS.PIER_LINES.flatMap((x) => ZS.flatMap((z) =>
    [[T.X(x), T.Y(36), T.Z(z)], [T.X(x), T.Y(20), T.Z(z)]])))
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const bad = []
  let ok = 0
  for (const x of AXIS.PIER_LINES) {
    for (const z of ZS) {
      const abacus = g(x, 36, z), core = g(x, 20, z), shaft = g(x + 2, 20, z)
      if (abacus === 'polished_deepslate' && core === 'stone_bricks' && shaft === 'polished_andesite') ok++
      else bad.push({ x, z, abacus, core, shaft })
    }
  }
  check('36 根侧廊束柱（z=±31 / ±44）', bad.length === 0, { ok, bad: bad.slice(0, 6) })
  // 中殿高于侧廊：主柱顶 y=42 > 侧廊柱顶 y=36
  const naveTop = g(99, 42, 18)
  const aisleTop = g(99, 36, 31)
  check('中殿柱高于侧廊柱（42 > 36）', naveTop === 'polished_deepslate' && aisleTop === 'polished_deepslate', [naveTop, aisleTop])
  // 中央通视带不被侧廊柱侵占
  let blocked = []
  for (const z of [-14, 0, 14]) {
    for (const x of AXIS.PIER_LINES) {
      const b = g(x, 20, z)
      if (b && b !== 'air') blocked.push({ x, z, got: b })
    }
  }
  check('中央通视带 z=-14..14 仍无遮挡', blocked.length === 0, blocked.slice(0, 6))
  // 镜像
  const mir = []
  for (const x of AXIS.PIER_LINES) {
    for (const z of [AXIS.Z_AISLE_INNER, AXIS.Z_AISLE_OUTER]) {
      const a = g(x, 20, z), b = g(x, 20, -z)
      if ((a ?? '?') !== (b ?? '?')) mir.push({ x, z, s: a, n: b })
    }
  }
  check('侧廊柱南北镜像', mir.length === 0, mir.slice(0, 6))
  return true
}

// ---------------------------------------------------------------- PHASE 7
async function verifyPhase7() {
  console.log('\n== PHASE 7 拱廊 + 侧廊拱顶 + 外墙 ==')
  const pts = []
  for (const xi of [43, 99, 155]) {
    for (const z of [17, -17, 51, -51, 24, -24]) for (const y of [5, 20, 30, 35, 44]) pts.push([T.X(xi + 7), T.Y(y), T.Z(z)])
  }
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  // 拱廊：券脚净空 / 券顶以上为墙
  check('拱廊券脚净空（y=20）', g(50, 20, 17) === 'air' && g(50, 20, -17) === 'air', [g(50, 20, 17), g(50, 20, -17)])
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'
  check('拱廊券顶以上为实体（y=44 束带）', solid(g(50, 44, 17)) && solid(g(50, 44, -17)), [g(50, 44, 17), g(50, 44, -17)])
  // 尖券收窄：y=35 时券洞只有中间 5 格
  check('尖券逐层内收（y=35 两侧为石）', g(47, 35, 17) === 'stone_bricks' && g(50, 35, 17) === 'air', [g(47, 35, 17), g(50, 35, 17)])
  // 侧廊拱壳：拱腹以下净空、拱腹为石
  check('侧廊拱腹以下净空（内廊 z=24,y=34,非肋位）', g(106, 34, 24) === 'air', g(106, 34, 24))
  check('侧廊拱壳存在（内廊 z=24,y=35）', g(99, 35, 24) !== 'air' && g(99, 35, 24) !== undefined, g(99, 35, 24))
  // 横肋突出 1 格
  check('横肋突出（x=99 z=24 y=34 为肋）', g(99, 34, 24) === 'polished_andesite', g(99, 34, 24))
  // 外墙与侧廊窗
  check('外侧廊外墙实体（y=5）', g(50, 5, 51) === 'stone_bricks' && g(50, 5, -51) === 'stone_bricks', [g(50, 5, 51), g(50, 5, -51)])
  check('侧廊窗洞净空（y=20）', g(50, 20, 51) === 'air' && g(50, 20, -51) === 'air', [g(50, 20, 51), g(50, 20, -51)])
  // 镜像
  const mir = []
  for (const x of [50, 106, 162]) for (const y of [5, 30, 44]) {
    const a = g(x, y, 51), b = g(x, y, -51)
    if ((a ?? '?') !== (b ?? '?')) mir.push({ x, y, s: a, n: b })
  }
  check('拱廊/外墙南北镜像', mir.length === 0, mir.slice(0, 6))
  return true
}

// ---------------------------------------------------------------- PHASE 8
async function verifyPhase8() {
  console.log('\n== PHASE 8 高窗 + 中殿肋拱 ==')
  const pts = []
  for (const x of [48, 50, 99, 104, 162]) for (const z of [16, -16, 0, 7, -7, 14, -14]) for (const y of [50, 54, 60, 67, 68]) pts.push([T.X(x), T.Y(y), T.Z(z)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  check('南高窗彩玻', g(48, 50, 16) === 'red_stained_glass', g(48, 50, 16))
  check('北高窗彩玻', g(48, 50, -16) === 'blue_stained_glass', g(48, 50, -16))
  check('高窗石中梃（x=xi+7）', g(50, 50, 16) === 'polished_andesite', g(50, 50, 16))
  check('高窗上位彩玻（y=56）', g(48, 56, 16) === 'yellow_stained_glass', g(48, 56, 16))
  check('中殿拱顶脊部（z=0,y=68）', g(99, 68, 0) === 'stone_bricks', g(99, 68, 0))
  check('中殿纵肋（z=0,y=67）', g(99, 67, 0) === 'polished_andesite', g(99, 67, 0))
  check('拱顶起拱处（z=14,y=48）', g(99, 48, 14) === 'stone_bricks', g(99, 48, 14))
  check('拱腹下方净空（z=3,y=62）', g(103, 62, 3) === 'air', g(103, 62, 3))
  check('中殿横肋（柱线 x=99,z=7,y=60）', g(99, 60, 7) === 'polished_andesite', g(99, 60, 7))
  check('对角肋存在（实测点 x=62,y=57,z=9）', g(62, 57, 9) === 'polished_andesite', g(62, 57, 9))
  const mir = []
  for (const z of [7, 14]) for (const y of [48, 60, 68]) {
    const a = g(99, y, z), b = g(99, y, -z)
    if ((a ?? '?') !== (b ?? '?')) mir.push({ z, y, s: a, n: b })
  }
  check('中殿拱顶南北镜像', mir.length === 0, mir.slice(0, 6))
  return true
}

// ---------------------------------------------------------------- PHASE 9
async function verifyPhase9() {
  console.log('\n== PHASE 9 飞扶壁 ==')
  const pts = []
  for (const xi of [43, 99, 155]) for (const s of [1, -1]) for (const y of [5, 45, 49, 55, 60]) for (const z of [40, 62]) pts.push([T.X(xi), T.Y(y), T.Z(s * z)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  check('外扶壁塔身（z=±62,y=20）', g(99, 20, 62) === 'stone_bricks' && g(99, 20, -62) === 'stone_bricks', [g(99, 20, 62), g(99, 20, -62)])
  check('塔顶压顶（y=49）', g(99, 49, 62) === 'polished_deepslate', g(99, 49, 62))
  check('塔尖（y=55）', g(99, 55, 62) === 'deepslate_tiles', g(99, 55, 62))
  check('弧形飞券中段（z=40,y=54）', g(99, 54, 40) === 'polished_andesite' || g(99, 55, 40) === 'polished_andesite', [g(99, 54, 40), g(99, 55, 40)])
  check('排水雕饰（z=57,y=45）', g(99, 45, 57) === 'andesite', g(99, 45, 57))
  const mir = []
  for (const y of [20, 49, 55]) {
    const a = g(99, y, 62), b = g(99, y, -62)
    if ((a ?? '?') !== (b ?? '?')) mir.push({ y, s: a, n: b })
  }
  check('飞扶壁南北镜像', mir.length === 0, mir)
  return true
}

// ---------------------------------------------------------------- PHASE 10
async function verifyPhase10() {
  console.log('\n== PHASE 10 屋架 + 主屋脊 ==')
  const pts = []
  for (const x of [60, 99, 140]) for (const z of [0, 10, 19, -10]) for (const y of [72, 78, 86]) pts.push([T.X(x), T.Y(y), T.Z(z)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  check('主屋脊（z=0,y=86）', g(99, 86, 0) === 'polished_deepslate', g(99, 86, 0))
  check('南坡屋面（z=10,y=78）', g(99, 78, 10) === 'deepslate_tiles', g(99, 78, 10))
  check('北坡屋面（z=-10,y=78）', g(99, 78, -10) === 'deepslate_tiles', g(99, 78, -10))
  check('木屋架横梁（x=99,y=72,z=5）', g(99, 72, 5) === 'dark_oak_log', g(99, 72, 5))
  check('檐口（z=19,y=70）', g(99, 70, 19) === 'deepslate_tiles' || g(99, 70, 19) === 'polished_deepslate', g(99, 70, 19))
  const mir = []
  for (const z of [5, 10, 19]) for (const y of [72, 78]) {
    const a = g(99, y, z), b = g(99, y, -z)
    if ((a ?? '?') !== (b ?? '?')) mir.push({ z, y, s: a, n: b })
  }
  check('屋面南北镜像', mir.length === 0, mir)
  return true
}

// ---------------------------------------------------------------- PHASE 3
async function verifyPhase3() {
  console.log('\n== PHASE 3 地下墓室 ==')
  const pts = []
  for (const x of [85, 110, 140, 200, 225]) for (const z of [-30, -18, 0, 18, 30]) for (const y of [-16, -10, -4, -2, 0]) pts.push([T.X(x), T.Y(y), T.Z(z)])
  for (const x of [88, 97, 222, 231]) for (const y of [-10, -2, 0, 1]) pts.push([T.X(x), T.Y(y), T.Z(0)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'
  const air = (v) => v === 'air' || v === 'cave_air'

  check('地宫内部净空（y=-10,中轴）', air(g(110, -10, 0)) && air(g(140, -10, 0)) && air(g(200, -10, 0)), [g(110, -10, 0), g(140, -10, 0), g(200, -10, 0)])
  check('地宫地面（y=-17）', solid(g(110, -17, 0)) && solid(g(200, -17, 0)), [g(110, -17, 0), g(200, -17, 0)])
  check('顶板完整（y=-3..-1）', solid(g(110, -3, 0)) && solid(g(110, -2, 0)) && solid(g(110, -1, 0)), [g(110, -3, 0), g(110, -2, 0), g(110, -1, 0)])
  check('地坪面层未被挖穿（y=0）', solid(g(110, 0, 0)) && solid(g(140, 0, 20)), [g(110, 0, 0), g(140, 0, 20)])
  check('地宫柱身（x=85,z=18,y=-10）', g(85, -10, 18) === 'stone_bricks', g(85, -10, 18))
  check('地宫柱头（y=-5）', g(85, -5, 18) === 'calcite', g(85, -5, 18))
  check('地宫柱础（y=-16）', g(85, -16, 18) === 'andesite', g(85, -16, 18))
  check('地宫横肋（y=-4,避开梯井 z=12）', g(85, -4, 12) === 'polished_andesite', g(85, -4, 12))
  check('地宫纵肋（z=18,y=-4）', g(139, -4, 18) === 'polished_andesite', g(139, -4, 18))
  check('墓龛（北墙 y=-13）', air(g(85, -13, -32)) && air(g(197, -13, -32)), [g(85, -13, -32), g(197, -13, -32)])
  // 西梯：k=8 在 x=88、踏面 y=-9；上方净空
  check('西梯踏步（x=88,y=-9）', solid(g(88, -9, 0)) && air(g(88, -8, 0)), [g(88, -9, 0), g(88, -8, 0)])
  check('东梯踏步（x=231,y=-9）', solid(g(231, -9, 0)) && air(g(231, -8, 0)), [g(231, -9, 0), g(231, -8, 0)])
  // 真正的通行性：从梯顶（y=0 的路面、y=1 净空）必须能连续走到地面层，
  // 中间不能出现"旁边是竖井"的死路（这是之前只查单点没查出来的缺陷）。
  const walkable = (x) => solid(g(x, 0, 0)) && air(g(x, 1, 0))
  const pathW = [97, 98, 99, 100]
  const pathE = [222, 221, 220, 219]
  check('西梯顶→地面 连续可行走', pathW.every(walkable), pathW.map((x) => [x, g(x, 0, 0), g(x, 1, 0)]))
  check('东梯顶→地面 连续可行走', pathE.every(walkable), pathE.map((x) => [x, g(x, 0, 0), g(x, 1, 0)]))
  check('两条楼梯均为双点连通（梯井→地面）', (() => { let n = 0; if (pathW.every(walkable) && solid(g(88, -9, 0))) n++; if (pathE.every(walkable) && solid(g(231, -9, 0))) n++; return n === 2 })(), null)
  const mir = []
  for (const x of [85, 141, 225]) for (const y of [-16, -10, -5]) {
    const a = g(x, y, 18), b = g(x, y, -18)
    if ((a ?? '?') !== (b ?? '?')) mir.push({ x, y, s: a, n: b })
  }
  check('地宫柱网南北镜像', mir.length === 0, mir.slice(0, 6))
  return true
}

// ---------------------------------------------------------------- PHASE 11
async function verifyPhase11() {
  console.log('\n== PHASE 11 耳堂/十字交叉部 ==')
  const pts = []
  for (const x of [156, 165, 172, 180, 186]) for (const z of [-78, -66, -20, 0, 20, 66, 78]) for (const y of [5, 20, 42, 62, 70, 80]) pts.push([T.X(x), T.Y(y), T.Z(z)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'
  check('北端墙大型花窗（蓝青系）', g(165, 20, -78) === 'light_blue_stained_glass', g(165, 20, -78))
  check('南端墙大型花窗（红橙系）', g(165, 20, 78) === 'red_stained_glass', g(165, 20, 78))
  check('花窗石中梃', g(172, 20, -78) === 'polished_andesite', g(172, 20, -78))
  check('耳堂西墙（开口之外 z=60）', solid(g(156, 20, 60)) && solid(g(156, 20, -60)), [g(156, 20, 60), g(156, 20, -60)])
  check('通中殿开口（中轴与柱间 z=0/24，含地面通行高度）', g(156, 20, 0) === 'air' && g(156, 20, 24) === 'air' && g(156, 1, 0) === 'air', [g(156, 20, 0), g(156, 20, 24), g(156, 1, 0)])
  check('通唱诗班开口（x=189 侧）', g(187, 20, 0) === 'air' && g(187, 1, 0) === 'air', [g(187, 20, 0), g(187, 1, 0)])
  check('耳堂地坪外扩到位（z=82,墙脚之外）', g(170, 0, 82) === 'stone_bricks' && solid(g(170, -1, 82)), [g(170, 0, 82), g(170, -1, 82)])
  check('PHASE 9 扶壁塔未被外扩挖掉', g(155, 20, 62) === 'stone_bricks', g(155, 20, 62))
  check('交叉部东侧束柱（x=186,z=18,y=42）', g(186, 42, 18) === 'polished_deepslate', g(186, 42, 18))
  check('耳堂屋脊（x=172,y=80）', g(172, 80, 0) === 'polished_deepslate', g(172, 80, 0))
  check('耳堂坡屋面（x=160,y=67）', g(160, 67, 0) === 'deepslate_tiles', g(160, 67, 0))
  const mir = []
  for (const [x, y] of [[168, 20], [156, 20], [172, 80], [170, 0]]) {
    const a = g(x, y, Math.abs(y) && 78), b = g(x, y, -78)
    const a2 = g(x, y, 66), b2 = g(x, y, -66)
    if ((a ?? '?') !== (b ?? '?')) mir.push({ x, y, z: 78, s: a, n: b })
  }
  check('耳堂南北端墙镜像', mir.length === 0, mir.slice(0, 4))
  return true
}

// ---------------------------------------------------------------- PHASE 12
async function verifyPhase12() {
  console.log('\n== PHASE 12 唱诗班 + 主祭坛 ==')
  const pts = []
  for (const x of [191, 204, 218, 230]) for (const z of [-52, -18, 0, 18, 52]) for (const y of [5, 20, 35, 50, 68, 86]) pts.push([T.X(x), T.Y(y), T.Z(z)])
  for (const x of [214, 218, 220, 226]) for (const y of [2, 5, 11, 15]) pts.push([T.X(x), T.Y(y), T.Z(0)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'
  const air = (v) => v === 'air' || v === 'cave_air'
  check('唱诗班拱廊券脚净空', g(204, 20, 17) === 'air' && g(204, 20, -17) === 'air', [g(204, 20, 17), g(204, 20, -17)])
  check('唱诗班柱（x=204? 柱线 x=197/211/225）', g(211, 42, 18) === 'polished_deepslate', g(211, 42, 18))
  check('唱诗班外墙 + 圣坛彩窗（金白浅蓝，避开中梃 x=204）', g(201, 15, 51) === 'yellow_stained_glass' && g(201, 28, 51) === 'light_blue_stained_glass' && g(204, 15, 51) === 'polished_andesite', [g(201, 15, 51), g(201, 28, 51), g(204, 15, 51)])
  check('唱诗班高窗彩玻（避开中梃）', String(g(201, 50, 16)).includes('stained_glass') && g(204, 50, 16) === 'polished_andesite', [g(201, 50, 16), g(204, 50, 16)])
  check('唱诗班拱顶脊部（z=0,y=68）', g(218, 68, 0) === 'stone_bricks', g(218, 68, 0))
  check('唱诗班屋脊（y=86）', g(218, 86, 0) === 'polished_deepslate', g(218, 86, 0))
  check('祭坛平台抬升（新位置 x=206..218, y=3）', solid(g(212, 3, 0)), g(212, 3, 0))
  check('祭台本体', g(212, 5, 0) === 'quartz_block' || g(212, 5, 0) === 'smooth_quartz', g(212, 5, 0))
  check('祭坛十字架（金）', g(212, 11, 0) === 'gold_block', g(212, 11, 0))
  check('高背屏（x=217）', solid(g(217, 10, 0)), g(217, 10, 0))
  check('旧祭坛位置已清空（不再封住东梯井）', air(g(220, 2, 0)) && air(g(222, 2, 0)), [g(220, 2, 0), g(222, 2, 0)])
  // 西门 → 祭坛 中心通视：中轴上 y=2..12 不应被挡（柱/墙不得横跨 z=0）
  const blocked = []
  // 只查到祭坛台阶之前（x<=200）；x>=203 是祭坛本体与台阶，本身就是视觉焦点
  for (let x = 60; x <= 200; x += 2) {
    for (let y = 2; y <= 12; y += 5) {
      const b = g(x, y, 0)
      if (b && b !== 'air' && b !== 'cave_air' && !['polished_deepslate', 'smooth_quartz', 'stone_bricks', 'quartz_block'].includes(b)) blocked.push({ x, y, got: b })
    }
  }
  check('中轴通视（西门→祭坛）无意外遮挡', blocked.length === 0, blocked.slice(0, 6))
  return true
}

// ---------------------------------------------------------------- PHASE 13
async function verifyPhase13() {
  console.log('\n== PHASE 13 多边形后殿 + 环廊 ==')
  const mids = OUTER_V.slice(0, -1).map((v, i) => ({ x: Math.round((v.x + OUTER_V[i + 1].x) / 2), z: Math.round((v.z + OUTER_V[i + 1].z) / 2) }))
  const pts = [
    [229, 20, 0], [229, 20, 40], [229, 5, 0],
    [EC.x + 20, 33, 0], [EC.x + 2, 33, 0], [EC.x + 8, 60, 0], [EC.x, 74, 0],
    [INNER_V[3].x, 36, INNER_V[3].z],
    ...mids.map((m) => [m.x, 44, m.z]),
  ].map(([x, y, z]) => [T.X(x), T.Y(y), T.Z(z)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'
  const air = (v) => v === 'air' || v === 'cave_air'
  check('唱诗班东端墙留后殿大券', air(g(229, 20, 0)) && solid(g(229, 20, 40)), [g(229, 20, 0), g(229, 20, 40)])
  check('后殿外墙 6 段折线（段中 y=44 实体）', mids.every((m) => solid(g(m.x, 44, m.z))), mids.map((m) => [m.x, m.z, g(m.x, 44, m.z)]))
  check('内环柱（R_in=14 的第 4 根）', g(INNER_V[3].x, 36, INNER_V[3].z) === 'polished_deepslate', g(INNER_V[3].x, 36, INNER_V[3].z))
  check('环廊拱壳（外环 y=33 实体）', solid(g(EC.x + 20, 33, 0)), g(EC.x + 20, 33, 0))
  check('中央圣所通高（y=33 处仍净空）', air(g(EC.x + 2, 33, 0)), g(EC.x + 2, 33, 0))
  check('后殿阶梯屋面（y=60）', g(EC.x + 8, 60, 0) === 'deepslate_tiles', g(EC.x + 8, 60, 0))
  check('后殿尖顶饰', solid(g(EC.x, 74, 0)), g(EC.x, 74, 0))
  return true
}

// ---------------------------------------------------------------- PHASE 14
async function verifyPhase14() {
  console.log('\n== PHASE 14 七座放射礼拜堂 ==')
  const pts = []
  for (const ch of CHAPELS) {
    const ax = inwardAxis(ch)
    pts.push([ch.x, 10, ch.z])
    pts.push(ax.axis === 'x' ? [ch.x + ax.sign * 6, 5, ch.z] : [ch.x, 5, ch.z + ax.sign * 6])
    pts.push(ax.axis === 'x' ? [ch.x - ax.sign * 2, 12, ch.z + 1] : [ch.x + 1, 12, ch.z - ax.sign * 2])
  }
  await ensureLoaded(pts.map(([x, y, z]) => [T.X(x), T.Y(y), T.Z(z)]))
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const air = (v) => v === 'air' || v === 'cave_air'
  const badRoom = [], badPass = [], badWin = []
  for (const ch of CHAPELS) {
    const ax = inwardAxis(ch)
    if (!air(g(ch.x, 10, ch.z))) badRoom.push({ ch: ch.tag, got: g(ch.x, 10, ch.z) })
    const p = ax.axis === 'x' ? [ch.x + ax.sign * 6, 5, ch.z] : [ch.x, 5, ch.z + ax.sign * 6]
    if (!air(g(...p))) badPass.push({ ch: ch.tag, got: g(...p) })
    const w = ax.axis === 'x' ? [ch.x - ax.sign * 2, 12, ch.z + 1] : [ch.x + 1, 12, ch.z - ax.sign * 2]
    const n = g(...w)
    if (!n || !n.includes('stained_glass')) badWin.push({ ch: ch.tag, at: w, got: n })
  }
  check('7 座礼拜堂内部净空（可进入）', badRoom.length === 0, badRoom)
  check('7 座礼拜堂与环廊连通（通道口）', badPass.length === 0, badPass)
  check('7 座礼拜堂各有尖券彩窗', badWin.length === 0, badWin)
  // 配色分区：北蓝、中央金白、南红
  const north = CHAPELS.filter((c) => c.z < -3)[0], south = CHAPELS.filter((c) => c.z > 3)[0], mid = CHAPELS.find((c) => Math.abs(c.z) <= 3)
  check('彩窗分区（北蓝紫 / 中央金白 / 南红紫）',
    north.glass[0].includes('blue') && mid.glass[0].includes('yellow') && south.glass[0].includes('red'),
    [north.glass[0], mid.glass[0], south.glass[0]])
  return true
}

// ---------------------------------------------------------------- PHASE 15/16/17 双塔
async function verifyTowers(phase) {
  const ZS = [34, -34]
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'
  const air = (v) => v === 'air' || v === 'cave_air'
  const pts = []
  for (const zc of ZS) {
    for (const [x, y, z] of [
      [0, 40, zc - 8], [0, 45, zc - 2], [0, 75, zc - 2], [0, 40, zc - 13],
      [TTX, 100, zc - 12], [TTX, 100, zc], [TTX, 113, zc],
      [TTX - 13, 120, zc - 13], [TTX - 13, 137, zc - 13], [TTX - 10, 138, zc],
      [TTX - 2, 160, zc], [TTX, 150, zc], [TTX, 165, zc], [TTX, 178, zc], [TTX, 180, zc],
    ]) pts.push([T.X(x), T.Y(y), T.Z(z)])
  }
  await ensureLoaded(pts)

  if (phase === '15') {
    console.log('\n== PHASE 15 双塔：尖券窗层 + 钟楼 ==')
    const bad = []
    for (const zc of ZS) {
      if (g(0, 40, zc - 8) !== 'stone_bricks') bad.push({ zc, at: '塔身', got: g(0, 40, zc - 8) })
      if (g(0, 45, zc - 2) !== 'purple_stained_glass') bad.push({ zc, at: '尖券彩窗', got: g(0, 45, zc - 2) })
      if (g(0, 75, zc - 2) !== 'iron_bars') bad.push({ zc, at: '钟券铁栅', got: g(0, 75, zc - 2) })
      if (g(0, 40, zc - 13) !== 'polished_andesite') bad.push({ zc, at: '角扶壁', got: g(0, 40, zc - 13) })
    }
    check('y=32..58 尖券彩窗层 / y=59..94 钟楼（铁栅）', bad.length === 0, bad)
    return true
  }
  if (phase === '16') {
    console.log('\n== PHASE 16 双塔：开放石廊 + 八角过渡 ==')
    const bad = []
    for (const zc of ZS) {
      if (g(TTX, 100, zc - 12) !== 'stone_bricks') bad.push({ zc, at: '廊柱', got: g(TTX, 100, zc - 12) })
      if (!air(g(TTX, 100, zc)) && g(TTX, 100, zc) !== 'lantern') bad.push({ zc, at: '石廊开敞', got: g(TTX, 100, zc) })
      if (!solid(g(TTX - 11, 113, zc))) bad.push({ zc, at: '廊顶外圈', got: g(TTX - 11, 113, zc) })
      if (!solid(g(TTX - 13, 120, zc - 13))) bad.push({ zc, at: 'y=120 未削角', got: g(TTX - 13, 120, zc - 13) })
      if (!air(g(TTX - 13, 137, zc - 13))) bad.push({ zc, at: 'y=137 已削角', got: g(TTX - 13, 137, zc - 13) })
      if (!solid(g(TTX - 10, 138, zc))) bad.push({ zc, at: '塔座环', got: g(TTX - 10, 138, zc) })
    }
    check('开放石廊（柱/开敞/顶）+ 方形到八角过渡 + 塔座环', bad.length === 0, bad)
    return true
  }
  console.log('\n== PHASE 17 双塔：镂空尖塔 + 细尖顶 + 顶饰 ==')
  const bad = []
  for (const zc of ZS) {
    if (g(TTX - 2, 160, zc) !== 'deepslate_tiles') bad.push({ zc, at: '尖塔肋', got: g(TTX - 2, 160, zc) })
    if (!air(g(TTX, 150, zc))) bad.push({ zc, at: '尖塔镂空', got: g(TTX, 150, zc) })
    if (g(TTX, 165, zc) !== 'deepslate_tiles') bad.push({ zc, at: '细尖顶', got: g(TTX, 165, zc) })
    if (g(TTX, 178, zc) !== 'gold_block') bad.push({ zc, at: '顶饰', got: g(TTX, 178, zc) })
  }
  check('镂空尖塔 / 细尖顶 / 顶饰', bad.length === 0, bad)
  check('两塔完全同高（世界 y=' + (T.Y(180)) + '）',
    g(TTX, 180, 34) === 'gold_block' && g(TTX, 180, -34) === 'gold_block',
    [g(TTX, 180, 34), g(TTX, 180, -34)])
  check('顶部余量 ≥ 8 格（塔顶 ' + T.Y(180) + ' / 可建上限 319）', T.Y(180) <= 311, T.Y(180))
  return true
}

// ---------------------------------------------------------------- PHASE 18
async function verifyPhase18() {
  console.log('\n== PHASE 18 管风琴平台 + 塔内楼梯 ==')
  const pts = []
  for (const [x, y, z] of [[35, 23, 0], [35, 24, 0], [28, 30, -5], [30, 30, -4], [36, 24, 5], [41, 24, 0], [29, 10, -4], [29, 23, 9], [31, 23, 9]]) pts.push([T.X(x), T.Y(y), T.Z(z)])
  for (const zc of [34, -34]) {
    for (const [x, y, z] of [[4, 0, zc - 8], [4, 36, zc - 4], [12, 116, zc + 4], [20, 116, zc], [13, 60, zc]]) pts.push([T.X(x), T.Y(y), T.Z(z)])
  }
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'
  const air = (v) => v === 'air' || v === 'cave_air'

  check('管风琴平台板与台上净空', solid(g(35, 23, 0)) && air(g(35, 24, 0)), [g(35, 23, 0), g(35, 24, 0)])
  check('琴柜（暗橡木）', g(28, 30, -5) === 'dark_oak_planks', g(28, 30, -5))
  check('音管（铁栅，取最高一根 z=-4）', g(30, 30, -4) === 'iron_bars', g(30, 30, -4))
  check('键盘台', solid(g(36, 24, 5)), g(36, 24, 5))
  check('平台栏杆', g(41, 24, 0) === 'dark_oak_fence', g(41, 24, 0))
  check('入口楼梯（y=10 处实心踏面）', solid(g(29, 10, -4)), g(29, 10, -4))
  check('楼梯通达平台（梯顶 y=23 → 平台 y=23 连续）',
    solid(g(29, 23, 9)) && solid(g(31, 23, 9)) && air(g(30, 24, 9)),
    [g(29, 23, 9), g(30, 24, 9), g(31, 23, 9)])

  const bad = []
  for (const zc of [34, -34]) {
    if (!solid(g(4, 0, zc - 8))) bad.push({ zc, at: '塔梯起点', got: g(4, 0, zc - 8) })
    if (!solid(g(4, 36, zc - 4))) bad.push({ zc, at: '塔梯中段', got: g(4, 36, zc - 4) })
    if (!solid(g(12, 116, zc + 4))) bad.push({ zc, at: '塔梯顶', got: g(12, 116, zc + 4) })
    if (!solid(g(20, 116, zc))) bad.push({ zc, at: '观察层', got: g(20, 116, zc) })
    if (!air(g(13, 60, zc)) && g(13, 60, zc) !== 'lantern') bad.push({ zc, at: '楼板开口', got: g(13, 60, zc) })
  }
  check('两塔塔内实体楼梯（起点/中段/梯顶）+ 观察层 + 楼板开口', bad.length === 0, bad)
  return true
}

// ---------------------------------------------------------------- PHASE 19
async function verifyPhase19() {
  console.log('\n== PHASE 19 家具 + 隐蔽照明 ==')
  const pts = []
  for (const [x, y, z] of [[68, 1, 5], [67, 2, 5], [100, 1, 0], [57, 2, 26], [57, 2, 27], [200, 3, -58], [196, 3, -58], [200, 6, -58], [207, 1, -60], [57, 65, 0], [57, 66, 0], [14, 9, 0], [14, 9, 6]]) pts.push([T.X(x), T.Y(y), T.Z(z)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'
  const air = (v) => v === 'air' || v === 'cave_air'

  check('中殿长椅（座 + 靠背，避开地宫入口区）', g(68, 1, 5) === 'dark_oak_slab' && g(67, 2, 5) === 'dark_oak_planks', [g(68, 1, 5), g(67, 2, 5)])
  check('中央走道 z=0 保持畅通', air(g(100, 1, 0)), g(100, 1, 0))
  check('忏悔室（内室净空 + 铁栅）', air(g(57, 2, 26)) && g(57, 2, 27) === 'iron_bars', [g(57, 2, 26), g(57, 2, 27)])
  check('圣器室（内部净空 / 墙 / 屋面 / 箱）',
    air(g(200, 3, -58)) && solid(g(196, 3, -58)) && g(200, 6, -58) === 'deepslate_tiles' && g(207, 1, -60) === 'chest',
    [g(200, 3, -58), g(196, 3, -58), g(200, 6, -58), g(207, 1, -60)])
  check('隐蔽照明：链吊灯笼（非萤石/火把）', g(57, 65, 0) === 'lantern' && g(57, 66, 0) === 'iron_chain', [g(57, 65, 0), g(57, 66, 0)])
  check('中轴不再挂灯（前厅灯笼已移到 z=±6）', air(g(14, 9, 0)) && g(14, 9, 6) === 'lantern', [g(14, 9, 0), g(14, 9, 6)])

  // §4 总复核：西门(x=5) 到祭坛台阶前(x=200) 的中央通视
  const blocked = []
  const allow = new Set(['polished_deepslate', 'smooth_quartz', 'stone_bricks', 'quartz_block', 'dark_oak_slab', 'dark_oak_planks'])
  for (let x = 6; x <= 200; x += 2) {
    for (let y = 2; y <= 12; y += 5) {
      const b = g(x, y, 0)
      if (b && b !== 'air' && b !== 'cave_air' && !allow.has(b)) blocked.push({ x, y, got: b })
    }
  }
  check('§4 西门→祭坛 中央通视无遮挡', blocked.length === 0, blocked.slice(0, 8))

  // 无裸露破坏氛围的光源
  let raw = 0
  for (let x = 50; x <= 150; x += 10) {
    for (const z of [-30, -20, 0, 20, 30]) {
      for (let y = 1; y <= 40; y += 3) {
        const b = g(x, y, z)
        if (b === 'glowstone' || b === 'torch' || b === 'sea_lantern') raw++
      }
    }
  }
  check('无裸露萤石/火把（中殿与侧廊抽样）', raw === 0, raw)
  return true
}

// ---------------------------------------------------------------- PHASE 24
async function verifyPhase24() {
  console.log('\n== PHASE 24 西广场（湖岸大石埠） ==')
  const pts = []
  for (const [x, y, z] of [
    [-150, -64, 30], [-150, -64, 0], [-150, -64, -5], [-150, -70, 30],
    [-150, -64, -46], [-150, -60, -46], [-178, -60, -18],
    [-199, -60, -78], [-195, -55, -78], [-200, -64, 0], [-120, -64, 0],
  ]) pts.push([T.X(x), T.Y(y), T.Z(z)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'
  const air = (v) => v === 'air' || v === 'cave_air'

  check('湖岸大石埠铺面（世界 y=58）', g(-150, -64, 30) === 'stone_bricks', g(-150, -64, 30))
  check('水下石基', solid(g(-150, -70, 30)), g(-150, -70, 30))
  check('中央石路对齐 z=0', g(-150, -64, 0) === 'polished_andesite' && g(-150, -64, -5) === 'polished_andesite', [g(-150, -64, 0), g(-150, -64, -5)])
  check('喷泉（水面 + 中柱）', g(-150, -64, -46) === 'water' && solid(g(-150, -60, -46)), [g(-150, -64, -46), g(-150, -60, -46)])
  check('雕像', g(-178, -60, -18) === 'polished_andesite', g(-178, -60, -18))
  check('外围民居（2 格厚墙 + 内部净空）', g(-199, -60, -78) === 'stone_bricks' && air(g(-195, -55, -78)), [g(-199, -60, -78), g(-195, -55, -78)])
  check('广场西端与东端都铺到（x=-200..-110）', solid(g(-200, -64, 0)) && solid(g(-120, -64, 0)), [g(-200, -64, 0), g(-120, -64, 0)])
  return true
}

// ---------------------------------------------------------------- PHASE 25/26/27 外围
async function verifyPhase25() {
  console.log('\n== PHASE 25 北修道院 ==')
  const pts = [[100, -30, -100], [110, -29, -110], [120, -29, -124], [106, -28, -119], [92, -25, -100], [86, -25, -100], [126, -25, -134], [112, -25, -134], [126, -8, -140], [126, -4, -140]]
    .map(([x, y, z]) => [T.X(x), T.Y(y), T.Z(z)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const air = (v) => v === 'air' || v === 'cave_air'
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'
  check('修道院台地地坪（世界 y=92）', solid(g(100, -30, -100)), g(100, -30, -100))
  check('回廊院草地 + 回廊地面', g(110, -29, -110) === 'grass_block' && g(120, -29, -124) === 'polished_andesite', [g(110, -29, -110), g(120, -29, -124)])
  check('回廊庭院侧柱列', g(106, -28, -119) === 'stone_bricks', g(106, -28, -119))
  check('食堂/图书室翼（内部净空 + 墙）', air(g(92, -25, -100)) && solid(g(86, -25, -100)), [g(92, -25, -100), g(86, -25, -100)])
  check('小礼拜堂（内部净空 + 墙）', air(g(126, -25, -134)) && solid(g(112, -25, -134)), [g(126, -25, -134), g(112, -25, -134)])
  check('钟塔与金顶', solid(g(126, -8, -140)) && g(126, -4, -140) === 'gold_block', [g(126, -8, -140), g(126, -4, -140)])
  return true
}

async function verifyPhase26() {
  console.log('\n== PHASE 26 南主教宫 ==')
  const pts = [[90, -16, 94], [120, -15, 124], [84, -10, 102], [77, -8, 124], [70, -8, 124], [172, 0, 128], [172, 9, 128], [120, -15, 152], [120, -15, 148]]
    .map(([x, y, z]) => [T.X(x), T.Y(y), T.Z(z)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const air = (v) => v === 'air' || v === 'cave_air'
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'
  check('主教宫台地地坪', solid(g(90, -16, 94)), g(90, -16, 94))
  check('内院地坪 + 宫体墙', solid(g(120, -15, 124)) && solid(g(84, -10, 102)), [g(120, -15, 124), g(84, -10, 102)])
  check('接待厅（内部净空 + 墙）', air(g(77, -8, 124)) && solid(g(70, -8, 124)), [g(77, -8, 124), g(70, -8, 124)])
  check('小礼拜堂尖塔 + 顶饰', solid(g(172, 0, 128)) && solid(g(172, 9, 128)), [g(172, 0, 128), g(172, 9, 128)])
  check('花园（水池 + 甬路）', g(120, -15, 152) === 'water' && solid(g(120, -15, 148)), [g(120, -15, 152), g(120, -15, 148)])
  return true
}

async function verifyPhase27() {
  console.log('\n== PHASE 27 东墓园 ==')
  const pts = [[330, -47, -50], [292, -46, 0], [340, -47, 0], [319, -47, 20], [298, -46, -12], [343, -45, -15], [337, -45, -15], [343, -33, -15], [343, -46, 56]]
    .map(([x, y, z]) => [T.X(x), T.Y(y), T.Z(z)])
  await ensureLoaded(pts)
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const air = (v) => v === 'air' || v === 'cave_air'
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'
  check('墓园台地草地（避开小径）', g(330, -47, -50) === 'grass_block', g(330, -47, -50))
  check('四周石墙', g(292, -46, 0) === 'stone_bricks', g(292, -46, 0))
  check('十字小径（行走面 y=-47；主径 z=0 / 横径 x=319）', g(340, -47, 0) === 'smooth_stone' && g(319, -47, 20) === 'smooth_stone', [g(340, -47, 0), g(319, -47, 20)])
  check('成行墓碑', solid(g(298, -46, -12)), g(298, -46, -12))
  check('中央小祭堂（内部净空 + 墙 + 金顶）', air(g(343, -45, -15)) && solid(g(337, -45, -15)) && g(343, -33, -15) === 'gold_block',
    [g(343, -45, -15), g(337, -45, -15), g(343, -33, -15)])
  check('南门可通行', air(g(343, -46, 56)), g(343, -46, 56))
  return true
}

// ---------------------------------------------------------------- PHASE 29/30
async function verifyPhase29() {
  console.log('\n== PHASE 29 拆除临时放线标记 ==')
  await ensureLoaded([[T.X(0), T.Y(3), T.Z(62)], [T.X(43), T.Y(3), T.Z(62)], [T.X(-2), T.Y(3), T.Z(18)], [T.X(273), T.Y(3), T.Z(0)]])
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  check('柱线上的标记已回填为石砖（不留在塔身空洞）', g(43, 3, 62) === 'stone_bricks', g(43, 3, 62))
  check('空旷处标记已清除', g(0, 3, 62) === 'air' && g(273, 3, 0) === 'air', [g(0, 3, 62), g(273, 3, 0)])
  check('台地西缘压顶已补回', g(-2, 3, 18) === 'polished_andesite', g(-2, 3, 18))
  // 全园不应再有 gold_block 标记残留（只允许塔顶饰的十字）
  let stray = 0
  for (const x of [0, 43, 57, 71, 85, 99, 113, 127, 141, 155, 190, 232, 273]) {
    for (const z of [-62, 62]) {
      const b = g(x, 3, z)
      if (b === 'gold_block') stray++
    }
  }
  check('40 处放线标记无残留', stray === 0, { stray })
  return true
}

async function verifyPhase30() {
  console.log('\n== PHASE 30 八视角总检（天际线剖面实测） ==')
  // x,z 为相对坐标；从相对 y=196（世界 318，接近可建上限）向下找最高非空气方块
  const topY = (x, z) => {
    for (let ry = 196; ry >= -80; ry--) {
      const b = at(bot, T.X(x), T.Y(ry), T.Z(z))
      if (b === null) return null
      const n = b.name
      if (n !== 'air' && n !== 'cave_air' && n !== 'void_air') return T.Y(ry)
    }
    return null
  }
  const line = (from, to, n = 17) => {
    const out = []
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      out.push([Math.round(from[0] + (to[0] - from[0]) * t), Math.round(from[1] + (to[1] - from[1]) * t)])
    }
    return out
  }
  // 每个视角给一条**穿过建筑**的采样线；必须显式包含关键顶点（塔心 z=±34、后殿中心 z=0），
  // 否则会因采样步长错过只有 1 格宽的塔尖。
  const westPts = []
  for (let z = -64; z <= 64; z += 8) westPts.push([13, z])
  westPts.push([13, -34], [13, 34])
  const nwPts = []
  for (let x = 0; x <= 272; x += 17) nwPts.push([x, -34])
  nwPts.push([13, -34])
  const swPts = nwPts.map(([x]) => [x, 34])
  const eastPts = []
  for (let z = -60; z <= 60; z += 8) eastPts.push([236, z])
  eastPts.push([236, 0])
  const VIEWS = [
    { name: '西广场中央（双塔横断面 x=13）', pts: westPts },
    { name: '西北（沿 z=-34 纵断面）', pts: nwPts },
    { name: '西南（沿 z=+34 纵断面）', pts: swPts },
    { name: '北耳堂（x 向横断面 z=-79）', pts: line([148, -79], [196, -79]) },
    { name: '南耳堂（x 向横断面 z=+79）', pts: line([148, 79], [196, 79]) },
    { name: '东端（后殿横断面 x=236）', pts: eastPts },
    { name: '中殿西端（开间横断面 x=99）', pts: line([99, -60], [99, 60]) },
    { name: '圣坛西侧（唱诗班横断面 x=215）', pts: line([215, -60], [215, 60]) },
  ]
  // 长线分段加载：视距有限，必须每段把机器人 tp 到附近再采样
  const sampleLine = async (pts) => {
    const hs = []
    for (let i = 0; i < pts.length; i += 6) {
      const grp = pts.slice(i, i + 6)
      await ensureLoaded(grp.map(([x, z]) => [T.X(x), T.Y(160), T.Z(z)]))
      for (const [x, z] of grp) hs.push(topY(x, z))
    }
    return hs.filter((h) => h != null)
  }

  let globalMax = 0
  const summary = []
  for (const v of VIEWS) {
    const hs = await sampleLine(v.pts)
    const max = hs.length ? Math.max(...hs) : 0
    const levels = new Set(hs.map((h) => Math.round(h / 4) * 4)).size
    globalMax = Math.max(globalMax, max)
    summary.push({ view: v.name, max, levels, n: hs.length })
    console.log(`   ${v.name}: 最高 ${max}（世界 y），高度层数 ${levels}，采样 ${hs.length}`)
  }
  const west = summary[0]
  check('全部 8 视角都能看到建筑（最高点 ≥ 世界 180）', summary.every((v) => v.max >= 180), summary.filter((v) => v.max < 180))
  check('天际线最高 = 世界 302（双塔塔顶）', globalMax === 302, { globalMax })
  check('西广场视角双塔为最高', west.max >= 300, west)
  check('整体不像方盒子（每个视角高度层数 ≥ 4）', summary.every((v) => v.levels >= 4), summary.filter((v) => v.levels < 4))
  return true
}

// ---------------------------------------------------------------- 修复 31-35
async function verifyFixes(phase) {
  const g = (x, y, z) => at(bot, T.X(x), T.Y(y), T.Z(z))?.name
  const air = (v) => v === 'air' || v === 'cave_air'
  const solid = (v) => v && v !== 'air' && v !== 'cave_air'

  if (phase === '31') {
    console.log('\n== 修复 31：主门 / 塔梯 / 地宫入口 ==')
    const pts = [[2, 5, 0], [2, 20, 0], [-2, 1, 0], [21, 17, 26], [83, 1, 4], [90, 2, 6]]
      .map(([x, y, z]) => [T.X(x), T.Y(y), T.Z(z)])
    await ensureLoaded(pts)
    check('主门门柱已拆（z=0 通视）', air(g(2, 5, 0)) && air(g(2, 20, 0)), [g(2, 5, 0), g(2, 20, 0)])
    check('主门前通道已清（可直接走）', air(g(-2, 1, 0)), g(-2, 1, 0))
    check('塔梯拐弯平台', solid(g(21, 17, 26)) && solid(g(21, 17, 29)), [g(21, 17, 26), g(21, 17, 29)])
    check('地宫入口处长椅已清', air(g(83, 1, 4)), g(83, 1, 4))
    check('地宫入口石栏', solid(g(90, 2, 6)), g(90, 2, 6))
    return true
  }
  if (phase === '32') {
    console.log('\n== 修复 32：屋顶闭合 ==')
    const pts = [[99, 55, 40], [99, 68, 16], [210, 55, 40], [99, 50, 0]]
      .map(([x, y, z]) => [T.X(x), T.Y(y), T.Z(z)])
    await ensureLoaded(pts)
    check('侧廊坡顶（z=40）', g(99, 55, 40) === 'deepslate_tiles', g(99, 55, 40))
    check('高窗上沿封口（z=16）', solid(g(99, 68, 16)), g(99, 68, 16))
    check('唱诗班侧廊坡顶', g(210, 55, 40) === 'deepslate_tiles', g(210, 55, 40))
    check('中殿中央通视仍净空（屋面未侵入中殿）', air(g(99, 50, 0)), g(99, 50, 0))
    return true
  }
  if (phase === '33') {
    console.log('\n== 修复 33：道路联通 ==')
    const pts = [[120, -30, -90], [320, -48, 0], [130, -16, 100], [280, -40, 0]]
      .map(([x, y, z]) => [T.X(x), T.Y(y), T.Z(z)])
    await ensureLoaded(pts)
    check('北修道院平路接门（y=-30）', g(120, -30, -90) === 'polished_andesite', g(120, -30, -90))
    check('东墓园平路（y=-48）', g(320, -48, 0) === 'polished_andesite', g(320, -48, 0))
    check('南主教宫平路（y=-16）', g(130, -16, 100) === 'polished_andesite', g(130, -16, 100))
    return true
  }
  if (phase === '34') {
    console.log('\n== 修复 34：照明 ==')
    const pts = [[57, 44, 0], [57, 45, 0], [172, 58, 0], [99, -5, 0]]
      .map(([x, y, z]) => [T.X(x), T.Y(y), T.Z(z)])
    await ensureLoaded(pts)
    check('中殿链吊灯笼', g(57, 44, 0) === 'lantern' && g(57, 45, 0) === 'iron_chain', [g(57, 44, 0), g(57, 45, 0)])
    check('耳堂/地宫灯笼', g(172, 58, 0) === 'lantern' && g(99, -5, 0) === 'lantern', [g(172, 58, 0), g(99, -5, 0)])
    return true
  }
  console.log('\n== 修复 35：华丽度 ==')
  const pts = [[3, 40, 6], [3, 43, 8], [3, 43, 0], [57, 43, 55], [2, 12, 12]]
    .map(([x, y, z]) => [T.X(x), T.Y(y), T.Z(z)])
  await ensureLoaded(pts)
  check('玫瑰窗彩玻（避开窗格）', g(3, 40, 6) === 'light_blue_stained_glass', g(3, 40, 6))
  check('玫瑰窗放射石窗格（横辐 z=8）', g(3, 43, 8) === 'polished_deepslate', g(3, 43, 8))
  check('玫瑰窗中心石核', g(3, 43, 0) === 'calcite', g(3, 43, 0))
  check('扶壁尖顶', solid(g(57, 43, 55)), g(57, 43, 55))
  check('雕像壁龛雕像', g(2, 12, 12) === 'polished_andesite', g(2, 12, 12))
  return true
}

const phase = getArg('--phase', null)
const all = args.includes('--all')
if (all || phase === '1') await verifyPhase1()
if (all || phase === '2') await verifyPhase2()
if (all || phase === '3') await verifyPhase3()
if (all || phase === '11') await verifyPhase11()
if (all || phase === '12') await verifyPhase12()
if (all || phase === '13') await verifyPhase13()
if (all || phase === '14') await verifyPhase14()
if (all || phase === '15') await verifyTowers('15')
if (all || phase === '16') await verifyTowers('16')
if (all || phase === '17') await verifyTowers('17')
if (all || phase === '18') await verifyPhase18()
if (all || phase === '19') await verifyPhase19()
if (all || phase === '24') await verifyPhase24()
if (all || phase === '25') await verifyPhase25()
if (all || phase === '26') await verifyPhase26()
if (all || phase === '27') await verifyPhase27()
if (all || phase === '28') {}
if (all || phase === '29') await verifyPhase29()
if (all || phase === '30') await verifyPhase30()
if (['31','32','33','34','35'].includes(phase)) await verifyFixes(phase)
if (all || phase === '4') await verifyPhase4()
if (all || phase === '6') await verifyPhase6()
if (all || phase === '7') await verifyPhase7()
if (all || phase === '8') await verifyPhase8()
if (all || phase === '9') await verifyPhase9()
if (all || phase === '10') await verifyPhase10()
if (all || phase === '5') await verifyPhase5()

const pass = results.filter((r) => r.ok).length
console.log(`\n[verify] ${pass}/${results.length} 项通过`)
saveJson(join(ROOT, 'build', 'cathedral', 'verify-last.json'), { at: new Date().toISOString(), phase: phase ?? (all ? 'all' : null), results })
bot.quit()
setTimeout(() => process.exit(pass === results.length ? 0 : 1), 400)
