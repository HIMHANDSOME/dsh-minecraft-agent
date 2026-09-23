/**
 * PHASE 0 勘察 —— 在候选区域采样地形，为「山地台地大教堂」选点。
 *
 * 做法：把候选区拆成若干"观察点"，逐个 /tp 过去（让区块真正加载），
 * 再在每个观察点周围小范围采样地表高度与地表方块。只读，不改世界。
 *
 * 用法:
 *   node build/cathedral/survey.js --name windswept_hills
 *   node build/cathedral/survey.js --all
 *   node build/cathedral/survey.js --at 100,200 --name custom --tile 120 --radius 70 --step 8
 */
import { connect, tp, sleep, saveJson, ROOT, at } from '../../bot/builder-core.js'
import { join } from 'node:path'

const CANDIDATES = [
  { name: 'windswept_hills', x: -1356, z: -1042 },
  { name: 'stony_peaks', x: 532, z: 558 },
  { name: 'courtyard_area', x: -396, z: -82 },
]

const VEG = new Set([
  'oak_leaves', 'spruce_leaves', 'birch_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves',
  'mangrove_leaves', 'azalea_leaves', 'flowering_azalea_leaves', 'cherry_leaves', 'leaf_litter',
  'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log',
  'grass_block_snow', 'short_grass', 'grass', 'tall_grass', 'fern', 'large_fern',
  'poppy', 'dandelion', 'cornflower', 'snow', 'vine', 'bamboo', 'sugar_cane',
  'lilac', 'rose_bush', 'peony', 'sunflower', 'oak_sapling', 'wildflowers',
])

const args = process.argv.slice(2)
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }

/** 先粗后细找地表：从 250 每 16 格下降，命中实体后回到上一格再逐格下探。 */
function surfaceAt(bot, x, z, topY = 250, minY = -60) {
  let solid = null
  let y = topY
  for (; y >= minY; y -= 16) {
    const blk = at(bot, x, y, z)
    if (blk === null) return { unloaded: true }
    const n = blk.name
    if (n !== 'air' && n !== 'cave_air' && n !== 'void_air') { solid = y; break }
  }
  if (solid === null) return { surface: null, surfaceY: null, ground: null, groundY: null }
  let surface = null, surfaceY = null, ground = null, groundY = null
  for (let yy = solid; yy >= minY; yy--) {
    const blk = at(bot, x, yy, z)
    if (blk === null) return { unloaded: true }
    const n = blk.name
    if (n === 'air' || n === 'cave_air' || n === 'void_air') continue
    if (!surface) { surface = n; surfaceY = yy }
    if (!VEG.has(n)) { ground = n; groundY = yy; break }
  }
  return { surface, surfaceY, ground, groundY }
}

const which = args.includes('--all') ? CANDIDATES.map((c) => c.name) : [getArg('--name', 'windswept_hills')]
const tile = Number(getArg('--tile', 110))
const radius = Number(getArg('--radius', 64))
const step = Number(getArg('--step', 8))
const customAt = getArg('--at', null)

const bot = await connect({ user: 'SurveyBot', port: 11451 })
console.log('[survey] connected as', bot.username, 'gameMode=', bot.game.gameMode)

const out = []
for (const name of which) {
  let c = CANDIDATES.find((x) => x.name === name)
  if (customAt && !c) { const [x, z] = customAt.split(',').map(Number); c = { name, x, z } }
  if (!c) { console.error('unknown candidate', name); continue }

  const t0 = Date.now()
  const samples = []
  let unloaded = 0
  const offsets = []
  for (const dx of [-tile, 0, tile]) for (const dz of [-tile, 0, tile]) offsets.push([dx, dz])
  for (const [ox, oz] of offsets) {
    const px = c.x + ox, pz = c.z + oz
    await tp(bot, px, 220, pz, { settleMs: 1500 })
    for (let dx = -radius; dx <= radius; dx += step) {
      for (let dz = -radius; dz <= radius; dz += step) {
        const x = px + dx, z = pz + dz
        const info = surfaceAt(bot, x, z)
        if (info.unloaded) { unloaded++; continue }
        samples.push({ x, z, ...info })
      }
    }
    process.stderr.write(`  tile ${ox},${oz} -> ${samples.length} samples\n`)
  }
  const ys = samples.filter((s) => s.groundY != null).map((s) => s.groundY).sort((a, b) => a - b)
  const q = (p) => (ys.length ? ys[Math.min(ys.length - 1, Math.floor((ys.length - 1) * p))] : null)
  const hist = {}
  for (const s of samples) if (s.ground) hist[s.ground] = (hist[s.ground] ?? 0) + 1
  const med = q(0.5)
  const stat = {
    name: c.name, center: { x: c.x, z: c.z },
    sampled: samples.length, unloaded,
    groundY: { min: ys[0] ?? null, p10: q(0.1), median: med, p90: q(0.9), max: ys[ys.length - 1] ?? null },
    relief: ys.length ? ys[ys.length - 1] - ys[0] : null,
    flatRatio4: ys.length ? samples.filter((s) => s.groundY != null && Math.abs(s.groundY - med) <= 4).length / samples.length : 0,
    groundHist: Object.fromEntries(Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 12)),
    elapsedMs: Date.now() - t0,
    samples,
  }
  out.push(stat)
  console.log(`\n=== ${c.name} @ ${c.x},${c.z} ===`)
  console.log(`  sampled=${stat.sampled} unloaded=${stat.unloaded} relief=${stat.relief} flatRatio(±4)=${stat.flatRatio4.toFixed(2)}`)
  console.log(`  groundY min/p10/med/p90/max = ${JSON.stringify(stat.groundY)}`)
  console.log(`  surface blocks: ${JSON.stringify(stat.groundHist)}`)
}

saveJson(join(ROOT, 'build', 'cathedral', 'phase0-survey.json'), { at: new Date().toISOString(), step, radius, tile, results: out })
console.log('\n[survey] 报告写入 build/cathedral/phase0-survey.json')
bot.quit()
setTimeout(() => process.exit(0), 400)
