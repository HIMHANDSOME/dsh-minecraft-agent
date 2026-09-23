/**
 * 探针 v3：两件事一起验
 *  A. mineflayer 在 26.1 下实体数据是否可信（实体名称直方图 + 玩家列表）
 *  B. 真实采集链路：走到目标方块 → 挖 → 拾取（即 mc_collect 的核心）
 */
import mineflayer from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
const { pathfinder, Movements, goals } = pathfinderPkg

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bot = mineflayer.createBot({
  host: '127.0.0.1', port: 25565, username: 'ProbeBot3', version: '26.1', auth: 'offline',
})
bot.loadPlugin(pathfinder)
bot.on('error', (e) => { console.error('ERR', e.message); process.exit(1) })

bot.once('spawn', async () => {
  await sleep(2000)

  // ---------- A. 实体直方图 ----------
  const hist = {}
  for (const e of Object.values(bot.entities)) {
    const k = `${e.name}|${e.displayName}|type=${e.type}`
    hist[k] = (hist[k] ?? 0) + 1
  }
  console.log('=== entity histogram ===')
  for (const [k, v] of Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${v.toString().padStart(3)}  ${k}`)
  console.log('players:', JSON.stringify(Object.keys(bot.players)))
  console.log('registry.entitiesByName.item =', JSON.stringify(bot.registry.entitiesByName.item))
  console.log('registry.version =', bot.registry.version?.majorVersion ?? bot.registry.version)

  // ---------- B. 采集 ----------
  const mcData = (await import('minecraft-data')).default
  console.log('mcData supported last:', mcData.supportedVersions.pc.slice(-3).join(','))
  const dirtId = bot.registry.blocksByName.dirt?.id
  const grassId = bot.registry.blocksByName.grass_block?.id
  const refBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0))
  console.log('standing on:', refBlock?.name, 'bot y=', +bot.entity.position.y.toFixed(2))
  const probed = bot.blockAt(bot.entity.position.offset(0, -2, 0))
  console.log('block below standing block:', probed?.name)

  // 走到最近的 grass_block / dirt
  let target = bot.findBlock({ matching: [grassId, dirtId].filter((x) => x !== undefined), maxDistance: 24 })
  if (!target) { console.log('NO_DIRT_NEARBY'); bot.quit(); process.exit(2) }
  console.log('target block:', target.name, target.position)

  const movements = new Movements(bot)
  movements.canDig = false
  bot.pathfinder.setMovements(movements)
  try {
    await Promise.race([
      bot.pathfinder.goto(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 1)),
      sleep(20_000).then(() => { throw new Error('goto timeout') }),
    ])
    console.log('arrived at', bot.entity.position.floored())
  } catch (e) { console.log('goto issue:', e.message) }

  const near = bot.findBlock({ matching: [grassId, dirtId].filter((x) => x !== undefined), maxDistance: 4 })
  if (!near) { console.log('TARGET_LOST'); bot.quit(); process.exit(3) }
  const before = bot.inventory.items().length
  console.log(`dig ${near.name} at ${near.position} dist=${bot.entity.position.distanceTo(near.position.offset(0.5, 0.5, 0.5)).toFixed(2)}`)
  await bot.dig(near, true)

  for (let i = 0; i < 32; i++) {
    await sleep(250)
    const items = bot.inventory.items()
    if (items.length > before) {
      console.log('COLLECT_OK', JSON.stringify(items.map((x) => `${x.name}:${x.count}`)), `after ${(i + 1) * 250}ms`)
      bot.quit(); await sleep(300); process.exit(0)
    }
  }
  console.log('COLLECT_FAILED after 8s; inv=', JSON.stringify(bot.inventory.items().map((x) => x.name)))
  bot.quit(); await sleep(300); process.exit(4)
})

setTimeout(() => { console.error('probe timeout'); process.exit(5) }, 120_000)
