/**
 * 最小复现：验证"先 goto 成功 → 调 setGoal(null)+stop() → 再 goto"是否会
 * 让第二次 goto 立刻以 PathStopped 失败。
 */
import mineflayer from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
const { pathfinder, Movements, goals } = pathfinderPkg

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'PathBot', version: '26.1', auth: 'offline' })
bot.loadPlugin(pathfinder)
bot.on('error', (e) => { console.error('ERR', e.message); process.exit(1) })

process.on('unhandledRejection', (e) => console.log('  [unhandledRejection]', e?.name, e?.message))

const attempt = async (label, fn) => {
  try {
    const t0 = Date.now()
    await fn()
    console.log(`${label}: OK (${Date.now() - t0}ms)`)
    return true
  } catch (e) {
    console.log(`${label}: FAIL ${e?.name} -> ${e?.message}`)
    return false
  }
}

bot.once('spawn', async () => {
  await sleep(2500)
  const m = new Movements(bot)
  m.canDig = false
  bot.pathfinder.setMovements(m)
  const p = bot.entity.position

  console.log('--- A: 普通 goto ---')
  await attempt('A goto#1', () => bot.pathfinder.goto(new goals.GoalNear(p.x + 3, p.y, p.z, 1)))

  console.log('--- B: setGoal(null) + stop() 之后再次 goto ---')
  try { bot.pathfinder.setGoal(null) } catch (e) { console.log('  setGoal(null) threw:', e.message) }
  try { bot.pathfinder.stop() } catch (e) { console.log('  stop() threw:', e.message) }
  await sleep(300)
  await attempt('B goto#2', () => bot.pathfinder.goto(new goals.GoalNear(p.x - 3, p.y, p.z, 1)))

  console.log('--- C: 只 stop() 之后再次 goto ---')
  try { bot.pathfinder.stop() } catch (e) { console.log('  stop() threw:', e.message) }
  await sleep(300)
  await attempt('C goto#3', () => bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z + 3, 1)))

  console.log('--- D: 超时竞速（模拟 withTimeout 放弃 goto）后再 goto ---')
  const race = new Promise((_, rej) => setTimeout(() => rej(new Error('simulated timeout')), 800))
  await attempt('D goto#4-race', () => Promise.race([bot.pathfinder.goto(new goals.GoalNear(p.x + 8, p.y, p.z, 1)), race]))
  try { bot.pathfinder.setGoal(null); bot.pathfinder.stop() } catch {}
  await sleep(300)
  await attempt('D goto#5', () => bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z - 3, 1)))

  console.log('--- E: 连续 goto 中间夹 stop()（模拟 mc_collect 每轮） ---')
  for (let i = 1; i <= 3; i++) {
    await attempt(`E round${i} goto`, () => bot.pathfinder.goto(new goals.GoalNear(p.x + i, p.y, p.z, 1)))
    try { bot.pathfinder.setGoal(null); bot.pathfinder.stop() } catch {}
    await sleep(150)
  }

  bot.quit(); await sleep(300); process.exit(0)
})
setTimeout(() => { console.error('timeout'); process.exit(2) }, 90_000)
