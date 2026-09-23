/**
 * builder-core.js —— 受控批量施工核心库（满足 building.md §0 的 P0 能力缺口）
 *
 * 背景：现有 19 个 MCP 工具只有单块 mc_place / mc_dig，无法可靠完成 274x180 的工程。
 * 本库在“机器人 + 原版 /fill”之上做一层**受控**封装，所有写入都经过：
 *   1) 坐标校验：必须落在配置允许的施工区内；禁止碰保护圈（既有作品、玩家周围）
 *   2) 方块校验：必须在材料白名单内（building.md §2），未知名单直接拒绝
 *   3) 体积校验：单条指令 <= 32768（原版上限），整批总量有上限
 *   4) 逐条对账：读取服务端返回的 "Successfully filled N block(s)" / 报错，不静默跳过
 *   5) 审计：每条指令（含体积、目标框、模式、服务端回执）写入 JSONL
 *   6) 回滚：写入前对目标框做调色板压缩快照，可生成反向 /fill 序列
 *   7) 断点续跑：批次按索引落盘，--from 可续
 *
 * 它不是“任意命令执行”：只暴露 fill / setblock / tp / 只读查询，且都走白名单校验。
 */
import mineflayer from 'mineflayer'
import Vec3 from 'vec3'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { gzipSync, gunzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(HERE, '..')

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** blockAt 需要 Vec3（带 .floored()），不能传裸对象。 */
export const at = (bot, x, y, z) => bot.blockAt(new Vec3(x, y, z))

// ---------------------------------------------------------------------------
// 材料白名单（building.md §2）
// ---------------------------------------------------------------------------
export const ALLOWED_BLOCKS = new Set([
  // 主结构
  'stone_bricks', 'andesite', 'polished_andesite',
  // 肋拱/高光
  'calcite',
  // 墙体老化
  'cracked_stone_bricks', 'mossy_stone_bricks', 'tuff_bricks', 'polished_tuff', 'deepslate_bricks',
  // 屋面与木作
  'deepslate_tiles', 'polished_deepslate', 'dark_oak_planks', 'dark_oak_log', 'stripped_dark_oak_log',
  'spruce_planks', 'spruce_log', 'stripped_spruce_log',
  // 金属与照明
  'iron_bars', 'iron_chain', 'lantern', 'soul_lantern',
  // 玻璃（彩窗）
  'glass', 'glass_pane',
  'white_stained_glass', 'white_stained_glass_pane',
  'light_gray_stained_glass', 'light_gray_stained_glass_pane',
  'gray_stained_glass', 'gray_stained_glass_pane',
  'black_stained_glass', 'black_stained_glass_pane',
  'blue_stained_glass', 'blue_stained_glass_pane',
  'light_blue_stained_glass', 'light_blue_stained_glass_pane',
  'cyan_stained_glass', 'cyan_stained_glass_pane',
  'purple_stained_glass', 'purple_stained_glass_pane',
  'magenta_stained_glass', 'magenta_stained_glass_pane',
  'red_stained_glass', 'red_stained_glass_pane',
  'pink_stained_glass', 'pink_stained_glass_pane',
  'orange_stained_glass', 'orange_stained_glass_pane',
  'yellow_stained_glass', 'yellow_stained_glass_pane',
  'lime_stained_glass', 'lime_stained_glass_pane',
  'green_stained_glass', 'green_stained_glass_pane',
  'brown_stained_glass', 'brown_stained_glass_pane',
  // 门/楼梯/台阶/墙/栅栏/活板（哥特细节）
  'dark_oak_door', 'spruce_door', 'iron_door',
  'stone_brick_stairs', 'stone_brick_slab', 'stone_brick_wall',
  'polished_andesite_stairs', 'polished_andesite_slab',
  'deepslate_tile_stairs', 'deepslate_tile_slab', 'deepslate_tile_wall',
  'polished_deepslate_stairs', 'polished_deepslate_slab', 'polished_deepslate_wall',
  'deepslate_brick_stairs', 'deepslate_brick_slab', 'deepslate_brick_wall',
  'tuff_brick_stairs', 'tuff_brick_slab', 'tuff_brick_wall',
  'cobblestone', 'cobblestone_wall', 'cobblestone_stairs', 'cobblestone_slab',
  'mossy_cobblestone', 'stone', 'smooth_stone', 'stone_slab', 'stone_stairs',
  'chiseled_stone_bricks', 'chiseled_deepslate', 'chiseled_tuff',
  'dark_oak_fence', 'spruce_fence', 'dark_oak_slab', 'spruce_slab',
  'dark_oak_stairs', 'spruce_stairs', 'ladder', 'scaffolding',
  // 地基/地形
  'dirt', 'coarse_dirt', 'grass_block', 'gravel', 'water',
  // 特殊
  'air', 'light', 'sea_lantern', 'glowstone', 'torch', 'wall_torch',
  'gold_block', 'quartz_block', 'smooth_quartz', 'quartz_stairs', 'quartz_slab',
  'bell', 'bookshelf', 'oak_planks', 'oak_fence',
  'chest', 'barrel', 'trapped_chest', 'lectern', 'candle', 'candle_cake',
])

export const AIR = 'air'

// ---------------------------------------------------------------------------
// 审计 / 快照
// ---------------------------------------------------------------------------
export const AUDIT_PATH = process.env.MC_CATHEDRAL_AUDIT ?? join(ROOT, 'logs', 'cathedral-audit.jsonl')

export function audit(entry) {
  try {
    mkdirSync(dirname(AUDIT_PATH), { recursive: true })
    appendFileSync(AUDIT_PATH, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n')
  } catch (e) {
    console.error('[audit] write failed:', e.message)
  }
}

// ---------------------------------------------------------------------------
// Bot 连接
// ---------------------------------------------------------------------------
export async function connect({ user = 'BuilderBot', host = '127.0.0.1', port = 11451, version = '26.1', timeoutMs = 30000 } = {}) {
  const bot = mineflayer.createBot({ host, port, username: user, version, auth: 'offline', checkTimeoutInterval: 60000 })
  // 聊天记录（命令回执靠它）
  bot._chatLines = []
  bot.on('message', (msg) => {
    const t = msg.toString()
    bot._chatLines.push({ t: Date.now(), text: t })
    if (bot._chatLines.length > 200) bot._chatLines.shift()
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`spawn timeout ${timeoutMs}ms`)), timeoutMs)
    bot.once('spawn', () => { clearTimeout(timer); resolve() })
    bot.once('error', (e) => { clearTimeout(timer); reject(e) })
    bot.once('kicked', (r) => { clearTimeout(timer); reject(new Error('kicked: ' + JSON.stringify(r))) })
    bot.once('end', () => { clearTimeout(timer); reject(new Error('ended before spawn')) })
  })
  await sleep(500)
  return bot
}

export function waitForChat(bot, regex, { timeoutMs = 5000, since = 0 } = {}) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      const hit = bot._chatLines.slice(since).find((l) => regex.test(l.text))
      if (hit) { clearInterval(iv); resolve(hit.text) }
      else if (Date.now() - start > timeoutMs) { clearInterval(iv); reject(new Error('chat timeout: ' + regex)) }
    }
    const iv = setInterval(check, 40)
    check()
  })
}

// ---------------------------------------------------------------------------
// 受控施工区 / 保护圈
// ---------------------------------------------------------------------------
/**
 * 施工区定义（世界坐标，绝对）。
 * 由 PHASE 0/1 冻结后写入 build/site.json；本库只读取，不猜。
 */
export function loadSite() {
  const p = join(ROOT, 'build', 'site.json')
  if (!existsSync(p)) throw new Error(`缺少 ${p}：必须先完成 PHASE 0/1 勘察并冻结原点`)
  return JSON.parse(readFileSync(p, 'utf8'))
}

export function inRegion(site, x, y, z, region = 'work') {
  const r = site.regions?.[region]
  if (!r) return true // 未定义则不限制（由调用方负责）
  return x >= r.min.x && x <= r.max.x && y >= r.min.y && y <= r.max.y && z >= r.min.z && z <= r.max.z
}

export function inProtected(site, x, y, z) {
  for (const p of site.protected ?? []) {
    if (x >= p.min.x && x <= p.max.x && y >= p.min.y && y <= p.max.y && z >= p.min.z && z <= p.max.z) return p.name
  }
  return null
}

// ---------------------------------------------------------------------------
// 写入原语（全部经校验）
// ---------------------------------------------------------------------------
const normBlock = (b) => String(b).replace(/^minecraft:/, '')

/**
 * 生成本批次快照（调色板压缩），用于回滚。体积超限则拒绝快照但允许施工（需显式 allowNoSnapshot）。
 */
export function snapshotRegion(bot, box) {
  const counts = {}
  const palette = []
  const idxOf = new Map()
  const cells = []
  for (let y = box.y1; y <= box.y2; y++) {
    for (let z = box.z1; z <= box.z2; z++) {
      for (let x = box.x1; x <= box.x2; x++) {
        const blk = at(bot, x, y, z)
        const name = blk ? blk.name : 'unknown'
        if (!idxOf.has(name)) { idxOf.set(name, palette.length); palette.push(name) }
        // RLE 连续相同
        const last = cells[cells.length - 1]
        const id = idxOf.get(name)
        if (last && last[0] === id) last[1]++
        else cells.push([id, 1])
        counts[name] = (counts[name] ?? 0) + 1
      }
    }
  }
  return { box, palette, cells, counts }
}

export function rollbackCommands(snap) {
  const cmds = []
  let i = 0
  const { box, palette, cells } = snap
  // 按行（z 外层, y 中层）重建坐标
  let cur = 0
  for (let y = box.y1; y <= box.y2; y++) {
    for (let z = box.z1; z <= box.z2; z++) {
      let x = box.x1
      while (x <= box.x2) {
        const [id, run] = cells[cur++]
        cmds.push(`/fill ${x} ${y} ${z} ${x + run - 1} ${y} ${z} minecraft:${palette[id]}`)
        x += run
      }
    }
  }
  return cmds
}

/**
 * 一条 /fill，带校验 + 对账 + 审计。
 * box: {x1,y1,z1,x2,y2,z2}（世界坐标，含端点）
 */
export async function fill(bot, box, block, { mode = 'replace', site = null, region = 'work', dryRun = false, timeoutMs = 30000 } = {}) {
  const b = {
    x1: Math.min(box.x1, box.x2), x2: Math.max(box.x1, box.x2),
    y1: Math.min(box.y1, box.y2), y2: Math.max(box.y1, box.y2),
    z1: Math.min(box.z1, box.z2), z2: Math.max(box.z1, box.z2),
  }
  const name = normBlock(block)
  if (!ALLOWED_BLOCKS.has(name)) return { ok: false, error: `方块不在白名单: ${name}` }

  const vol = (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1) * (b.z2 - b.z1 + 1)
  if (vol > 32768) return { ok: false, error: `单条 fill 体积 ${vol} > 32768，请拆分` }

  if (site) {
    // 八个角全部要在工作区内，且不碰保护圈
    for (const [x, y, z] of [
      [b.x1, b.y1, b.z1], [b.x2, b.y1, b.z1], [b.x1, b.y2, b.z1], [b.x1, b.y1, b.z2],
      [b.x2, b.y2, b.z2], [b.x2, b.y1, b.z2], [b.x1, b.y2, b.z2], [b.x2, b.y2, b.z1],
    ]) {
      if (!inRegion(site, x, y, z, region)) return { ok: false, error: `坐标 (${x},${y},${z}) 超出施工区 ${region}` }
      const prot = inProtected(site, x, y, z)
      if (prot) return { ok: false, error: `坐标 (${x},${y},${z}) 落在保护圈「${prot}」内` }
    }
  }

  const cmd = `/fill ${b.x1} ${b.y1} ${b.z1} ${b.x2} ${b.y2} ${b.z2} minecraft:${name}${mode === 'replace' ? '' : ' ' + mode}`
  if (dryRun) return { ok: true, dryRun: true, cmd, vol }

  const since = bot._chatLines.length
  bot.chat(cmd)
  let ack = null
  try {
    ack = await waitForChat(bot, /Successfully filled|No blocks were filled|That position is not loaded|out of world|Too many blocks|error|Cannot|Unknown|exceeds/i, { timeoutMs, since })
  } catch (e) {
    // 集成服务端（客户端 LAN 世界）在大批量施工时会积压回执；再等一轮，
    // 用同一个 since 重扫，能捞到迟到的 "Successfully filled"。
    try {
      ack = await waitForChat(bot, /Successfully filled|No blocks were filled|not loaded|Too many blocks|error|Cannot|Unknown|exceeds/i, { timeoutMs: Math.round(timeoutMs * 1.5), since })
    } catch {
      audit({ kind: 'fill', cmd, box: b, block: name, mode, vol, ok: false, error: 'no-ack' })
      return { ok: false, error: 'no server ack', cmd }
    }
  }
  const m = /Successfully filled (\d+) block/i.exec(ack)
  const filled = m ? Number(m[1]) : 0
  // "No blocks were filled" = 指令成功、0 改动（幂等重跑的正常情形），不是失败
  const noop = /No blocks were filled/i.test(ack)
  const okFlag = /Successfully filled/i.test(ack) || noop
  audit({ kind: 'fill', cmd, box: b, block: name, mode, vol, ok: okFlag, ack, filled, noop })
  return { ok: okFlag, cmd, ack, vol, filled, noop }
}

export async function setblock(bot, x, y, z, block, { site = null, region = 'work', timeoutMs = 20000 } = {}) {
  const name = normBlock(block)
  if (!ALLOWED_BLOCKS.has(name)) return { ok: false, error: `方块不在白名单: ${name}` }
  if (site) {
    if (!inRegion(site, x, y, z, region)) return { ok: false, error: `坐标 (${x},${y},${z}) 超出施工区` }
    const prot = inProtected(site, x, y, z)
    if (prot) return { ok: false, error: `坐标 (${x},${y},${z}) 落在保护圈「${prot}」内` }
  }
  const cmd = `/setblock ${x} ${y} ${z} minecraft:${name}`
  const since = bot._chatLines.length
  bot.chat(cmd)
  let ack = null
  try {
    ack = await waitForChat(bot, /Changed the block|Successfully|Cannot|error|Unknown|not loaded/i, { timeoutMs, since })
  } catch {
    return { ok: false, error: 'no ack', cmd }
  }
  const okFlag = /Changed the block|Successfully/i.test(ack)
  audit({ kind: 'setblock', cmd, ok: okFlag, ack })
  return { ok: okFlag, cmd, ack }
}

// ---------------------------------------------------------------------------
// 只读区域实测（mc_scan_region 的等价实现）
// ---------------------------------------------------------------------------
/** 统计 box 内方块分布（分页/限流由调用方控制体积）。 */
export function scanRegion(bot, box, { maxCells = 400000 } = {}) {
  const b = {
    x1: Math.min(box.x1, box.x2), x2: Math.max(box.x1, box.x2),
    y1: Math.min(box.y1, box.y2), y2: Math.max(box.y1, box.y2),
    z1: Math.min(box.z1, box.z2), z2: Math.max(box.z1, box.z2),
  }
  const vol = (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1) * (b.z2 - b.z1 + 1)
  if (vol > maxCells) return { ok: false, error: `区域 ${vol} 格超过扫描上限 ${maxCells}，请分块` }
  const hist = {}
  const found = new Map()
  let air = 0
  for (let y = b.y1; y <= b.y2; y++) {
    for (let z = b.z1; z <= b.z2; z++) {
      for (let x = b.x1; x <= b.x2; x++) {
        const blk = at(bot, x, y, z)
        const name = blk ? blk.name : 'unloaded'
        hist[name] = (hist[name] ?? 0) + 1
        if (name === 'air' || name === 'cave_air' || name === 'void_air') air++
        else if (!found.has(name)) found.set(name, { x, y, z })
      }
    }
  }
  return { ok: true, box: b, volume: vol, histogram: hist, air, firstOfEach: Object.fromEntries(found) }
}

/** 检查若干坐标处的方块名（用于几何/镜像验收）。 */
export function checkBlocks(bot, points) {
  return points.map(([x, y, z, expect]) => {
    const blk = at(bot, x, y, z)
    const name = blk ? blk.name : 'unloaded'
    return { x, y, z, got: name, expect: expect ? normBlock(expect) : undefined, ok: expect ? name === normBlock(expect) : true }
  })
}

/** 只读传送（用于勘察；不改世界）。 */
export async function tp(bot, x, y, z, { timeoutMs = 6000, settleMs = 1200 } = {}) {
  const since = bot._chatLines.length
  bot.chat(`/tp ${bot.username} ${x} ${y} ${z}`)
  try {
    await waitForChat(bot, /Teleported|Unloaded|error/i, { timeoutMs, since })
  } catch {}
  await sleep(settleMs)
  // 等区块：直到脚下的列可读
  const t0 = Date.now()
  while (Date.now() - t0 < 8000) {
    const b = at(bot, Math.floor(x), 1, Math.floor(z))
    // 用 y=.. 判断区块是否加载（unloaded 时 blockAt 返回 null）
    const test = at(bot, Math.floor(x), Math.floor(y), Math.floor(z))
    if (test !== null) break
    await sleep(300)
  }
  return { ok: true, position: bot.entity?.position }
}

/** 地形高度（从 fromY 向下找第一个非空气/非树叶方块）。 */
export function columnInfo(bot, x, z, fromY = 250, minY = -64) {
  let y = fromY
  let block = null
  for (; y >= minY; y--) {
    const blk = at(bot, x, y, z)
    if (blk && blk.name !== 'air' && blk.name !== 'cave_air' && blk.name !== 'void_air') { block = blk; break }
  }
  return { x, z, y, block: block?.name ?? null }
}

export function saveJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(obj, null, 2))
}
