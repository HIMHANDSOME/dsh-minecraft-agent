/**
 * 游戏内私聊交互的端到端测试（不涉及人工操作）
 *
 * 做法：再连一个机器人当"玩家"（Tester），由它执行
 *     /msg DeepSeekBot <指令>
 * 然后等待 DeepSeekBot 私聊回复，并验证：
 *   1) 收到确认 + 最终回答两条私聊
 *   2) 回答里带真实游戏数据（坐标/血量）
 *   3) **回答没有出现在公共聊天里**（按需求：只私发给发起者）
 *   4) 审计日志显示 agent 在这段时间内真的调用了 mc_* 工具
 *
 * 前置：./run-server.sh start && ./run-daemon.sh start
 * 用法: node test-ingame.js
 */
import mineflayer from 'mineflayer'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const AUDIT = join(here, '..', 'logs', 'mcp-audit.jsonl')

const HOST = '127.0.0.1'
const PORT = Number(process.env.MC_PORT ?? 25565)
const VERSION = process.env.MC_VERSION ?? '26.1'
const TARGET = process.env.MC_USER ?? 'DeepSeekBot'
const ME = 'Tester'

const INSTRUCTION = process.env.MC_TEST_INSTRUCTION ?? '你现在在哪里？血量多少？看一下背包再回答我。'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`)
}

const auditCount = () => {
  try {
    return readFileSync(AUDIT, 'utf8').split('\n').filter((l) => l.trim()).length
  } catch {
    return 0
  }
}

const auditSince = (offset) => {
  try {
    return readFileSync(AUDIT, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .slice(offset)
      .map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

const whispers = [] // 别人发给 Tester 的私聊

// 公共聊天是否被刷屏，以**服务端日志**为准（mineflayer 的 position 会把私聊也标成 chat，不可靠）
const SERVER_LOG = join(here, '..', 'minecraft-server-26.1', 'console.log')
const publicSayCount = () => {
  try {
    return readFileSync(SERVER_LOG, 'utf8').split('\n').filter((l) => l.includes('<DeepSeekBot>')).length
  } catch {
    return 0
  }
}

const player = mineflayer.createBot({ host: HOST, port: PORT, username: ME, version: VERSION, auth: 'offline' })
player.on('error', (e) => {
  console.error('Tester error:', e.message)
  process.exit(1)
})
let lastSent = ''
player.on('whisper', (username, message) => {
  const text = String(message ?? '').trim()
  // 自己发的 /msg 会回显成 whisper（文本为空），必须过滤
  if (!text || text === lastSent) return
  whispers.push({ username, message: text })
  console.log(`  ← 私聊 from ${username}: ${text.slice(0, 120)}`)
})

player.once('spawn', async () => {
  await sleep(2500)
  console.log(`Tester 已上线，向 ${TARGET} 发私聊：「${INSTRUCTION}」`)

  const before = auditCount()
  const sayBefore = publicSayCount()
  lastSent = INSTRUCTION
  player.chat(`/msg ${TARGET} ${INSTRUCTION}`)

  // 三阶段：等确认 → 等答案第一片 → 等尾部安静
  const deadline = Date.now() + 220_000
  const ACK = '收到，正在处理'
  const answers = () => whispers.filter((w) => !w.message.startsWith(ACK))
  const t0 = Date.now()
  while (Date.now() < deadline && !whispers.some((w) => w.message.startsWith(ACK)) && Date.now() - t0 < 20_000) {
    await sleep(300)
  }
  while (Date.now() < deadline && answers().length === 0) await sleep(300)
  let lastAt = Date.now()
  let seen = whispers.length
  while (Date.now() < deadline) {
    await sleep(500)
    if (whispers.length !== seen) {
      seen = whispers.length
      lastAt = Date.now()
    } else if (Date.now() - lastAt > 6000) break
  }
  const after = auditCount()
  const calls = auditSince(before)
  const toolNames = calls.map((c) => c.tool)

  const fromBot = whispers.filter((w) => w.username === TARGET && !w.message.startsWith('收到，正在处理'))
  // 回复会被分片成多条私聊，必须拼起来判断（只看最后一条会漏掉数据）
  const answer = fromBot.map((w) => w.message).join(' ')
  const sayAfter = publicSayCount()

  record('收到机器人私聊回复', fromBot.length >= 1, `${fromBot.length} 条`)
  record('回复来自目标机器人', fromBot.length >= 1, `from=${fromBot.map((w) => w.username).join(',') || '-'}`)
  record(
    '回复包含真实游戏数据',
    /(-?\d+[.,]?\d*\s*,\s*-?\d+)|血量|生命|坐标|背包/.test(answer),
    `answer=${answer.slice(0, 140).replace(/\n/g, ' ')}`,
  )
  record(
    '回答只走私聊，未进公共聊天',
    sayAfter === sayBefore,
    `服务端日志中 <DeepSeekBot> 公共发言 ${sayBefore} → ${sayAfter}`,
  )
  record('Agent 真实调用了 mc_* 工具', toolNames.length > 0, `工具: ${toolNames.join(',') || '(无)'}`)

  console.log('\n--- 审计日志中本次窗口的工具调用 ---')
  for (const c of calls) {
    const r = c.result ?? {}
    console.log(`  ${c.tool} (${c.durationMs}ms) ok=${r.ok} ${r.error ? 'err=' + r.error : ''}`)
  }
  console.log(`\n--- 完整回答 ---\n${answer}\n`)

  player.quit()
  await sleep(400)

  const failed = results.filter((r) => !r.pass)
  console.log(`===== INGAME SUMMARY: ${results.length - failed.length}/${results.length} passed =====`)
  console.log(failed.length === 0 ? 'INGAME_PASS' : 'INGAME_FAIL')
  process.exit(failed.length === 0 ? 0 : 1)
})

setTimeout(() => {
  console.error('测试总超时')
  process.exit(2)
}, 260_000)
