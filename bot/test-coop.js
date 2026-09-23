/**
 * 双角色协同端到端测试（"我操控一个角色，DeepSeek 操控另一个角色"）
 *
 * 用第二个机器人 Player1 扮演"你"（真人客户端在协议层等价），与常驻的 DeepSeekBot 同处一个世界，
 * 全程通过**游戏内私聊**指挥，验证：
 *   T1 两个角色互相可见
 *   T2 "跟着我" → 跟随生效，队友走远后机器人跟上来
 *   T3 "别跟了" → 跟随停止
 *   T4 "过来"  → 机器人走到队友身边
 *   T5 "给你 3 个原木" → 队友背包真的多了 3 个原木
 *
 * 前置：./run-server.sh start && ./run-daemon.sh start
 * 用法: node test-coop.js
 */
import mineflayer from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const { pathfinder, Movements, goals } = pathfinderPkg
const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')

const HOST = '127.0.0.1'
const PORT = Number(process.env.MC_PORT ?? 25565)
const VERSION = process.env.MC_VERSION ?? '26.1'
const BOT = process.env.MC_USER ?? 'DeepSeekBot'
const ME = 'Player1'
const MCP_URL = process.env.MC_MCP_URL ?? 'http://127.0.0.1:8790/mcp'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`)
}

const serverCmd = (cmd) => {
  try {
    execFileSync(join(ROOT, 'run-server.sh'), ['cmd', cmd], { encoding: 'utf8' })
    return true
  } catch {
    return false
  }
}

// ---- 观察用：直连 MCP HTTP，只读地读机器人状态（不打扰 agent 回合）----
const mcp = new Client({ name: 'coop-observer', version: '0.0.1' })
await mcp.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)))
const botStatus = async () => {
  const res = await mcp.callTool({ name: 'mc_status', arguments: {} }, undefined, { timeout: 30_000 })
  return JSON.parse(res.content.find((c) => c.type === 'text').text)
}

// ---- 扮演"你"的角色 ----
const me = mineflayer.createBot({ host: HOST, port: PORT, username: ME, version: VERSION, auth: 'offline' })
me.loadPlugin(pathfinder)
me.on('error', (e) => {
  console.error('Player1 error:', e.message)
  process.exit(1)
})

const whispers = []
let lastSent = ''
me.on('whisper', (username, message) => {
  if (username !== BOT) return
  const text = String(message ?? '').trim()
  // 坑：自己发的 /msg 也会回显成 whisper（文本为空），必须过滤，
  // 否则"等到 2 条"会立刻满足，导致每轮都提前收尾、答案错位一轮。
  if (!text || text === lastSent) return
  whispers.push(text)
})

const ACK_PREFIX = '收到，正在处理'

/**
 * 发私聊并等完整回答。三阶段：
 *   ① 等 daemon 的"收到，正在处理"确认
 *   ② 等确认之后的答案第一片（agent 干活期间会静默几十秒，不能靠静默判断结束）
 *   ③ 等尾部安静 6 秒
 */
async function ask(text, maxMs = 240_000) {
  whispers.length = 0
  lastSent = text
  console.log(`\n→ 私聊：${text}`)
  me.chat(`/msg ${BOT} ${text}`)
  const deadline = Date.now() + maxMs

  const answers = () => whispers.filter((w) => !w.startsWith(ACK_PREFIX))

  // ① 等确认（拿不到也继续，可能 ack 被限流）
  const t0 = Date.now()
  while (Date.now() < deadline && !whispers.some((w) => w.startsWith(ACK_PREFIX)) && Date.now() - t0 < 20_000) {
    await sleep(300)
  }
  // ② 等答案第一片
  while (Date.now() < deadline && answers().length === 0) await sleep(300)
  // ③ 等尾部安静
  let last = Date.now()
  let count = whispers.length
  while (Date.now() < deadline) {
    await sleep(500)
    if (whispers.length !== count) {
      count = whispers.length
      last = Date.now()
    } else if (Date.now() - last > 6000) break
  }
  const answer = answers().join(' ')
  console.log(`  ← ${answer.slice(0, 160) || '(空)'}`)
  return answer
}

const dist = (a, b) => a.position.distanceTo(b.position)

me.once('spawn', async () => {
  await sleep(3000)
  const mp = new Movements(me)
  mp.canDig = false
  me.pathfinder.setMovements(mp)

  // ---------- T1 同世界互见 ----------
  const st = await botStatus()
  const them = (st.otherPlayers ?? []).find((p) => p.username === ME)
  const botSeesMe = them?.visible === true
  record(
    'T1 机器人能看见我（同世界两角色）',
    botSeesMe,
    `机器人在 ${JSON.stringify(st.position)}；它看到的 ${ME}: ${JSON.stringify(them)}`,
  )
  record('T1 机器人用户名独立', st.username === BOT, `bot=${st.username} me=${ME}`)

  // ---------- T2 跟着我 ----------
  await ask('跟着我，保持 3 格以内。')
  const f1 = (await botStatus()).following
  record('T2 跟随已激活', f1?.active === true, JSON.stringify(f1))

  // 我走远 ~18 格
  const home = me.entity.position.clone()
  const dest = home.offset(18, 0, 0)
  console.log(`  （我走向 ${dest.floored()}）`)
  try {
    await Promise.race([
      me.pathfinder.goto(new goals.GoalNear(dest.x, dest.y, dest.z, 3)),
      sleep(25_000),
    ])
  } catch (e) {
    console.log('  (我这边寻路提示:', e.message, ')')
  }
  await sleep(9000) // 给机器人追上来的时间
  const st2 = await botStatus()
  const d2 = st2.position && me.entity
    ? Math.hypot(st2.position.x - me.entity.position.x, st2.position.z - me.entity.position.z)
    : 999
  record('T2 机器人真的跟过来了', d2 < 10, `跟随时水平距离=${d2.toFixed(1)} 格（我走了约 18 格）`)

  // ---------- T3 别跟了 ----------
  await ask('别跟了，停下来。')
  const f2 = (await botStatus()).following
  record('T3 跟随已停止', !f2?.active, JSON.stringify(f2))

  // ---------- T4 过来 ----------
  const dest2 = me.entity.position.offset(-16, 0, 0)
  try {
    await Promise.race([me.pathfinder.goto(new goals.GoalNear(dest2.x, dest2.y, dest2.z, 3)), sleep(25_000)])
  } catch {}
  await sleep(1500)
  const before4 = await botStatus()
  const dBefore = Math.hypot(before4.position.x - me.entity.position.x, before4.position.z - me.entity.position.z)
  await ask('到我这儿来。')
  const after4 = await botStatus()
  const dAfter = Math.hypot(after4.position.x - me.entity.position.x, after4.position.z - me.entity.position.z)
  record(
    'T4 "过来"后机器人走到我身边',
    dAfter < 6 && dAfter < dBefore,
    `距离 ${dBefore.toFixed(1)} → ${dAfter.toFixed(1)} 格`,
  )

  // ---------- T5 给东西 ----------
  serverCmd(`give ${BOT} minecraft:oak_log 4`)
  await sleep(1500)
  const logsBefore = me.inventory.items().filter((i) => i.name === 'oak_log').reduce((s, i) => s + i.count, 0)
  await ask("把 3 个原木给我。背包里应该已经有了（之前给过），不用再去砍；用 mc_give 丢给我，我就站在你旁边。")
  // 掉落物需要一点时间被拾取
  let logsAfter = logsBefore
  for (let i = 0; i < 12; i++) {
    await sleep(500)
    logsAfter = me.inventory.items().filter((i) => i.name === 'oak_log').reduce((s, i) => s + i.count, 0)
    if (logsAfter - logsBefore >= 3) break
  }
  record('T5 我真的收到了 3 个原木', logsAfter - logsBefore >= 3, `我的背包 oak_log ${logsBefore} → ${logsAfter}`)

  await mcp.close()
  me.quit()
  await sleep(400)

  const failed = results.filter((r) => !r.pass)
  console.log(`\n===== COOP SUMMARY: ${results.length - failed.length}/${results.length} passed =====`)
  if (failed.length) console.log('failed:', failed.map((f) => f.name).join(', '))
  console.log(failed.length === 0 ? 'COOP_PASS' : 'COOP_FAIL')
  process.exit(failed.length === 0 ? 0 : 1)
})

setTimeout(() => {
  console.error('测试总超时')
  process.exit(2)
}, 600_000)
