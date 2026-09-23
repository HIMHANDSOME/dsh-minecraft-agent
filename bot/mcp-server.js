#!/usr/bin/env node
/**
 * Minecraft MCP Server (stdio) — 自研薄封装
 *
 * 设计原则
 *  1. 只暴露"可预测、有边界"的动作，不提供任意命令执行（不能 /op、/kick、/stop）。
 *  2. 每个工具都有硬超时；失败返回结构化错误，绝不挂死 MCP 会话。
 *  3. stdout 专供 MCP 协议，所有日志走 stderr。
 *  4. Bot 懒连接：MCP 层可以先起来（DSH failOnStartupError 才安全），游戏连接按需建立。
 *
 * 目标版本：Minecraft Java 26.1（mineflayer 4.39.0 支持上限）
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import mineflayer from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import Vec3 from 'vec3'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { pathfinder, Movements, goals } = pathfinderPkg

// P0 批量施工能力（building.md §0）：受控的 mc_fill / mc_scan_region / mc_batch。
// 复用 builder-core 的白名单、施工区/保护圈校验、逐条回执与审计。
import {
  fill as controlledFill,
  setblock as controlledSetblock,
  scanRegion,
  loadSite,
  ALLOWED_BLOCKS,
} from './builder-core.js'

let SITE = null
try {
  SITE = loadSite()
} catch (e) {
  log('site.json 未就绪，mc_fill/mc_batch 暂不做施工区校验:', e.message)
}

const HOST = process.env.MC_HOST ?? '127.0.0.1'
const PORT = Number(process.env.MC_PORT ?? 25565)
const USER = process.env.MC_USER ?? 'DeepSeekBot'
const VERSION = process.env.MC_VERSION ?? '26.1'
const SPAWN_TIMEOUT_MS = Number(process.env.MC_SPAWN_TIMEOUT_MS ?? 30_000)

const log = (...a) => console.error('[mc-mcp]', ...a)

// ---------------------------------------------------------------------------
// 服务端审计日志
// LLM 的自述不可作为验收证据；这里由 MCP 服务端（而非模型）记录每一次
// 工具调用的入参与真实返回，S3 验收时用它与 Agent 的最终回答交叉核对。
// ---------------------------------------------------------------------------
const AUDIT_PATH =
  process.env.MC_AUDIT_LOG ??
  join(dirname(fileURLToPath(import.meta.url)), '..', 'logs', 'mcp-audit.jsonl')

function audit(entry) {
  try {
    mkdirSync(dirname(AUDIT_PATH), { recursive: true })
    appendFileSync(AUDIT_PATH, JSON.stringify(entry) + '\n')
  } catch (e) {
    log('audit write failed:', e.message)
  }
}

/** 只保留可核对的字段，避免把整棵实体树写进日志。 */
function auditResult(res) {
  const text = res?.content?.find?.((c) => c.type === 'text')?.text
  let parsed = text
  try {
    parsed = JSON.parse(text)
  } catch {}
  return { isError: Boolean(res?.isError), result: parsed }
}

// ---------------------------------------------------------------------------
// 基础设施
// ---------------------------------------------------------------------------

/** 硬超时包装：任何工具都不会让 MCP 调用无限等待。 */
function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 统一成功返回。 */
const ok = (payload) => ({
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
})

/** 统一失败返回：ok:false + isError，方便 Agent 自行纠正。 */
const err = (message, extra = {}) => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message, ...extra }, null, 2) }],
})

// ---------------------------------------------------------------------------
// Bot 生命周期管理
// ---------------------------------------------------------------------------

const chatLog = []
const MAX_CHAT_LOG = 50

class BotManager {
  constructor() {
    this.bot = null
    this.connecting = null
    this.lastError = null
    /** 收到私聊时的回调（游戏内交互模式才设置）：(username, message) => void */
    this.whisperSink = null
    /** 有工具调用正在执行时为 true，"跟随"循环会让路，避免抢机器人 */
    this.busy = false
    /** 跟随状态（startFollow/stopFollow 管理） */
    this.follow = null
  }

  get connected() {
    return Boolean(this.bot?.entity)
  }

  async ensure() {
    if (this.connected) return this.bot
    if (this.connecting) return this.connecting

    this.connecting = (async () => {
      const bot = mineflayer.createBot({
        host: HOST,
        port: PORT,
        username: USER,
        version: VERSION,
        auth: 'offline',
        checkTimeoutInterval: 60_000,
      })
      bot.loadPlugin(pathfinder)

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`bot spawn timeout after ${SPAWN_TIMEOUT_MS}ms`))
        }, SPAWN_TIMEOUT_MS)
        const done = (fn) => (arg) => {
          clearTimeout(timer)
          fn(arg)
        }
        bot.once('spawn', done(() => resolve()))
        bot.once('error', done((e) => reject(e)))
        bot.once('kicked', done((r) => reject(new Error(`kicked: ${JSON.stringify(r)}`))))
        bot.once('end', done(() => reject(new Error('connection ended before spawn'))))
      })

      const movements = new Movements(bot)
      movements.canDig = false // 默认不挖穿地形，路径更可预测
      bot.pathfinder.setMovements(movements)

      const columns = await waitForWorld(bot)
      log(`world ready: ${columns} chunks loaded`)

      bot.on('message', (jsonMsg, position) => {
        chatLog.push({ t: Date.now(), position, text: jsonMsg.toString() })
        if (chatLog.length > MAX_CHAT_LOG) chatLog.shift()
      })
      // builder-core 的 waitForChat 需要 bot._chatLines，直接复用 chatLog
      bot._chatLines = chatLog
      // 游戏内交互入口：玩家 /msg <bot> <内容> 会触发 whisper 事件
      bot.on('whisper', (username, message) => {
        chatLog.push({ t: Date.now(), position: 'whisper', text: `<${username} → 我> ${message}` })
        if (chatLog.length > MAX_CHAT_LOG) chatLog.shift()
        try {
          this.whisperSink?.(username, message)
        } catch (e) {
          log('whisper sink error:', e.message)
        }
      })
      bot.on('death', () => {
        chatLog.push({ t: Date.now(), position: 'system', text: `${USER} died and will respawn` })
      })
      bot.on('error', (e) => {
        this.lastError = e.message
        log('bot error:', e.message)
      })
      bot.on('end', () => {
        log('bot disconnected')
        if (this.bot === bot) this.bot = null
      })

      this.bot = bot
      log(`connected as ${bot.username} to ${HOST}:${PORT} (${bot.version})`)
      return bot
    })().finally(() => {
      this.connecting = null
    })

    return this.connecting
  }

  /** 每个工具统一入口：拿 bot + 包错误。同时标记忙碌，让"跟随"循环不要跟工具调用抢机器人。 */
  async use(fn) {
    this.busy = true
    try {
      const bot = await withTimeout(this.ensure(), SPAWN_TIMEOUT_MS + 5_000, 'connect')
      return await fn(bot)
    } catch (e) {
      return err(e?.message ?? String(e), { lastError: this.lastError })
    } finally {
      this.busy = false
    }
  }

  // ---- 跟随玩家（"跟着我"）------------------------------------------------
  // 常驻后台循环：只要目标玩家离得比 distance 远就走过去。任何工具调用期间让路。
  // 这样用户说一次"跟着我"，机器人会一直跟着，直到说"别跟了"。

  startFollow(username, distance = 3) {
    this.stopFollow()
    const bot = this.bot
    const state = {
      active: true,
      username,
      distance,
      startedAt: Date.now(),
      moves: 0,
      lastDistance: null,
      lastError: null,
      running: false,
    }
    state.timer = setInterval(async () => {
      if (!state.active || state.running) return
      if (!this.connected || this.busy) return
      const target = this.bot?.players?.[username]?.entity
      if (!target) {
        state.lastError = `看不到玩家 ${username}（可能不同维度或未加载）`
        return
      }
      const d = this.bot.entity.position.distanceTo(target.position)
      state.lastDistance = +d.toFixed(2)
      if (d <= distance) return
      state.running = true
      this.busy = true
      try {
        await gotoNear(this.bot, target.position, Math.max(1, distance - 1), 6000, 'mc_follow')
        state.moves++
        state.lastError = null
      } catch (e) {
        state.lastError = e.message
      } finally {
        this.busy = false
        state.running = false
      }
    }, 1200)
    this.follow = state
    return state
  }

  stopFollow() {
    if (this.follow?.timer) clearInterval(this.follow.timer)
    const prev = this.follow
    this.follow = null
    return prev
  }

  followStatus() {
    if (!this.follow?.active) return { active: false }
    const { timer, ...rest } = this.follow
    return rest
  }

  /** 给指定玩家发私聊，自动按 220 字符分片（MC 单条聊天上限 256）。 */
  async whisperTo(username, text) {
    const bot = await this.ensure()
    const chunks = String(text).split('\n').flatMap((line) => line.match(/[\s\S]{1,220}/g) ?? [''])
    let sent = 0
    for (const chunk of chunks) {
      if (!chunk.trim()) continue
      bot.whisper(username, chunk)
      sent++
      await sleep(350) // 别刷屏，也别触发服务端限流
    }
    return sent
  }

  /** 在公共聊天里说一句。 */
  async say(text) {
    const bot = await this.ensure()
    for (const chunk of String(text).match(/[\s\S]{1,220}/g) ?? []) {
      bot.chat(chunk)
      await sleep(350)
    }
  }

  shutdown() {
    this.stopFollow()
    try {
      this.bot?.quit()
    } catch {}
  }
}

const manager = new BotManager()

// ---------------------------------------------------------------------------
// 世界读取辅助
// ---------------------------------------------------------------------------

const posOf = (v) => ({ x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) })

function blockIds(bot, names) {
  const ids = []
  const unknown = []
  for (const n of names) {
    const id = bot.registry.blocksByName[n]?.id
    if (id === undefined) unknown.push(n)
    else ids.push(id)
  }
  return { ids, unknown }
}

/** 由方块的 drops 推断掉落物名，用于判断是否真的入包。 */
function dropNames(bot, blockName) {
  const out = new Set()
  const block = bot.registry.blocksByName[blockName]
  for (const id of block?.drops ?? []) {
    const item = bot.registry.items?.[id]
    if (item?.name) out.add(item.name)
  }
  if (out.size === 0) out.add(blockName)
  return [...out]
}

const itemCount = (bot, name) =>
  bot.inventory.items().filter((i) => i.name === name).reduce((s, i) => s + i.count, 0)

const horizDist = (bot, b) =>
  Math.hypot(b.x + 0.5 - bot.entity.position.x, b.z + 0.5 - bot.entity.position.z)

/**
 * 选挖掘目标。
 *
 * 关键教训（实测踩过）：直接取 findBlock 的"最近方块"，树上的目标会把机器人
 * 带上树顶；从树顶往下挖，掉落物落到地面好几格以下，既超出约 1 格的拾取半径
 * 又下不去，表现为"挖掉了但 nothing picked up"。
 *
 * 因此：先在最近的方块簇里锁定目标资源，再优先取**最低**的那一块，让 GoalNear
 * 把机器人带到地面、站在树干底部，掉落物自然落在脚边。
 */
function pickBlock(bot, ids, maxDistance, { preferLowest = true, exclude = null } = {}) {
  let all = bot.findBlocks({ matching: ids, maxDistance, count: 128 })
  if (exclude && exclude.size > 0) {
    const kept = all.filter((b) => !exclude.has(`${b.x},${b.y},${b.z}`))
    if (kept.length > 0) all = kept // 全被拉黑时才不得不回头用旧的
  }
  if (all.length === 0) return null
  if (!preferLowest) return bot.blockAt(all[0])
  const nearest = Math.min(...all.map((b) => horizDist(bot, b)))
  const cluster = all.filter((b) => horizDist(bot, b) <= nearest + 3)
  cluster.sort((a, b) => a.y - b.y || horizDist(bot, a) - horizDist(bot, b))
  return bot.blockAt(cluster[0])
}

/**
 * spawn 事件不代表区块已加载完。刚连上就查询世界会得到"空世界"的假象，
 * 因此所有世界读取前都先等区块到位。
 */
async function waitForWorld(bot, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let count = 0
  while (Date.now() < deadline) {
    try {
      count = bot.world?.getColumns?.()?.length ?? 0
    } catch {
      count = 0
    }
    if (count >= 25) {
      await sleep(400) // 再等一拍让方块数据填充
      return count
    }
    await sleep(200)
  }
  return count
}

const inventorySummary = (bot) =>
  bot.inventory
    .items()
    .map((i) => ({ name: i.name, count: i.count }))
    .sort((a, b) => a.name.localeCompare(b.name))

function statusOf(bot) {
  const p = bot.entity.position
  const hostiles = Object.values(bot.entities).filter(
    (e) => e.type === 'hostile' && e.position.distanceTo(p) < 24,
  )
  const players = Object.values(bot.players ?? {})
    .filter((pl) => pl.username !== bot.username)
    .map((pl) => {
      const e = pl.entity
      return {
        username: pl.username,
        ping: pl.ping,
        // 协同玩时最需要的信息：队友在哪、离我多远
        visible: Boolean(e),
        position: e ? posOf(e.position) : null,
        distance: e ? +e.position.distanceTo(p).toFixed(1) : null,
      }
    })
  return {
    ok: true,
    connected: true,
    username: bot.username,
    serverVersion: bot.version,
    position: posOf(p),
    dimension: bot.game.dimension,
    health: bot.health,
    food: bot.food,
    heldItem: bot.heldItem?.name ?? null,
    timeOfDay: bot.time.timeOfDay,
    isDay: bot.time.timeOfDay < 13000,
    inventory: inventorySummary(bot),
    nearbyHostileCount: hostiles.length,
    nearestHostile: hostiles
      .map((e) => ({ name: e.name, distance: +e.position.distanceTo(p).toFixed(1) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3),
    otherPlayers: players,
    following: manager.followStatus(),
  }
}

/**
 * 停掉后台寻路。
 *
 * ⚠️ 实测结论（`bot/probe-pathfinder.js` 复现过）：**绝不能调用
 * `bot.pathfinder.stop()`** —— 它之后每一次 `bot.pathfinder.goto()` 都会立刻以
 * `PathStopped` 失败，等于把 pathfinder 永久打坏。只调 `setGoal(null)` 是安全的：
 * 它同样会清空路径、释放锁并 clearControlStates() 让机器人停下。
 *
 * 另外 `withTimeout` 只拒绝外层 Promise，底层 goto 仍会 reject，所以在
 * gotoNear 里给它挂一个空 catch，避免 unhandledRejection。
 */
function haltPathfinder(bot) {
  try {
    bot.pathfinder?.setGoal(null)
  } catch {}
}

async function gotoNear(bot, target, range, timeoutMs, label = 'goto') {
  const goal = new goals.GoalNear(target.x, target.y, target.z, range)
  const pending = bot.pathfinder.goto(goal)
  pending.catch(() => {}) // 超时放弃后底层 promise 仍可能 reject
  try {
    await withTimeout(pending, timeoutMs, label)
  } catch (e) {
    haltPathfinder(bot) // 清理泄漏的寻路任务（只 setGoal(null)，不要 stop()）
    throw e
  }
}

async function waitForAnyPickup(bot, before, expectNames, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  const baseline = new Map(before.map((i) => [i.name, i.count]))
  while (Date.now() < deadline) {
    await sleep(200)
    for (const i of bot.inventory.items()) {
      const had = baseline.get(i.name) ?? 0
      const gained = i.count - had
      if (gained > 0 && (expectNames.length === 0 || expectNames.includes(i.name))) {
        return { name: i.name, gained }
      }
    }
  }
  return null
}

/**
 * 挖完后的拾取：掉落物会落到地面，玩家拾取半径只有约 1 格，
 * 所以必须主动走过去。否则"挖到了但没入包"。
 *
 * 难点是掉落物可能落在机器人**下方**（比如站在树上挖），此时寻路经常报
 * "Took to long to decide path to goal!"。这里做了三层降级：
 *   1) 常规寻路过去（允许临时挖穿，方便下树/下坑）
 *   2) 寻路失败就朝目标方向直行 + 跳（借助重力自然下落到掉落物处）
 *   3) 每轮都重新检查背包，一旦入包立即返回
 */
async function chaseDrops(bot, center, before, expect, budgetMs) {
  const deadline = Date.now() + budgetMs
  const movements = bot.pathfinder?.movements
  const hadCanDig = movements?.canDig
  if (movements) movements.canDig = true // 下树/下坑需要
  try {
    while (Date.now() < deadline) {
      const pick = await waitForAnyPickup(bot, before, expect, 300)
      if (pick) return pick
      const drops = Object.values(bot.entities)
        .filter((e) => e !== bot.entity && e.name === 'item' && e.position.distanceTo(center) < 8)
        .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))
      if (drops.length === 0) return null
      const d = drops[0]
      const dist = bot.entity.position.distanceTo(d.position)
      if (dist < 1.2) {
        await sleep(200)
        continue
      }
      try {
        await gotoNear(bot, d.position, 0, Math.min(4000, Math.max(600, deadline - Date.now())), 'chase')
      } catch {
        // 降级：朝掉落物方向走 + 跳，靠重力落下去
        try {
          await bot.lookAt(d.position.offset(0, 0.2, 0), true)
          bot.setControlState('forward', true)
          const below = d.position.y < bot.entity.position.y - 0.5
          if (below) bot.setControlState('jump', true)
          await sleep(450)
          bot.setControlState('forward', false)
          bot.setControlState('jump', false)
        } catch {}
      }
    }
    return null
  } finally {
    if (movements && hadCanDig !== undefined) movements.canDig = hadCanDig
  }
}

// ---------------------------------------------------------------------------
// MCP 工具定义
// ---------------------------------------------------------------------------

/** 每个 MCP 会话需要一个独立的 McpServer 实例（HTTP 传输要求），但它们共用同一个机器人。 */
function buildServer() {
  const server = new McpServer({
    name: 'minecraft',
    version: '0.1.0',
    instructions: [
      `你是通过本 MCP 服务器操纵 Minecraft Java ${VERSION} 里一个名为 ${USER} 的机器人的 Agent。`,
      '建议工作流：先调用 mc_status 了解自身状态 → mc_scan 找目标 → mc_goto 靠近 → mc_dig/mc_collect 取物 → 用 mc_status 复核。',
      '所有坐标都是世界绝对坐标（方块坐标，不是实体坐标）；y 向上为正。',
      '每个工具都可能失败（超时、没有路径、目标不存在），失败时返回 { ok:false, error }，请根据错误调整策略而不是重复同一调用。',
      'mc_collect 是最常用的采集工具：它会自己走过去并挖掘，直到拿到指定数量或超时。',
      '生存循环：mc_collect 拿资源 → mc_craft 合成（工作台会自动去找）→ mc_place 放置方块 → mc_container 存取箱子 → mc_smelt 烧炼。',
      '注意 mc_craft 的 count 是"合成次数"而非产物个数；mc_smelt 每 1 个物品约需 10 秒。',
      '战斗中可用 mc_attack；它会自动换武器、低血先吃东西。mc_eat 可单独用来回饥饿。',
    '协同玩（玩家和你各操控一个角色）：mc_status 的 otherPlayers 会给出队友坐标与距离；',
    '  mc_follow 持续跟着某个玩家（说一次"跟着我"即可，用 mc_follow stop 停止）、mc_goto_player 走到队友身边、mc_give 把物品丢给队友。',
    ].join('\n'),
  })

  /** 注册工具的统一入口：保证任何异常都被转成结构化错误，并且一定写审计日志。 */
  const register = (name, config, handler) => {
    server.registerTool(name, config, async (args, extra) => {
      const startedAt = Date.now()
      let res
      try {
        res = await handler(args, extra)
      } catch (e) {
        res = err(e?.message ?? String(e))
      }
      audit({
        t: new Date().toISOString(),
        tool: name,
        args,
        durationMs: Date.now() - startedAt,
        ...auditResult(res),
      })
      return res
    })
  }

  register(
    'mc_status',
    {
      title: '获取机器人状态',
      description: '只读。返回坐标、维度、血量、饥饿、手持物、背包、附近敌对生物与其他玩家。首次调用会自动连接游戏。',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => manager.use(async (bot) => ok(statusOf(bot))),
  )

  register(
    'mc_scan',
    {
      title: '扫描附近方块与实体',
      description: '只读。在指定半径内查找若干种方块，返回最近若干个的坐标与距离；同时返回附近实体类型统计。用于寻找树木、矿石、水源等。',
      inputSchema: {
        blockNames: z.array(z.string()).describe('要查找的方块名（如 ["oak_log","birch_log","stone","iron_ore"]），可为空数组只查实体'),
        maxDistance: z.number().int().min(1).max(96).default(32).describe('搜索半径（方块）'),
        limit: z.number().int().min(1).max(32).default(8).describe('每种方块最多返回几个'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ blockNames, maxDistance, limit }) =>
      manager.use(async (bot) => {
        const { ids, unknown } = blockIds(bot, blockNames)
        const scanOnce = () => {
          const found = []
          for (let i = 0; i < blockNames.length; i++) {
            const id = ids[i]
            if (id === undefined) continue
            const blocks = bot.findBlocks({ matching: id, maxDistance, count: limit })
            for (const bp of blocks) {
              found.push({
                block: blockNames[i],
                position: { x: bp.x, y: bp.y, z: bp.z },
                distance: +bot.entity.position.distanceTo(bp.offset(0.5, 0.5, 0.5)).toFixed(1),
              })
            }
          }
          found.sort((a, b) => a.distance - b.distance)
          return found
        }

        // 刚连上/刚换维度时区块可能还没到位，空结果重试一次再下结论
        let found = scanOnce()
        let retriedForChunks = false
        if (found.length === 0 && blockNames.length > 0) {
          retriedForChunks = true
          await waitForWorld(bot, 6000)
          found = scanOnce()
        }

        const hist = {}
        for (const e of Object.values(bot.entities)) {
          if (e === bot.entity) continue
          hist[e.name ?? e.displayName ?? 'unknown'] = (hist[e.name ?? e.displayName ?? 'unknown'] ?? 0) + 1
        }
        return ok({
          ok: true,
          origin: posOf(bot.entity.position),
          blocks: found.slice(0, Math.max(limit, limit * Math.max(1, blockNames.length))),
          unknownBlockNames: unknown,
          entityHistogram: hist,
          retriedForChunks,
        })
      }),
  )

  register(
    'mc_chat',
    {
      title: '聊天：发言 / 读取',
      description: '可选发送一条聊天消息；同时返回最近的聊天记录。用于向同服玩家汇报或读取服务器消息。',
      inputSchema: {
        message: z.string().max(240).optional().describe('要发送的内容；省略则只读取记录'),
        limit: z.number().int().min(1).max(50).default(10).describe('返回最近多少条记录'),
      },
    },
    async ({ message, limit }) =>
      manager.use(async (bot) => {
        // 游戏内私聊模式下禁用公共发言：agent 曾自作主张用 mc_chat "私下汇报"，
        // 而 mc_chat 其实是公共广播，会破坏"只私聊回复发起者"的约定。
        // 光靠提示词不够，这里做硬约束。
        if (message && process.env.MC_NO_PUBLIC_CHAT === '1') {
          return err(
            '公共发言已在此模式下禁用。你的最终回答会由系统自动私聊发给提问的玩家，' +
              '请直接给出回答文本，不要调用 mc_chat 发言。',
            { attempted: message, recent: chatLog.slice(-limit) },
          )
        }
        if (message) bot.chat(message)
        return ok({ ok: true, sent: message ?? null, recent: chatLog.slice(-limit) })
      }),
  )

  register(
    'mc_look_at',
    {
      title: '看向某个位置或实体',
      description: '让机器人转向指定坐标，或转向最近的指定名称实体。常用于对准要交互的目标。',
      inputSchema: {
        x: z.number().optional(),
        y: z.number().optional(),
        z: z.number().optional(),
        entityName: z.string().optional().describe('实体名（如 "cow"），与坐标二选一'),
      },
    },
    async ({ x, y, z: zc, entityName }) =>
      manager.use(async (bot) => {
        if (entityName) {
          const target = Object.values(bot.entities)
            .filter((e) => e !== bot.entity && e.name === entityName)
            .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0]
          if (!target) return err(`no entity named ${entityName} nearby`)
          await bot.lookAt(target.position.offset(0, target.height ?? 1, 0), true)
          return ok({ ok: true, lookingAt: { entity: entityName, position: posOf(target.position) } })
        }
        if (x === undefined || y === undefined || zc === undefined) return err('provide either x/y/z or entityName')
        await bot.lookAt(new Vec3(x, y, zc), true)
        return ok({ ok: true, lookingAt: { x, y, z: zc } })
      }),
  )

  register(
    'mc_goto',
    {
      title: '走到指定坐标',
      description: '用寻路算法走到目标坐标附近（range 为可接受的接近距离，默认 1）。不挖穿地形。超时会返回错误。',
      inputSchema: {
        x: z.number(),
        y: z.number(),
        z: z.number(),
        range: z.number().min(0).max(8).default(1),
        timeoutMs: z.number().int().min(1000).max(60_000).default(30_000),
      },
    },
    async ({ x, y, z: zc, range, timeoutMs }) =>
      manager.use(async (bot) => {
        const start = bot.entity.position.clone()
        const t0 = Date.now()
        try {
          await gotoNear(bot, { x, y, z: zc }, range, timeoutMs, 'mc_goto')
        } catch (e) {
          return err(e.message, { from: posOf(start), to: { x, y, z: zc }, nowAt: posOf(bot.entity.position) })
        }
        return ok({
          ok: true,
          from: posOf(start),
          to: { x, y, z: zc },
          nowAt: posOf(bot.entity.position),
          elapsedMs: Date.now() - t0,
        })
      }),
  )

  register(
    'mc_follow',
    {
      title: '跟着某个玩家',
      description:
        '协同玩专用。action=start 让机器人持续跟着指定玩家（你只要说一次"跟着我"）；action=stop 停止；action=status 查看当前状态。后台循环会自动让路给其它工具调用，所以"跟着我"和"顺便砍棵树"可以并存。',
      inputSchema: {
        action: z.enum(['start', 'stop', 'status']).default('start'),
        player: z.string().optional().describe('要跟随的玩家名；action=start 时必填'),
        distance: z.number().min(1).max(16).default(3).describe('保持的距离（格）'),
      },
    },
    async ({ action, player, distance }) =>
      manager.use(async (bot) => {
        if (action === 'status') return ok({ ok: true, following: manager.followStatus() })
        if (action === 'stop') {
          const prev = manager.stopFollow()
          return ok({ ok: true, stopped: true, was: prev ? { player: prev.username, moves: prev.moves } : null })
        }
        if (!player) return err('action=start 需要 player')
        ensurePlayerVisible(bot, player)
        const state = manager.startFollow(player, distance)
        return ok({
          ok: true,
          following: player,
          distance,
          note: `会一直跟着 ${player}，直到收到 mc_follow stop`,
          botAt: posOf(bot.entity.position),
        })
      }),
  )

  register(
    'mc_goto_player',
    {
      title: '走到某个玩家身边',
      description: '走到指定玩家的当前位置附近（一次性）。适合"过来""到我这儿"。range 为可接受的接近距离。',
      inputSchema: {
        player: z.string().describe('目标玩家名'),
        range: z.number().min(1).max(8).default(2),
        timeoutMs: z.number().int().min(1000).max(60_000).default(30_000),
      },
    },
    async ({ player, range, timeoutMs }) =>
      manager.use(async (bot) => {
        const target = ensurePlayerVisible(bot, player)
        const dest = target.position.clone()
        const start = bot.entity.position.clone()
        try {
          await gotoNear(bot, dest, range, timeoutMs, 'mc_goto_player')
        } catch (e) {
          return err(`走不到 ${player} 身边：${e.message}`, {
            playerAt: posOf(dest),
            nowAt: posOf(bot.entity.position),
            distance: +bot.entity.position.distanceTo(dest).toFixed(1),
          })
        }
        return ok({
          ok: true,
          player,
          playerAt: posOf(dest),
          nowAt: posOf(bot.entity.position),
          distance: +bot.entity.position.distanceTo(dest).toFixed(1),
          movedFrom: posOf(start),
        })
      }),
  )

  register(
    'mc_give',
    {
      title: '把物品交给某个玩家',
      description:
        '协同玩专用。走到玩家身边并把背包里的物品丢出来让他拾取（Minecraft 没有直接"交易"接口，靠丢在地上）。会自动走到 1~2 格内再丢，确保对方捡得到。',
      inputSchema: {
        player: z.string().describe('接收物品的玩家名'),
        itemName: z.string().describe('物品名，如 "oak_log"'),
        count: z.number().int().min(1).max(64).default(1),
        timeoutMs: z.number().int().min(2000).max(60_000).default(20_000),
      },
    },
    async ({ player, itemName, count, timeoutMs }) =>
      manager.use(async (bot) => {
        const item = bot.inventory.items().find((i) => i.name === itemName)
        if (!item) return err(`背包里没有 ${itemName}`, { inventory: inventorySummary(bot) })
        const n = Math.min(count, item.count)
        const target = ensurePlayerVisible(bot, player)

        const gap = () => bot.entity.position.distanceTo(target.position)

        /** 贴近玩家到约 1 格（寻路停不进去时用直行补足）。 */
        const snuggle = async () => {
          if (gap() > 1.2) {
            try {
              await gotoNear(bot, target.position, 1, Math.min(timeoutMs, 30_000), 'approach player')
            } catch (e) {
              if (gap() > 3) throw new Error(`走不到 ${player} 身边：${e.message}`)
            }
          }
          for (let i = 0; i < 10 && gap() > 1.2; i++) {
            try {
              await bot.lookAt(target.position.offset(0, 1, 0), true)
              bot.setControlState('forward', true)
              await sleep(220)
              bot.setControlState('forward', false)
              await sleep(80)
            } catch {
              break
            }
          }
        }

        const droppedByUs = (beforeIds) =>
          Object.values(bot.entities).filter(
            (e) => e.name === 'item' && !beforeIds.has(String(e.id)) && e.position.distanceTo(target.position) < 8,
          )

        let attempt = 0
        let lastInfo = null
        let lastTossed = 0
        while (attempt < 2) {
          attempt++

          // 每次都重新查背包。踩过的坑：第一次丢完背包就变了，重试时若复用旧的
          // item 引用，bot.toss 会抛 "Can't find <name> in slots [9 - 45]"，
          // 而且东西已经丢出去了 —— 看起来像"物品凭空消失"。
          const stack = bot.inventory.items().find((i) => i.name === itemName)
          if (!stack) {
            if (attempt === 1) return err(`背包里没有 ${itemName}`, { inventory: inventorySummary(bot) })
            break
          }
          const n = Math.min(count, stack.count)

          await snuggle()
          const beforeIds = new Set(Object.keys(bot.entities))
          const dDropBot = gap()

          // 关键：**垂直丢下**而不是朝玩家抛。
          // 实测：朝玩家丢会带 ~0.3 格/tick 前向速度，物品飞出 2~3 格，超出约 1.4 格的
          // 拾取半径，玩家就捡不到。pitch=-90° 时 cos(pitch)=0，前向速度归零。
          // ⚠️ look() 只是把 rotation 包写出去，服务端处理"丢弃"点击时可能还没收到，
          //    于是仍用旧朝向投掷 —— 必须留一点时间差（踩过：机器人只离 0.9 格，
          //    物品却落在 2.58 格外）。
          try {
            await bot.look(bot.entity.yaw, -Math.PI / 2, true)
          } catch {}
          await sleep(400)
          const pitchUsed = bot.entity.pitch
          await bot.toss(stack.type, null, n)
          await sleep(900)
          lastTossed += n

          const ours = droppedByUs(beforeIds)
          const minToPlayer = ours.length
            ? Math.min(...ours.map((e) => e.position.distanceTo(target.position)))
            : null
          lastInfo = { items: ours, minToPlayer, dDropBot, count: ours.length, pitchUsed: +pitchUsed.toFixed(2) }

          if (ours.length > 0 && minToPlayer !== null && minToPlayer <= 1.35) break
          if (ours.length === 0) break // 没看到掉落物（可能被秒捡），如实报告

          if (attempt === 1) {
            // 落点太远 → 把物品捡回来，别弄丢
            for (const d of ours) {
              try {
                await gotoNear(bot, d.position, 0, 5000, 'recover item')
                await sleep(500)
              } catch {}
            }
          }
        }

        // 退开，避免 2 秒拾取冷却过后自己把东西又捡回去
        try {
          bot.setControlState('back', true)
          await sleep(700)
          bot.setControlState('back', false)
        } catch {}

        const minToPlayer = lastInfo?.minToPlayer ?? null
        const okDelivery = minToPlayer !== null && minToPlayer <= 1.35
        return ok({
          ok: true,
          gave: itemName,
          count: lastTossed,
          to: player,
          attempts: attempt,
          droppedItems: lastInfo?.count ?? 0,
          // 真正有意义的指标：掉落物实体到玩家的距离（不是机器人到玩家的距离）
          itemToPlayerDistance: minToPlayer === null ? null : +minToPlayer.toFixed(2),
          distanceBotToPlayer: +(lastInfo?.dDropBot ?? gap()).toFixed(2),
          lookPitch: lastInfo?.pitchUsed ?? null,
          withinPickupRange: okDelivery,
          note: okDelivery
            ? '物品已丢在玩家约 1 格内（垂直丢下、不向前抛），玩家会自动拾取'
            : '物品已丢出，但落点离玩家超过约 1.4 格，玩家可能需要走一步去捡',
          inventory: inventorySummary(bot),
        })
      }),
  )

  register(
    'mc_dig',
    {
      title: '挖掘一个方块',
      description: '挖掘指定坐标的方块，或挖掘附近最近的指定名称方块。距离超过够不着时会自动先走过去。',
      inputSchema: {
        x: z.number().optional(),
        y: z.number().optional(),
        z: z.number().optional(),
        blockName: z.string().optional().describe('方块名，如 "oak_log"；与坐标二选一'),
        maxDistance: z.number().int().min(1).max(48).default(16).describe('按名称查找时的搜索半径'),
        timeoutMs: z.number().int().min(1000).max(120_000).default(20_000),
      },
    },
    async ({ x, y, z: zc, blockName, maxDistance, timeoutMs }) =>
      manager.use(async (bot) => {
        let block = null
        if (x !== undefined && y !== undefined && zc !== undefined) {
          block = bot.blockAt(new Vec3(x, y, zc))
          if (!block || block.boundingBox === 'empty') return err(`no solid block at ${x},${y},${zc}`)
        } else if (blockName) {
          const { ids } = blockIds(bot, [blockName])
          if (ids.length === 0) return err(`unknown block name: ${blockName}`)
          block = pickBlock(bot, ids, maxDistance)
          if (!block) return err(`no ${blockName} within ${maxDistance} blocks`)
        } else {
          return err('provide either x/y/z or blockName')
        }

        const before = inventorySummary(bot)
        const expect = dropNames(bot, block.name)
        const target = block.position.clone()
        const reach = bot.entity.position.distanceTo(target.offset(0.5, 0.5, 0.5))
        if (reach > 4) {
          try {
            await gotoNear(bot, target, 1, Math.min(timeoutMs, 40_000), 'approach')
          } catch (e) {
            return err(`cannot reach ${block.name} at ${target}: ${e.message}`)
          }
        }
        const fresh = bot.blockAt(target)
        if (!fresh || fresh.boundingBox === 'empty') return err(`block at ${target} already gone`)

        haltPathfinder(bot) // 挖之前先确保没有残留寻路任务在推机器人
        await withTimeout(bot.dig(fresh, true), timeoutMs, 'mc_dig')
        const pick = await chaseDrops(bot, target, before, expect, 6000)
        return ok({
          ok: true,
          dug: fresh.name,
          position: { x: target.x, y: target.y, z: target.z },
          expectedDrops: expect,
          pickedUp: pick,
          inventory: inventorySummary(bot),
        })
      }),
  )

  register(
    'mc_collect',
    {
      title: '采集指定方块若干数量',
      description:
        '最常用的采集工具：反复寻找最近的指定方块 → 走过去 → 挖掉 → 把掉落物捡起来，直到拿到 count 个或超时。适合"砍一棵树""挖点石头"。够不着或寻路失败的目标会被拉黑，自动换下一个。',
      inputSchema: {
        blockName: z.string().describe('要采集的方块名，如 "oak_log"'),
        count: z.number().int().min(1).max(64).default(1),
        maxDistance: z.number().int().min(1).max(96).default(32),
        timeoutMs: z.number().int().min(2000).max(150_000).default(45_000),
      },
    },
    async ({ blockName, count, maxDistance, timeoutMs }) =>
      manager.use(async (bot) => {
        const ids = blockIds(bot, [blockName]).ids
        if (ids.length === 0) return err(`unknown block name: ${blockName}`)

        const expect = dropNames(bot, blockName)
        const totalOf = () => expect.reduce((s, n) => s + itemCount(bot, n), 0)
        const baseline = totalOf()
        let attempts = 0
        const failures = []

        // 硬性总时限兜底：内部任何一步卡住都必须返回，绝不让 MCP 调用无限挂起
        // （实测遇到过 mc_collect 超出自身 timeoutMs 数分钟不返回的情况）
        try {
          return await withTimeout(
            (async () => {
              const deadline = Date.now() + timeoutMs
              let stagnant = 0
              let lastProgressAt = 0
              const skip = new Set() // 够不着/寻路失败的目标拉黑，换个目标再试，别死磕同一块
              const budget = () => Math.max(1000, deadline - Date.now())

              while (Date.now() < deadline) {
                const collected = totalOf() - baseline
                if (collected >= count) {
                  return ok({
                    ok: true,
                    target: blockName,
                    requested: count,
                    collected,
                    expectedDrops: expect,
                    attempts,
                    inventory: inventorySummary(bot),
                  })
                }

                attempts++

                // 防空转：连续多次没有任何进展就停下
                if (totalOf() - baseline > lastProgressAt) {
                  lastProgressAt = totalOf() - baseline
                  stagnant = 0
                } else if (++stagnant >= 15) {
                  failures.push(`连续 ${stagnant} 次尝试没有任何进展，提前停止`)
                  break
                }

                const block = pickBlock(bot, ids, maxDistance, { exclude: skip })
                if (!block) {
                  failures.push(`no ${blockName} within ${maxDistance}`)
                  break
                }
                const target = block.position.clone()
                try {
                  if (bot.entity.position.distanceTo(target.offset(0.5, 0.5, 0.5)) > 4.2) {
                    await gotoNear(bot, target, 1, Math.min(20_000, budget()), 'approach')
                  }
                  const fresh = bot.blockAt(target)
                  if (!fresh || fresh.boundingBox === 'empty') {
                    failures.push(`block ${target} disappeared`)
                    await sleep(150)
                    continue
                  }
                  if (bot.entity.position.distanceTo(target.offset(0.5, 0.5, 0.5)) > 5) {
                    const gap = bot.entity.position.distanceTo(target.offset(0.5, 0.5, 0.5))
                    failures.push(`${fresh.name} at ${target} out of reach (${gap.toFixed(1)})`)
                    skip.add(`${target.x},${target.y},${target.z}`)
                    await sleep(150)
                    continue
                  }
                  const before = inventorySummary(bot)
                  const gap = bot.entity.position.distanceTo(target.offset(0.5, 0.5, 0.5))
                  haltPathfinder(bot) // 残留寻路会让服务端 abort 挖掘
                  await withTimeout(bot.dig(fresh, true), Math.min(15_000, budget()), 'dig')
                  const pick = await chaseDrops(bot, target, before, expect, Math.min(6000, budget()))
                  if (!pick) failures.push(`dug ${fresh.name} at ${target} (距 ${gap.toFixed(1)}) but nothing picked up`)
                } catch (e) {
                  failures.push(e.message)
                  skip.add(`${target.x},${target.y},${target.z}`) // 寻路失败也拉黑，换目标
                }
                await sleep(120) // 给服务端留出节奏，避免请求风暴
              }

              return err(
                `collected ${totalOf() - baseline}/${count} of ${blockName} before running out of time or targets`,
                { collected: totalOf() - baseline, expectedDrops: expect, attempts, failures: failures.slice(-5), inventory: inventorySummary(bot) },
              )
            })(),
            timeoutMs + 10_000,
            `mc_collect(${blockName})`,
          )
        } catch (e) {
          return err(`采集超出时限：${e.message}`, {
            collected: totalOf() - baseline,
            attempts,
            failures: failures.slice(-5),
            inventory: inventorySummary(bot),
          })
        }
      }),
  )

  register(
    'mc_place',
    {
      title: '放置一个方块',
      description:
        '把背包里的方块放到指定坐标（需要有相邻支撑面）。**不给坐标**时会放在你当前视线所看方块的上面——先用 mc_look_at 看向一个地面方块即可。',
      inputSchema: {
        blockName: z.string(),
        x: z.number().optional(),
        y: z.number().optional(),
        z: z.number().optional(),
        timeoutMs: z.number().int().min(1000).max(60_000).default(15_000),
      },
    },
    async ({ blockName, x, y, z: zc, timeoutMs }) =>
      manager.use(async (bot) => {
        const item = bot.inventory.items().find((i) => i.name === blockName)
        if (!item) return err(`not in inventory: ${blockName}`, { inventory: inventorySummary(bot) })

        // 模式二：不给坐标 → 放在视线所看方块的上面
        if (x === undefined || y === undefined || zc === undefined) {
          const ref = bot.blockAtCursor(4.5)
          if (!ref) return err('视线里没有可依附的方块：先用 mc_look_at 看向地面，或直接提供 x/y/z')
          await bot.equip(item, 'hand')
          const at = ref.position.offset(0, 1, 0)
          await withTimeout(bot.placeBlock(ref, new Vec3(0, 1, 0)), timeoutMs, 'mc_place')
          await sleep(200) // 等服务端确认背包扣减，否则快照会显示"放了但数量没减"
          return ok({
            ok: true,
            placed: blockName,
            at: { x: at.x, y: at.y, z: at.z },
            against: ref.name,
            mode: 'cursor',
            inventory: inventorySummary(bot),
          })
        }

        const target = new Vec3(x, y, zc)
        if (bot.entity.position.distanceTo(target.offset(0.5, 0.5, 0.5)) > 4) {
          try {
            await gotoNear(bot, target, 3, Math.min(timeoutMs, 30_000), 'approach')
          } catch (e) {
            return err(`cannot reach ${x},${y},${zc}: ${e.message}`)
          }
        }
        await bot.equip(item, 'hand')
        const faces = [
          [0, -1, 0],
          [0, 1, 0],
          [1, 0, 0],
          [-1, 0, 0],
          [0, 0, 1],
          [0, 0, -1],
        ]
        for (const [dx, dy, dz] of faces) {
          const ref = bot.blockAt(target.offset(dx, dy, dz))
          if (ref && ref.boundingBox === 'block') {
            await withTimeout(bot.placeBlock(ref, new Vec3(-dx, -dy, -dz)), timeoutMs, 'mc_place')
            await sleep(200) // 同上：等背包同步
            return ok({ ok: true, placed: blockName, at: { x, y, z: zc }, against: ref.name, inventory: inventorySummary(bot) })
          }
        }
        return err(`no supporting block face at ${x},${y},${zc}`)
      }),
  )

  register(
    'mc_inventory',
    {
      title: '背包操作',
      description: 'action=list 列出背包；equip 把物品放到手上；drop 丢出物品。',
      inputSchema: {
        action: z.enum(['list', 'equip', 'drop']).default('list'),
        itemName: z.string().optional(),
        count: z.number().int().min(1).max(64).optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ action, itemName, count }) =>
      manager.use(async (bot) => {
        if (action === 'list') return ok({ ok: true, inventory: inventorySummary(bot), heldItem: bot.heldItem?.name ?? null })
        if (!itemName) return err('itemName is required for equip/drop')
        const item = bot.inventory.items().find((i) => i.name === itemName)
        if (!item) return err(`not in inventory: ${itemName}`, { inventory: inventorySummary(bot) })
        if (action === 'equip') {
          await bot.equip(item, 'hand')
          return ok({ ok: true, equipped: itemName, heldItem: bot.heldItem?.name ?? null })
        }
        await bot.toss(item.type, null, Math.min(count ?? item.count, item.count))
        return ok({ ok: true, dropped: itemName, amount: Math.min(count ?? item.count, item.count), inventory: inventorySummary(bot) })
      }),
  )

  // ---------------------------------------------------------------------------
  // 生存循环辅助：武器 / 食物 / 燃料 / 容器识别
  // ---------------------------------------------------------------------------

  const allBlocks = (bot) => bot.registry.blocksArray ?? Object.values(bot.registry.blocksByName)

  /** 从背包挑最好的武器：剑优先于斧，同类型取材质更好的。 */
  function bestWeapon(bot) {
    const tiers = ['wooden', 'stone', 'copper', 'iron', 'golden', 'diamond', 'netherite']
    const score = (n) => {
      const kind = n.endsWith('_sword') ? 2 : n.endsWith('_axe') ? 1 : 0
      const t = tiers.findIndex((x) => n.startsWith(`${x}_`))
      return kind * 100 + (t < 0 ? 0 : t)
    }
    return (
      bot.inventory
        .items()
        .filter((i) => i.name.endsWith('_sword') || i.name.endsWith('_axe'))
        .sort((a, b) => score(b.name) - score(a.name))[0] ?? null
    )
  }

  /** 从背包挑食物，优先营养值高的。 */
  function bestFood(bot) {
    const foods = bot.registry.foodsByName ?? {}
    return (
      bot.inventory
        .items()
        .filter((i) => foods[i.name])
        .sort((a, b) => (foods[b.name]?.foodPoints ?? 0) - (foods[a.name]?.foodPoints ?? 0))[0] ?? null
    )
  }

  /** 常见燃料，按"烧得久"排序；只返回背包里真实存在的。 */
  const FUEL_PREFERENCE = [
    'coal_block', 'dried_kelp_block', 'coal', 'charcoal', 'oak_planks', 'birch_planks',
    'spruce_planks', 'oak_log', 'birch_log', 'spruce_log', 'stick', 'bamboo',
  ]
  function pickFuel(bot, preferredName) {
    const items = bot.inventory.items()
    if (preferredName) return items.find((i) => i.name === preferredName) ?? null
    for (const n of FUEL_PREFERENCE) {
      const hit = items.find((i) => i.name === n)
      if (hit) return hit
    }
    return null
  }

  const CONTAINER_BLOCKS = new Set([
    'chest', 'trapped_chest', 'ender_chest', 'barrel', 'hopper', 'dispenser', 'dropper', 'brewing_stand', 'crafter',
  ])
  const FURNACE_BLOCKS = new Set(['furnace', 'blast_furnace', 'smoker'])
  const isContainerName = (n) => CONTAINER_BLOCKS.has(n) || n.endsWith('shulker_box')
  const isFurnaceName = (n) => FURNACE_BLOCKS.has(n)

  function findBlockByName(bot, predicate, maxDistance) {
    const ids = allBlocks(bot).filter((b) => predicate(b.name)).map((b) => b.id)
    if (ids.length === 0) return null
    return bot.findBlock({ matching: ids, maxDistance })
  }

  /** 够不着就走过去（≤4 格直接交互）。 */
  async function reachBlock(bot, block, range, timeoutMs, label) {
    const d = bot.entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5))
    if (d <= 4) return
    await gotoNear(bot, block.position, range, timeoutMs, label)
  }

  /** 取一个玩家实体；拿不到就抛出可读错误（会被 use() 转成结构化错误）。 */
  function ensurePlayerVisible(bot, username) {
    const pl = bot.players?.[username]
    if (!pl) throw new Error(`服务器上看不到玩家 ${username}（名字拼错了？）`)
    if (!pl.entity) throw new Error(`看不到 ${username} 的本体（可能不在同一维度、距离太远或区块未加载）`)
    return pl.entity
  }

  const countOf = (items, name) => items.filter((i) => i.name === name).reduce((s, i) => s + i.count, 0)

  register(
    'mc_eat',
    {
      title: '进食',
      description: '从背包里挑最有营养的食物吃掉，恢复饥饿值。饥饿值低会影响回血和疾跑。',
      inputSchema: {},
    },
    async () =>
      manager.use(async (bot) => {
        if (bot.food >= 20) return err(`不饿（food=${bot.food}），无法进食`, { health: bot.health })
        const food = bestFood(bot)
        if (!food) return err('背包里没有可吃的食物', { inventory: inventorySummary(bot), food: bot.food })
        const before = { food: bot.food, health: bot.health }
        await bot.equip(food, 'hand')
        await withTimeout(bot.consume(), 10_000, 'mc_eat')
        // 服务端确认进食要一个来回，立刻读会得到"吃了但饥饿值没变"的假象
        for (let i = 0; i < 12 && bot.food === before.food && bot.health === before.health; i++) {
          await sleep(200)
        }
        return ok({ ok: true, ate: food.name, before, after: { food: bot.food, health: bot.health } })
      }),
  )

  register(
    'mc_attack',
    {
      title: '攻击实体',
      description:
        '攻击附近的敌对生物（或 entityName 指定的实体），直到击杀 count 个或超时。会自动走到攻击距离并换上背包里最好的武器；血量偏低时先吃东西、过低则撤退。默认只打敌对生物，不会误杀牛羊。',
      inputSchema: {
        entityName: z.string().optional().describe('指定实体名（如 "zombie"、"cow"）。省略则攻击最近的敌对生物'),
        count: z.number().int().min(1).max(20).default(1),
        maxDistance: z.number().int().min(4).max(48).default(20),
        timeoutMs: z.number().int().min(2000).max(60_000).default(30_000),
      },
    },
    async ({ entityName, count, maxDistance, timeoutMs }) =>
      manager.use(async (bot) => {
        const deadline = Date.now() + timeoutMs
        const filter = entityName ? (e) => e.name === entityName : (e) => e.type === 'hostile'
        const weapon = bestWeapon(bot)
        if (weapon) await bot.equip(weapon, 'hand')
        const notes = []
        let attacks = 0
        let kills = 0
        let whiffs = 0

        while (Date.now() < deadline && kills < count) {
          if (bot.health <= 8) {
            const food = bestFood(bot)
            if (food) {
              try {
                await bot.equip(food, 'hand')
                await withTimeout(bot.consume(), 8000, 'eat')
                notes.push(`ate ${food.name} at health ${bot.health}`)
              } catch {}
            }
            if (bot.health <= 4) {
              notes.push(`health too low (${bot.health}), retreating`)
              break
            }
          }

          const target = bot.nearestEntity(
            (e) => e !== bot.entity && filter(e) && e.position.distanceTo(bot.entity.position) <= maxDistance,
          )
          if (!target) {
            notes.push(`no ${entityName ?? 'hostile'} within ${maxDistance}`)
            break
          }
          if (bot.entity.position.distanceTo(target.position) > 2.8) {
            try {
              await gotoNear(bot, target.position, 2, Math.min(8000, Math.max(1000, deadline - Date.now())), 'approach')
            } catch (e) {
              notes.push(`approach failed: ${e.message}`)
            }
          }
          if (!target.isValid) {
            kills++
            continue
          }

          // 只在真的够得着时才挥击：超出距离挥空不算攻击，否则会出现
          // "attacks=35 kills=0" 这种误导性结果。
          const gap = bot.entity.position.distanceTo(target.position)
          if (gap > 3.2) {
            try {
              await gotoNear(bot, target.position, 1, Math.min(6000, Math.max(1000, deadline - Date.now())), 'approach')
            } catch {}
            if (bot.entity.position.distanceTo(target.position) > 3.2) {
              whiffs++
              notes.push(`out of reach: ${target.name} at ${gap.toFixed(1)} blocks`)
              await sleep(300)
              continue
            }
          }

          try {
            await bot.lookAt(target.position.offset(0, (target.height ?? 1.6) * 0.8, 0), true)
          } catch {}
          const healthBefore = bot.health
          bot.attack(target)
          attacks++
          await sleep(500)
          if (!target.isValid) kills++
          if (bot.health < healthBefore) notes.push(`took damage (${healthBefore} -> ${bot.health})`)
        }

        return ok({
          ok: true,
          target: entityName ?? 'hostile',
          attacks,
          kills,
          whiffs,
          requested: count,
          weapon: weapon?.name ?? 'fist',
          health: bot.health,
          food: bot.food,
          position: posOf(bot.entity.position),
          notes: notes.slice(-5),
        })
      }),
  )

  register(
    'mc_craft',
    {
      title: '合成物品',
      description:
        '用背包里的材料合成物品。会自动判断是否需要工作台：不需要的（如原木→木板）直接合成；需要的会去找附近的合成台。注意 count 是"合成次数"而不是产物个数（例如 1 次 oak_planks 产出 4 个木板）。材料不足时会明确告诉你缺什么。',
      inputSchema: {
        itemName: z.string().describe('产物名，如 "oak_planks"、"stick"、"crafting_table"、"furnace"、"wooden_pickaxe"'),
        count: z.number().int().min(1).max(64).default(1).describe('合成次数'),
        maxTableDistance: z.number().int().min(2).max(16).default(8),
        timeoutMs: z.number().int().min(2000).max(60_000).default(30_000),
      },
    },
    async ({ itemName, count, maxTableDistance, timeoutMs }) =>
      manager.use(async (bot) => {
        const item = bot.registry.itemsByName[itemName]
        if (!item) return err(`unknown item: ${itemName}`)

        let table = findBlockByName(bot, (n) => n === 'crafting_table', maxTableDistance)
        let recipes = bot.recipesFor(item.id, null, 1, table ?? null)
        if (recipes.length === 0 && table) {
          try {
            await reachBlock(bot, table, 2, Math.min(15000, timeoutMs), 'approach table')
            table = bot.blockAt(table.position) ?? table
            recipes = bot.recipesFor(item.id, null, 1, table)
          } catch (e) {
            return err(`走不到合成台: ${e.message}`, { craftingTable: posOf(table.position) })
          }
        }
        if (recipes.length === 0) {
          return err(`没有可用配方：${itemName}（材料不足，或需要附近有合成台）`, {
            inventory: inventorySummary(bot),
            craftingTableNearby: Boolean(table),
          })
        }

        const before = bot.inventory.items().map((i) => ({ name: i.name, count: i.count }))
        const beforeMap = new Map(before.map((i) => [i.name, i.count]))
        const gainedNow = () => {
          const g = {}
          for (const i of bot.inventory.items()) {
            const had = beforeMap.get(i.name) ?? 0
            if (i.count > had) g[i.name] = (g[i.name] ?? 0) + (i.count - had)
          }
          return g
        }

        // 先按配方实际消耗估算"最多能做几次"，避免"做了 5 次、第 6 次才抛
        // missing ingredient"这种把部分成功报成整体失败的情况。
        const recipe = recipes[0]
        let times = count
        let clamped = false
        try {
          let maxTimes = Infinity
          for (const d of recipe.delta ?? []) {
            if (d.count < 0 && d.item?.name) {
              const need = -d.count
              const have = countOf(bot.inventory.items(), d.item.name)
              maxTimes = Math.min(maxTimes, Math.floor(have / need))
            }
          }
          if (Number.isFinite(maxTimes) && maxTimes < count) {
            times = Math.max(1, maxTimes)
            clamped = true
          }
        } catch {}

        let craftError = null
        try {
          await withTimeout(bot.craft(recipe, times, table ?? null), timeoutMs, 'mc_craft')
        } catch (e) {
          craftError = e.message
        }
        const gained = gainedNow()

        if (craftError && Object.keys(gained).length === 0) {
          return err(`合成失败：${craftError}`, { itemName, times, inventory: inventorySummary(bot) })
        }
        return ok({
          ok: true,
          crafted: itemName,
          times,
          requestedTimes: count,
          clampedToAvailableMaterials: clamped,
          usesTable: Boolean(table),
          gained,
          partial: Boolean(craftError),
          note: craftError ? `只完成了部分合成：${craftError}` : undefined,
          inventory: inventorySummary(bot),
        })
      }),
  )

  register(
    'mc_container',
    {
      title: '箱子/容器存取',
      description:
        '对箱子、木桶、潜影盒等容器做 list（查看内容）/ deposit（存入）/ withdraw（取出）。不给坐标就自动找最近的容器。',
      inputSchema: {
        action: z.enum(['list', 'deposit', 'withdraw']).default('list'),
        x: z.number().optional(),
        y: z.number().optional(),
        z: z.number().optional(),
        itemName: z.string().optional().describe('deposit/withdraw 必填'),
        count: z.number().int().min(1).max(64).optional(),
        maxDistance: z.number().int().min(2).max(48).default(16),
        timeoutMs: z.number().int().min(2000).max(60_000).default(20_000),
      },
    },
    async ({ action, x, y, z: zc, itemName, count, maxDistance, timeoutMs }) =>
      manager.use(async (bot) => {
        let block = x !== undefined && y !== undefined && zc !== undefined ? bot.blockAt(new Vec3(x, y, zc)) : null
        if (!block || block.boundingBox === 'empty') block = findBlockByName(bot, isContainerName, maxDistance)
        if (!block) return err(`附近 ${maxDistance} 格内没找到容器（先 mc_craft chest 再 mc_place 放置）`)
        if (!isContainerName(block.name)) return err(`${block.name} 不是可存取的容器`)

        try {
          await reachBlock(bot, block, 2, Math.min(15000, timeoutMs), 'approach container')
        } catch (e) {
          return err(`走不到容器: ${e.message}`, { container: posOf(block.position) })
        }

        const win = await withTimeout(bot.openContainer(block), timeoutMs, 'open container')
        try {
          const contents = () => win.containerItems().map((i) => ({ name: i.name, count: i.count }))
          if (action === 'list') {
            return ok({ ok: true, container: block.name, position: posOf(block.position), contents: contents() })
          }
          if (!itemName) return err('deposit/withdraw 需要 itemName')
          if (!bot.registry.itemsByName[itemName]) return err(`unknown item: ${itemName}`)
          const want = count ?? 1

          if (action === 'deposit') {
            // 注意：win.deposit/withdraw 要的是**背包/容器物品**的 .type，
            // 而 registry.itemsByName[x] 是物品定义（字段是 .id）。混用会报 Invalid itemType。
            const invItem = bot.inventory.items().find((i) => i.name === itemName)
            if (!invItem) return err(`背包里没有 ${itemName}`, { inventory: inventorySummary(bot) })
            const moved = Math.min(want, invItem.count)
            await withTimeout(win.deposit(invItem.type, null, moved), timeoutMs, 'deposit')
            return ok({ ok: true, action, itemName, moved, container: block.name, position: posOf(block.position), contents: contents(), inventory: inventorySummary(bot) })
          }

          const chestItem = win.containerItems().find((i) => i.name === itemName)
          if (!chestItem) return err(`容器里没有 ${itemName}`, { contents: contents() })
          const moved = Math.min(want, chestItem.count)
          await withTimeout(win.withdraw(chestItem.type, null, moved), timeoutMs, 'withdraw')
          return ok({ ok: true, action, itemName, moved, container: block.name, position: posOf(block.position), contents: contents(), inventory: inventorySummary(bot) })
        } finally {
          try {
            win.close()
          } catch {}
        }
      }),
  )

  register(
    'mc_smelt',
    {
      title: '熔炉冶炼',
      description:
        '把物品放进熔炉烧炼并取出产物。自动按"耐烧"顺序挑背包里的燃料（煤块/煤/木炭/木板/原木/木棍），自动找附近熔炉或使用指定坐标。注意烧炼很慢：每 1 个物品约 10 秒，请自行控制 count 与 timeoutMs。',
      inputSchema: {
        inputName: z.string().describe('要烧炼的物品，如 "raw_iron"、"sand"、"cobblestone"、"raw_beef"'),
        fuelName: z.string().optional().describe('指定燃料；省略则自动挑'),
        count: z.number().int().min(1).max(64).default(1),
        x: z.number().optional(),
        y: z.number().optional(),
        z: z.number().optional(),
        maxDistance: z.number().int().min(2).max(48).default(16),
        timeoutMs: z.number().int().min(5000).max(120_000).default(60_000),
      },
    },
    async ({ inputName, fuelName, count, x, y, z: zc, maxDistance, timeoutMs }) =>
      manager.use(async (bot) => {
        let block = x !== undefined && y !== undefined && zc !== undefined ? bot.blockAt(new Vec3(x, y, zc)) : null
        if (!block || block.boundingBox === 'empty') block = findBlockByName(bot, isFurnaceName, maxDistance)
        if (!block) return err(`附近 ${maxDistance} 格内没找到熔炉（先 mc_craft furnace 再 mc_place 放置）`)
        if (!isFurnaceName(block.name)) return err(`${block.name} 不是熔炉`)

        if (!bot.registry.itemsByName[inputName]) return err(`unknown item: ${inputName}`)
        // 与 mc_container 同理：putInput 要的是背包物品的 .type，不是物品定义的 .id
        const inputItem = bot.inventory.items().find((i) => i.name === inputName)
        if (!inputItem) return err(`背包里没有 ${inputName}`, { inventory: inventorySummary(bot) })
        const haveInput = inputItem.count
        const fuel = pickFuel(bot, fuelName)
        if (!fuel) return err('背包里没有可用燃料', { inventory: inventorySummary(bot) })

        try {
          await reachBlock(bot, block, 2, Math.min(15000, timeoutMs), 'approach furnace')
        } catch (e) {
          return err(`走不到熔炉: ${e.message}`, { furnace: posOf(block.position) })
        }

        const win = await withTimeout(bot.openFurnace(block), timeoutMs, 'open furnace')
        try {
          const n = Math.min(count, haveInput)
          await withTimeout(win.putInput(inputItem.type, null, n), timeoutMs, 'putInput')
          await withTimeout(win.putFuel(fuel.type, null, 1), timeoutMs, 'putFuel')

          const deadline = Date.now() + timeoutMs
          let out = null
          while (Date.now() < deadline) {
            out = win.outputItem()
            if (out && out.count > 0) break
            await sleep(500)
          }
          if (!out || out.count === 0) {
            return err(`烧炼超时：${inputName} 未产出（每 1 个约需 10 秒，可调大 timeoutMs 或减小 count）`, {
              fuelUsed: fuel.name,
              inputCount: n,
              furnace: block.name,
            })
          }
          await withTimeout(win.takeOutput(), timeoutMs, 'takeOutput')
          return ok({
            ok: true,
            smelted: inputName,
            inputCount: n,
            fuelUsed: fuel.name,
            got: { name: out.name, count: out.count },
            inventory: inventorySummary(bot),
          })
        } finally {
          try {
            win.close()
          } catch {}
        }
      }),
  )

  register(
    'mc_wait',
    {
      title: '等待若干秒',
      description: '等待游戏世界推进（例如等方块掉落物被拾取、等天亮、等作物生长）。',
      inputSchema: { seconds: z.number().min(0.1).max(60).default(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ seconds }) => {
      await sleep(seconds * 1000)
      return manager.connected ? ok(statusOf(manager.bot)) : ok({ ok: true, waitedSeconds: seconds, connected: false })
    },
  )

  // ---------------------------------------------------------------- P0 批量施工
  const boxSchema = {
    x1: z.number().int(), y1: z.number().int(), z1: z.number().int(),
    x2: z.number().int(), y2: z.number().int(), z2: z.number().int(),
  }

  register(
    'mc_fill',
    {
      title: '批量填充（受控 /fill）',
      description:
        '用一个长方体一次填充方块（等价于原版 /fill，但受控）：坐标必须落在 site.json 的施工区内、' +
        '方块必须在材料白名单内、体积 <= 32768。逐条读取服务端回执并写审计日志。' +
        'mode: replace / keep / hollow / outline / destroy。dryRun=true 只校验不写入。',
      inputSchema: {
        ...boxSchema,
        block: z.string().describe('方块名，如 stone_bricks'),
        mode: z.enum(['replace', 'keep', 'hollow', 'outline', 'destroy']).default('replace'),
        dryRun: z.boolean().default(false),
      },
    },
    async ({ x1, y1, z1, x2, y2, z2, block, mode, dryRun }) =>
      manager.use(async (bot) => {
        const res = await controlledFill(bot, { x1, y1, z1, x2, y2, z2 }, block, {
          mode, site: SITE, dryRun, timeoutMs: 30000,
        })
        return res.ok ? ok(res) : err(res.error ?? 'fill failed', { res })
      }),
  )

  register(
    'mc_scan_region',
    {
      title: '区域实测（方块直方图）',
      description:
        '只读：返回限定长方体区域内每种方块的计数与各自第一处坐标，用于复核柱网、镜像、门洞。' +
        '体积上限 400000 格，超出请分块。',
      inputSchema: { ...boxSchema, maxCells: z.number().int().min(1000).max(400000).default(400000) },
    },
    async ({ x1, y1, z1, x2, y2, z2, maxCells }) =>
      manager.use(async (bot) => {
        const res = scanRegion(bot, { x1, y1, z1, x2, y2, z2 }, { maxCells })
        return res.ok ? ok(res) : err(res.error)
      }),
  )

  register(
    'mc_batch_place',
    {
      title: '批量施工（多条指令，逐条对账）',
      description:
        '一次提交多条 {x1,y1,z1,x2,y2,z2,block,mode} 操作，按顺序执行并逐条返回成功/失败；' +
        '每条都走与 mc_fill 相同的校验与审计。用于按阶段/按开间批量施工。' +
        'allowedBlocks 可先查看白名单。',
      inputSchema: {
        ops: z.array(z.object({
          x1: z.number().int(), y1: z.number().int(), z1: z.number().int(),
          x2: z.number().int(), y2: z.number().int(), z2: z.number().int(),
          block: z.string(),
          mode: z.enum(['replace', 'keep', 'hollow', 'outline', 'destroy']).default('replace'),
        })).min(1).max(500),
        stopOnError: z.boolean().default(false),
      },
    },
    async ({ ops, stopOnError }) =>
      manager.use(async (bot) => {
        const results = []
        let okCount = 0, failCount = 0
        for (let i = 0; i < ops.length; i++) {
          const o = ops[i]
          const res = await controlledFill(bot, o, o.block, { mode: o.mode ?? 'replace', site: SITE, timeoutMs: 30000 })
          results.push({ i, ok: res.ok, cmd: res.cmd, ack: res.ack, error: res.error })
          if (res.ok) okCount++; else { failCount++; if (stopOnError) break }
          await new Promise((r) => setTimeout(r, 120))
        }
        return ok({ ok: failCount === 0, total: ops.length, okCount, failCount, results: results.slice(-40) })
      }),
  )

  register(
    'mc_allowed_blocks',
    {
      title: '查看材料白名单',
      description: '返回 mc_fill / mc_batch_place 允许使用的方块名（对应 building.md §2 材料规范）。',
      inputSchema: {},
    },
    async () => ok({ ok: true, count: ALLOWED_BLOCKS.size, blocks: [...ALLOWED_BLOCKS].sort() }),
  )

  register(
    'mc_disconnect',
    {
      title: '断开机器人连接',
      description: '让机器人退出服务器。仅在需要清理连接时使用。',
      inputSchema: {},
    },
    async () => {
      manager.shutdown()
      return ok({ ok: true, disconnected: true })
    },
  )
  return server
}

// ---------------------------------------------------------------------------
// 启动
//
//   node mcp-server.js                        stdio 模式（DSH 每次 headless 运行拉起一个）
//   node mcp-server.js --http 8766            常驻 HTTP 模式：机器人常驻在线，MCP 走 streamable-http
//   node mcp-server.js --http 8766 --ingame   再叠加"游戏内私聊交互"：
//                                             /msg DeepSeekBot <内容>  → 驱动 DeepSeek agent
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const httpPortArg = argv.indexOf('--http')
const HTTP_PORT = httpPortArg >= 0 ? Number(argv[httpPortArg + 1] ?? 8766) : null
const INGAME = argv.includes('--ingame')

const bye = () => {
  manager.shutdown()
  process.exit(0)
}
process.on('SIGINT', bye)
process.on('SIGTERM', bye)

if (HTTP_PORT === null) {
  // ---------- stdio：与之前完全一致 ----------
  const server = buildServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  log(`MCP server ready (stdio). target=${HOST}:${PORT} version=${VERSION} user=${USER}`)
} else {
  // ---------- HTTP 常驻：机器人一直在世界里，可接私聊 ----------
  const { startHttpServer } = await import('./http-transport.js')
  const whisperSink = INGAME ? (await import('./ingame.js')).createIngameBridge({ manager, log }) : null
  manager.whisperSink = whisperSink

  await startHttpServer({
    port: HTTP_PORT,
    buildServer,
    botManager: manager,
    log,
  })

  // 常驻模式下机器人必须一直在线；掉线就自动重连
  const keepAlive = async () => {
    for (;;) {
      try {
        await manager.ensure()
      } catch (e) {
        log(`bot connect failed: ${e.message}; retry in 10s`)
      }
      await sleep(manager.connected ? 10_000 : 3_000)
    }
  }
  keepAlive()

  log(
    `MCP server ready (streamable-http :${HTTP_PORT}/mcp, ingame=${INGAME}). ` +
      `target=${HOST}:${PORT} version=${VERSION} user=${USER}`,
  )
}
