/**
 * 游戏内交互进阶测试：
 *   T1 真控制：私聊"砍 2 个原木" → 世界里真的少了树、背包真的多了原木
 *   T2 有记忆：紧接着追问"你刚才砍的是什么树、几个？" → 回答能引用上一轮上下文
 *
 * 前置：./run-server.sh start && ./run-daemon.sh start
 * 用法: node test-ingame-memory.js
 */
import mineflayer from 'mineflayer'
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const AUDIT = join(here, '..', 'logs', 'mcp-audit.jsonl')
const SERVER_LOG = join(here, '..', 'minecraft-server-26.1', 'console.log')
const SESSION_FILE = process.env.MC_INGAME_SESSION_FILE ?? join(here, '..', 'logs', 'ingame-session.txt')

const HOST = '127.0.0.1'
const PORT = Number(process.env.MC_PORT ?? 25565)
const VERSION = process.env.MC_VERSION ?? '26.1'
const TARGET = process.env.MC_USER ?? 'DeepSeekBot'
const ME = 'Tester2'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`)
}

const auditLines = () => {
  try {
    return readFileSync(AUDIT, 'utf8').split('\n').filter((l) => l.trim())
  } catch {
    return []
  }
}
const serverSayCount = () => {
  try {
    return readFileSync(SERVER_LOG, 'utf8').split('\n').filter((l) => l.includes('<DeepSeekBot>')).length
  } catch {
    return 0
  }
}

const whispers = []
const player = mineflayer.createBot({ host: HOST, port: PORT, username: ME, version: VERSION, auth: 'offline' })
player.on('error', (e) => {
  console.error('Tester2 error:', e.message)
  process.exit(1)
})
player.on('whisper', (username, message) => {
  if (username !== TARGET) return
  whispers.push(message)
  console.log(`  ← ${message.slice(0, 130)}`)
})

/**
 * 发一条私聊并等完整回答。
 *
 * 坑：daemon 会先回一条"收到，正在处理"，然后 agent 才开始干活（可能几十秒没有任何输出）。
 * 所以不能"一段时间没新消息就算说完"，必须先等到**第 2 条**（答案的第一片），
 * 再等尾部安静下来。
 */
async function ask(text, maxMs = 200_000) {
  whispers.length = 0
  console.log(`\n→ 私聊：${text}`)
  player.chat(`/msg ${TARGET} ${text}`)

  const deadline = Date.now() + maxMs
  // 阶段一：等确认 + 答案第一片
  while (Date.now() < deadline && whispers.length < 2) await sleep(500)
  // 阶段二：等尾部安静
  let last = Date.now()
  let count = whispers.length
  while (Date.now() < deadline) {
    await sleep(500)
    if (whispers.length !== count) {
      count = whispers.length
      last = Date.now()
    } else if (Date.now() - last > 6000) {
      break
    }
  }
  return whispers.filter((w) => !w.startsWith('收到，正在处理')).join(' ')
}

const readSession = () => {
  try { return readFileSync(SESSION_FILE, 'utf8').trim() } catch { return null }
}

player.once('spawn', async () => {
  await sleep(2500)
  // 干净的起点：清掉会话记忆与背包
  try { rmSync(SESSION_FILE, { force: true }) } catch {}

  const before = auditLines().length
  const sayBefore = serverSayCount()

  // ---------- T1：真控制 ----------
  const a1 = await ask('帮我砍 2 个原木，然后用 mc_status 看一下背包，告诉我结果。')
  const calls1 = auditLines().slice(before).map((l) => JSON.parse(l))
  const collects = calls1.filter((c) => c.tool === 'mc_collect')
  const collectedTotal = collects.reduce((s, c) => s + (c.result?.collected ?? 0), 0)
  const inv = calls1.filter((c) => c.tool === 'mc_status' || c.tool === 'mc_inventory').pop()?.result?.inventory ?? []
  const logs = inv.filter((i) => i.name.endsWith('_log')).reduce((s, i) => s + i.count, 0)

  record('T1 调用了 mc_collect', collects.length > 0, `${collects.length} 次`)
  record('T1 世界里真的采到了原木', collectedTotal >= 2, `collected=${collectedTotal}`)
  record('T1 背包里确实有原木', logs >= 2, `背包原木=${logs} ${JSON.stringify(inv)}`)
  record('T1 回答提到了采集结果', /原木|砍|采/.test(a1), `answer=${a1.slice(0, 120)}`)

  // ---------- T2：对话记忆 ----------
  const sessionAfterT1 = readSession()
  record('T2 会话号已持久化（供续接）', Boolean(sessionAfterT1), `session=${sessionAfterT1 ?? 'none'}`)

  const before2 = auditLines().length
  const a2 = await ask('你上一轮砍的是什么树？砍了几个？直接回答，不用再操作游戏。')
  const sessionAfterT2 = readSession()
  const calls2 = auditLines().slice(before2).map((l) => JSON.parse(l))
  const saidType = /(橡木|oak|桦木|birch|云杉|spruce)/i.test(a2)
  const saidCount = /(2|两)\s*(个|根|块)/.test(a2)

  // 最硬的记忆判据：两轮复用同一个 DSH session id
  record(
    'T2 复用同一会话（真记忆）',
    Boolean(sessionAfterT1) && sessionAfterT1 === sessionAfterT2,
    `${sessionAfterT1} → ${sessionAfterT2}`,
  )
  record('T2 回答引用了上一轮上下文', saidType && saidCount, `answer=${a2.slice(0, 160)}`)
  record('T2 追问本轮工具调用很少（靠记忆作答）', calls2.length <= 2, `本轮工具调用 ${calls2.length} 次`)
  record('全程未污染公共聊天', serverSayCount() === sayBefore, `<DeepSeekBot> 公共发言 ${sayBefore} → ${serverSayCount()}`)

  console.log(`\n--- T1 回答 ---\n${a1}\n--- T2 回答 ---\n${a2}\n`)
  player.quit()
  await sleep(400)

  const failed = results.filter((r) => !r.pass)
  console.log(`===== MEMORY SUMMARY: ${results.length - failed.length}/${results.length} passed =====`)
  console.log(failed.length === 0 ? 'MEMORY_PASS' : 'MEMORY_FAIL')
  process.exit(failed.length === 0 ? 0 : 1)
})

setTimeout(() => {
  console.error('测试总超时')
  process.exit(2)
}, 420_000)
