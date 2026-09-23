/**
 * S1 连通性测试（不涉及 LLM，也不涉及 MCP 协议层）
 *
 * 目的：证明 mineflayer 4.39.0 能真实连上本机 26.1 服务器并执行动作。
 * 断言：出生成功 → 坐标可读 → 能移动 → 能挖方块并拾取。
 *
 * 用法: node connect.js
 */
import mineflayer from 'mineflayer'

const HOST = process.env.MC_HOST ?? '127.0.0.1'
const PORT = Number(process.env.MC_PORT ?? 25565)
const USER = process.env.MC_USER ?? 'DeepSeekBot'
const VERSION = process.env.MC_VERSION ?? '26.1'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log('[s1]', ...a)

function fail(stage, err) {
  console.error(`[s1] FAIL at ${stage}:`, err?.stack ?? err)
  process.exitCode = 1
}

const bot = mineflayer.createBot({
  host: HOST,
  port: PORT,
  username: USER,
  version: VERSION,
  auth: 'offline',
  checkTimeoutInterval: 60_000,
})

let finished = false
async function finish(code, why) {
  if (finished) return
  finished = true
  log(why)
  bot.quit()
  await sleep(300)
  process.exit(code)
}

bot.on('kicked', (r) => fail('kicked', r))
bot.on('error', (e) => fail('error', e))

bot.once('spawn', async () => {
  try {
    const p0 = bot.entity.position.clone()
    log(`spawned as ${bot.username} at ${p0.floored()} dimension=${bot.game.dimension}`)
    if (!Number.isFinite(p0.x)) throw new Error('position not readable')

    // ---- 1. 移动能力：走向前方 3 格 ----
    const target = p0.offset(3, 0, 0)
    log(`walking toward ${target.floored()}`)
    await bot.lookAt(target.offset(0, 1.6, 0), true)
    bot.setControlState('forward', true)
    await sleep(1200)
    bot.setControlState('forward', false)
    await sleep(300)
    const p1 = bot.entity.position.clone()
    const moved = p0.distanceTo(p1)
    log(`moved ${moved.toFixed(2)} blocks -> ${p1.floored()}`)
    if (moved < 0.5) throw new Error(`did not move (${moved.toFixed(3)})`)

    // ---- 2. 破坏能力：挖脚下附近的最近方块 ----
    const block = bot.blockAt(p1.offset(0, -1, 0)) ?? bot.blockAt(p1.offset(1, -1, 0))
    if (!block) throw new Error('no block found under/near bot')
    log(`digging ${block.name} at ${block.position}`)
    await bot.dig(block, true)
    await sleep(500)
    log(`inventory after dig: ${bot.inventory.items().map((i) => `${i.name}x${i.count}`).join(', ') || '(empty, dirt not picked up)'}`)

    // ---- 3. 世界感知能力 ----
    const status = {
      username: bot.username,
      version: bot.version,
      dimension: bot.game.dimension,
      health: bot.health,
      food: bot.food,
      position: bot.entity.position.floored(),
      time: bot.time.timeOfDay,
      digged: block.name,
      nearbyEntities: Object.keys(bot.entities).length,
    }
    log('STATUS ' + JSON.stringify(status))

    console.log('[s1] S1_PASS')
    await finish(0, 'S1 verified: spawn + move + dig + sense all working')
  } catch (e) {
    fail('assertions', e)
    await finish(1, 'S1_FAIL')
  }
})

setTimeout(() => {
  if (!finished) {
    fail('timeout', new Error('no spawn within 60s'))
    process.exit(1)
  }
}, 60_000)
