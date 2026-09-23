/**
 * probe-sites.js —— 外围四处（西广场/北修道院/南主教宫/东墓园）的地形初测
 * 只读：tp + 读方块。用来确定各外围平台的标高。
 */
import { connect, tp, sleep, at } from '../../bot/builder-core.js'

const SITES = [
  { name: '西广场', x1: -200, x2: -110, z1: -90, z2: 90 },
  { name: '北修道院', x1: 50, x2: 190, z1: -135, z2: -65 },
  { name: '南主教宫', x1: 50, x2: 190, z1: 65, z2: 135 },
  { name: '东墓园', x1: 285, x2: 400, z1: -65, z2: 65 },
]
const X0 = 44, Y0 = 122, Z0 = 390

function surfaceAt(bot, x, z, topY = 250, minY = -60) {
  let y = topY
  for (; y >= minY; y -= 16) {
    const b = at(bot, x, y, z)
    if (b === null) return null
    if (b.name !== 'air' && b.name !== 'cave_air' && b.name !== 'void_air') break
  }
  if (y < minY) return null
  for (let yy = y; yy >= minY; yy--) {
    const b = at(bot, x, yy, z)
    if (b === null) return null
    const n = b.name
    if (n === 'air' || n === 'cave_air' || n === 'void_air') continue
    if (['oak_leaves', 'spruce_leaves', 'birch_leaves', 'oak_log', 'spruce_log', 'short_grass', 'grass', 'leaf_litter', 'snow'].includes(n)) continue
    return { y: yy, block: n }
  }
  return null
}

const bot = await connect({ user: 'SiteProbe', port: 11451 })
console.log('connected', bot.username)

for (const s of SITES) {
  const wx1 = X0 + s.x1, wx2 = X0 + s.x2
  const wz1 = Z0 + s.z1, wz2 = Z0 + s.z2
  const cx = Math.round((wx1 + wx2) / 2), cz = Math.round((wz1 + wz2) / 2)
  await tp(bot, cx, 220, cz, { settleMs: 2000 })
  const ys = []
  const hist = {}
  for (let x = wx1; x <= wx2; x += 16) {
    for (let z = wz1; z <= wz2; z += 16) {
      const r = surfaceAt(bot, x, z)
      if (!r) continue
      ys.push(r.y)
      hist[r.block] = (hist[r.block] ?? 0) + 1
    }
  }
  ys.sort((a, b) => a - b)
  const q = (p) => ys.length ? ys[Math.min(ys.length - 1, Math.floor((ys.length - 1) * p))] : null
  console.log(`\n=== ${s.name} rel x${s.x1}..${s.x2} z${s.z1}..${s.z2} (n=${ys.length}) ===`)
  console.log(`  地表世界 y: min=${ys[0]} p10=${q(0.1)} med=${q(0.5)} p90=${q(0.9)} max=${ys[ys.length - 1]}`)
  console.log(`  相对地坪 rel y = 世界y-122 : med=${q(0.5) - Y0} min=${ys[0] - Y0} max=${ys[ys.length - 1] - Y0}`)
  console.log(`  主要方块: ${JSON.stringify(Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 6))}`)
}

bot.quit()
setTimeout(() => process.exit(0), 300)
