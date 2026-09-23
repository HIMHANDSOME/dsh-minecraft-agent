// 受控探针：连到 LAN 世界（默认 11451），检查能否加入、当前模式、以及 /命令 是否可用。
// 只读 + 一条无害命令；不修改世界。
import mineflayer from 'mineflayer'

const HOST = process.env.MC_HOST ?? '127.0.0.1'
const PORT = Number(process.env.MC_PORT ?? 11451)
const USER = process.env.MC_USER ?? 'ProbeLan'
const VERSION = process.env.MC_VERSION ?? '26.1'

const bot = mineflayer.createBot({ host: HOST, port: PORT, username: USER, version: VERSION, auth: 'offline' })

const said = []
bot.on('message', (msg) => {
  const t = msg.toString()
  said.push(t)
  console.log('[msg]', t)
})
bot.on('kicked', (r) => console.log('[kicked]', JSON.stringify(r)))
bot.on('error', (e) => console.log('[error]', e.message))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

bot.once('spawn', async () => {
  console.log('[spawn] version=', bot.version)
  console.log('[spawn] position=', bot.entity.position)
  console.log('[spawn] gameMode=', bot.game.gameMode, 'dimension=', bot.game.dimension)
  console.log('[spawn] players=', Object.keys(bot.players))
  await sleep(1000)
  // 无害只读命令：验证命令权限
  said.length = 0
  bot.chat('/time query daytime')
  await sleep(1500)
  console.log('[probe] /time query daytime ->', said.some((s) => /time is/i.test(s)) ? 'COMMAND_OK' : 'NO/UNKNOWN')
  console.log('[probe] raw:', said.slice(-4))
  said.length = 0
  bot.chat('/list')
  await sleep(1500)
  console.log('[probe] /list ->', said.slice(-4))
  // 地形高度采样
  const p = bot.entity.position
  const y = bot.blockAt(p.offset(0, -1, 0))
  console.log('[probe] block under feet:', y?.name, 'at', p.floored())
  bot.quit()
  setTimeout(() => process.exit(0), 500)
})
