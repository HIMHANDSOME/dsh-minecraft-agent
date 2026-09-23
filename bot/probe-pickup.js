/**
 * 探针 v2：区分"拾取半径不够"与"协议层拾取失效"。
 * 做法：挖正下方方块（距离=1），给 6 秒窗口轮询背包，并打印最近 item 实体的距离。
 */
import mineflayer from 'mineflayer'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bot = mineflayer.createBot({
  host: '127.0.0.1', port: 25565, username: 'ProbeBot2', version: '26.1', auth: 'offline',
})
bot.on('error', (e) => { console.error('ERR', e.message); process.exit(1) })

const itemEntities = () =>
  Object.values(bot.entities)
    .filter((e) => e.entityType === undefined ? false : true)
    .filter((e) => ['item', 'Item'].includes(e.name) || ['item', 'Item'].includes(e.displayName))

bot.once('spawn', async () => {
  await sleep(2000)
  const p = bot.entity.position.clone()
  console.log('bot pos', p.floored())

  // 找一个和 bot 同层的、相邻(<2 格)的可挖方块：优先脚下方块
  let block = bot.blockAt(p.offset(0, -1, 0))
  if (!block || block.boundingBox === 'empty') block = bot.blockAt(p.offset(1, 0, 0))
  if (!block || block.boundingBox === 'empty') block = bot.blockAt(p.offset(0, 0, 1))
  if (!block || block.boundingBox === 'empty') { console.log('NO_BLOCK'); process.exit(2) }

  const d = p.distanceTo(block.position.offset(0.5, 0.5, 0.5))
  console.log(`dig ${block.name} at ${block.position} dist=${d.toFixed(2)} drops=${JSON.stringify(bot.registry.blocksByName[block.name]?.drops)}`)
  const before = bot.inventory.items().length
  await bot.dig(block, true)

  for (let i = 0; i < 24; i++) {
    await sleep(250)
    const items = bot.inventory.items()
    if (i % 4 === 0) {
      const near = itemEntities()
        .map((e) => ({ n: e.name, d: +bot.entity.position.distanceTo(e.position).toFixed(2) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
      console.log(`t=${(i + 1) * 250}ms inv=${JSON.stringify(items.map((x) => `${x.name}:${x.count}`))} nearestItems=${JSON.stringify(near)}`)
    }
    if (items.length > before) {
      console.log('PICKUP_OK', JSON.stringify(items.map((x) => `${x.name}:${x.count}`)))
      bot.quit(); await sleep(300); process.exit(0)
    }
  }
  console.log('PICKUP_FAILED after 6s')
  bot.quit(); await sleep(300); process.exit(3)
})

setTimeout(() => { console.error('probe timeout'); process.exit(4) }, 90_000)
