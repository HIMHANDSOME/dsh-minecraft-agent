/**
 * 游戏内私聊交互：玩家 `/msg DeepSeekBot <内容>` → DeepSeek agent 在游戏里真的去做 → 私聊回复。
 *
 * 设计要点
 *  - **串行队列**：同一时刻只跑一个 agent turn，避免多个玩家抢同一个机器人。
 *  - **会话记忆**：第一次跑完记下 DSH 的 sessionId，之后用 `--session-id` 续接，形成连续对话。
 *  - **只私聊回复发起者**：用 bot.whisper，不污染公共聊天。
 *  - **失败如实回报**：agent 崩了/超时了，就把真实原因私聊回去，不假装成功。
 *  - 每条 turn 都会写进 MCP 审计日志（logs/mcp-audit.jsonl），事后可核对 agent 有没有瞎编。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')

/** 把玩家的一句话包装成给 agent 的任务说明。 */
function buildPrompt(username, message) {
  return [
    `【游戏内私聊】玩家 ${username} 在 Minecraft 里对你说：`,
    `「${message}」`,
    '',
    '请用 mc_* 工具在游戏里**实际执行**，而不是只描述计划。',
    '完成后用中文简洁汇报：做了什么、结果如何、当前坐标与背包要点。',
    '',
    '重要约束：',
    '- 你的最终回答会由系统**自动私聊**发给该玩家，所以你不需要、也不允许调用 mc_chat 发公共聊天。',
    '- mc_chat 是公共广播，会刷屏；本模式下发言已被禁用，调用会返回错误。',
    '- 回答控制在 300 字以内，不要用 Markdown 表格。',
  ].join('\n')
}

/** 从 DSH headless 的 NDJSON 事件流里取出会话号、最终回答和工具调用次数。 */
function parseEvents(stdout) {
  let sessionId = null
  let text = null
  let toolCalls = 0
  let error = null
  for (const line of stdout.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('{')) continue
    let ev
    try {
      ev = JSON.parse(t)
    } catch {
      continue
    }
    if (ev.type === 'session' && ev.sessionId) sessionId = ev.sessionId
    if (ev.type === 'tool_call') toolCalls++
    if (ev.type === 'final' && typeof ev.text === 'string') text = ev.text
    if (ev.type === 'error' && ev.message) error = ev.message
  }
  return { sessionId, text, toolCalls, error }
}

/**
 * @param {object} options
 * @param {object} options.manager BotManager（提供 whisperTo）
 * @param {(...a:any[]) => void} options.log
 * @returns {(username: string, message: string) => void} whisper 回调
 */
export function createIngameBridge({ manager, log }) {
  const sessionFile = process.env.MC_INGAME_SESSION_FILE ?? join(ROOT, 'logs', 'ingame-session.txt')
  const profile = process.env.MC_INGAME_PROFILE ?? 'minecraft-ingame'
  const allow = (process.env.MC_INGAME_ALLOW ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const maxQueue = Number(process.env.MC_INGAME_QUEUE ?? 10)
  const turnTimeoutMs = Number(process.env.MC_INGAME_TIMEOUT_MS ?? 300_000)
  const replyChars = Number(process.env.MC_INGAME_REPLY_CHARS ?? 900)

  const queue = []
  let running = false

  const readSession = () => {
    try {
      return readFileSync(sessionFile, 'utf8').trim() || null
    } catch {
      return null
    }
  }
  const writeSession = (id) => {
    try {
      mkdirSync(dirname(sessionFile), { recursive: true })
      writeFileSync(sessionFile, `${id}\n`)
    } catch (e) {
      log('ingame: cannot persist session id:', e.message)
    }
  }

  /** 跑一次 DSH headless，返回事件流解析结果。 */
  function runAgent(prompt, sessionId) {
    return new Promise((resolve, reject) => {
      const args = ['--json']
      if (sessionId) args.push('--session-id', sessionId)
      args.push(prompt)

      const child = spawn(join(ROOT, 'run-agent.sh'), args, {
        cwd: ROOT,
        env: { ...process.env, MC_PROFILE: profile },
      })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {}
        reject(new Error(`agent turn 超时（${turnTimeoutMs}ms）`))
      }, turnTimeoutMs)

      child.stdout.on('data', (d) => (stdout += d))
      child.stderr.on('data', (d) => {
        stderr += d
        if (stderr.length > 20000) stderr = stderr.slice(-20000)
      })
      child.on('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ code, stdout, stderr, ...parseEvents(stdout) })
      })
    })
  }

  async function runOne({ username, message }) {
    const startedAt = Date.now()
    log(`[ingame] ← ${username}: ${message}`)
    try {
      await manager.whisperTo(username, `收到，正在处理：「${message.slice(0, 60)}」`)
    } catch (e) {
      log('ingame: ack failed:', e.message)
    }

    let reply
    try {
      const priorSession = readSession()
      let result = await runAgent(buildPrompt(username, message), priorSession)

      // 持久化的会话可能失效（被清理/cwd 变了）→ 丢掉记忆重跑一次
      if (!result.text && priorSession) {
        log(`ingame: resume of ${priorSession} produced nothing (exit ${result.code}); retrying fresh`)
        result = await runAgent(buildPrompt(username, message), null)
      }

      if (result.sessionId) writeSession(result.sessionId)

      if (result.text) {
        const tools = result.toolCalls
        reply = result.text
        log(`[ingame] → ${username}: ${tools} 次工具调用，回答 ${reply.length} 字，${Date.now() - startedAt}ms`)
      } else {
        reply = `（Agent 没有产出回答，退出码 ${result.code}${result.error ? `：${result.error}` : ''}）`
        log(`[ingame] ✗ ${username}: no answer, exit=${result.code} stderr=${result.stderr.slice(-400)}`)
      }
    } catch (e) {
      reply = `（执行出错：${e.message}）`
      log(`[ingame] ✗ ${username}: ${e.message}`)
    }

    if (reply.length > replyChars) {
      reply = `${reply.slice(0, replyChars)}\n…（回答过长已截断，完整内容见 logs/ingame.log）`
    }
    try {
      await manager.whisperTo(username, reply)
    } catch (e) {
      log('ingame: reply failed:', e.message)
    }
  }

  async function drain() {
    if (running) return
    running = true
    try {
      while (queue.length > 0) {
        await runOne(queue.shift())
      }
    } finally {
      running = false
    }
  }

  /** whisper 事件回调（由 BotManager 调用）。 */
  return function onWhisper(username, message) {
    const text = String(message ?? '').trim()
    if (!text) return
    if (allow.length > 0 && !allow.includes(username)) {
      log(`[ingame] 拒绝 ${username}：不在 MC_INGAME_ALLOW 白名单内`)
      manager.whisperTo(username, '抱歉，我没有被授权响应你。').catch(() => {})
      return
    }
    if (queue.length >= maxQueue) {
      log(`[ingame] 队列已满（${maxQueue}），丢弃来自 ${username} 的消息`)
      manager.whisperTo(username, `我还在忙，队列已满（${maxQueue} 条），请稍后再试。`).catch(() => {})
      return
    }
    queue.push({ username, message: text })
    log(`[ingame] 入队 ${username}（队列 ${queue.length}${running ? '，当前有任务在跑' : ''}）`)
    void drain()
  }
}
