/**
 * 复现 2：只验证 setGoal(null) 是否安全（不调用 stop()）
 */
import mineflayer from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
const { pathfinder, Movements, goals } = pathfinderPkg

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'PathBot2', version: '26.1', auth: 'offline' })
bot.loadPlugin(pathfinder)
bot.on('error', (e) => { console.error('ERR', e.message); process.exit(1) })
process.on('unhandledRejection', (e) => console.log('  [unhandledRejection]', e?.name, e?.message))

const attempt = async (label, fn) => {
  try { const t0 = Date.now(); await fn(); console.log(`${label}: OK (${Date.now() - t0}ms)`); return true }
  catch (e) { console.log(`${label}: FAIL ${e?.name} -> ${e?.message}`); return false }
}

bot.once('spawn', async () => {
  await sleep(2500)
  const m = new Movements(bot)
  m.canDig = false
  bot.pathfinder.setMovements(m)
  const p = bot.entity.position

  await attempt('A goto#1', () => bot.pathfinder.goto(new goals.GoalNear(p.x + 3, p.y, p.z, 1)))

  console.log('--- B: 仅 setGoal(null) 后再 goto ---')
  try { bot.pathfinder.setGoal(null) } catch (e) { console.log('  setGoal(null) threw:', e.message) }
  await sleep(300)
  await attempt('B goto#2', () => bot.pathfinder.goto(new goals.GoalNear(p.x - 3, p.y, p.z, 1)))

  console.log('--- C: 超时竞速放弃 goto → 仅 setGoal(null) → 再 goto ---')
  const race = new Promise((_, rej) => setTimeout(() => rej(new Error('simulated timeout')), 600))
  await attempt('C goto#3-race', () => Promise.race([bot.pathfinder.goto(new goals.GoalNear(p.x + 10, p.y, p.z, 1)), race]))
  try { bot.pathfinder.setGoal(null) } catch {}
  await sleep(400)
  await attempt('C goto#4', () => bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z + 3, 1)))

  console.log('--- D: 每轮夹一次 setGoal(null) ×3 ---')
  for (let i = 1; i <= 3; i++) {
    await attempt(`D round${i}`, () => bot.pathfinder.goto(new goals.GoalNear(p.x + (i % 2 ? 2 : -2), p.y, p.z, 1)))
    try { bot.pathfinder.setGoal(null) } catch {}
    await sleep(150)
  }

  console.log('--- E: 两次并发 goto（模拟超时未清 + 新调用）---')
  await attempt('E goto#a', () => bot.pathfinder.goto(new goals.GoalNear(p.x + 4, p.y, p.z, 1)))
  console.log('   (第二路 goto 会触发 GoalChanged，属预期)')

  bot.quit(); await sleep(300); process.exit(0)
})
setTimeout(() => { console.error('timeout'); process.exit(2) }, 90_000)
