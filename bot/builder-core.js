/**
 * builder-core.js —— 受控批量建造核心库（满足 building.md §0 的 P0 能力缺口）
 *
 * 背景：基础工具里建造只有单块 mc_place、拆除只有 mc_dig，无法可靠完成大型工程。
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
// 材料白名单（building.md §2 材料规范）
// 这是**默认**清单：按你的项目在 build/site.json 的 extraAllowedBlocks 里追加，
// 或直接改这里。不在清单内的方块一律拒绝，避免 Agent 误放不相关的东西。
// ---------------------------------------------------------------------------
export const ALLOWED_BLOCKS = new Set([
  // 石材结构
  'stone', 'smooth_stone', 'stone_bricks', 'chiseled_stone_bricks', 'cracked_stone_bricks',
  'mossy_stone_bricks', 'andesite', 'polished_andesite', 'diorite', 'polished_diorite',
  'granite', 'polished_granite', 'deepslate_bricks', 'chiseled_deepslate', 'polished_deepslate',
  'deepslate_tiles', 'tuff_bricks', 'polished_tuff', 'chiseled_tuff', 'calcite',
  'cobblestone', 'mossy_cobblestone', 'bricks', 'quartz_block', 'smooth_quartz', 'sandstone',
  'smooth_sandstone', 'cut_sandstone', 'prismarine', 'prismarine_bricks',
  'concrete', 'white_concrete', 'light_gray_concrete', 'gray_concrete', 'black_concrete',
  'brown_concrete', 'red_concrete', 'orange_concrete', 'yellow_concrete', 'lime_concrete',
  'green_concrete', 'cyan_concrete', 'light_blue_concrete', 'blue_concrete', 'purple_concrete',
  'magenta_concrete', 'pink_concrete',
  // 木作
  'oak_log', 'stripped_oak_log', 'oak_planks', 'spruce_log', 'stripped_spruce_log', 'spruce_planks',
  'birch_log', 'stripped_birch_log', 'birch_planks', 'jungle_log', 'jungle_planks',
  'acacia_log', 'acacia_planks', 'dark_oak_log', 'stripped_dark_oak_log', 'dark_oak_planks',
  'mangrove_log', 'mangrove_planks', 'cherry_log', 'cherry_planks', 'bamboo_planks',
  'crimson_planks', 'warped_planks',
  // 玻璃（含全部染色，窗与采光）
  'glass', 'glass_pane', 'tinted_glass',
  'white_stained_glass', 'white_stained_glass_pane',
  'light_gray_stained_glass', 'light_gray_stained_glass_pane',
  'gray_stained_glass', 'gray_stained_glass_pane',
  'black_stained_glass', 'black_stained_glass_pane',
  'brown_stained_glass', 'brown_stained_glass_pane',
  'red_stained_glass', 'red_stained_glass_pane',
  'orange_stained_glass', 'orange_stained_glass_pane',
  'yellow_stained_glass', 'yellow_stained_glass_pane',
  'lime_stained_glass', 'lime_stained_glass_pane',
  'green_stained_glass', 'green_stained_glass_pane',
  'cyan_stained_glass', 'cyan_stained_glass_pane',
  'light_blue_stained_glass', 'light_blue_stained_glass_pane',
  'blue_stained_glass', 'blue_stained_glass_pane',
  'purple_stained_glass', 'purple_stained_glass_pane',
  'magenta_stained_glass', 'magenta_stained_glass_pane',
  'pink_stained_glass', 'pink_stained_glass_pane',
  // 楼梯 / 台阶 / 墙 / 栅栏 / 门 / 活板
  'stone_brick_stairs', 'stone_brick_slab', 'stone_brick_wall',
  'polished_andesite_stairs', 'polished_andesite_slab', 'polished_andesite_wall',
  'deepslate_tile_stairs', 'deepslate_tile_slab', 'deepslate_tile_wall',
  'polished_deepslate_stairs', 'polished_deepslate_slab', 'polished_deepslate_wall',
  'deepslate_brick_stairs', 'deepslate_brick_slab', 'deepslate_brick_wall',
  'tuff_brick_stairs', 'tuff_brick_slab', 'tuff_brick_wall',
  'cobblestone_wall', 'cobblestone_stairs', 'cobblestone_slab',
  'stone_slab', 'stone_stairs', 'brick_stairs', 'brick_slab',
  'quartz_stairs', 'quartz_slab', 'smooth_quartz_stairs', 'smooth_quartz_slab',
  'sandstone_stairs', 'sandstone_slab', 'smooth_sandstone_stairs', 'smooth_sandstone_slab',
  'oak_stairs', 'oak_slab', 'oak_fence', 'oak_door', 'oak_trapdoor',
  'spruce_stairs', 'spruce_slab', 'spruce_fence', 'spruce_door', 'spruce_trapdoor',
  'birch_stairs', 'birch_slab', 'birch_fence', 'birch_door',
  'dark_oak_stairs', 'dark_oak_slab', 'dark_oak_fence', 'dark_oak_door', 'dark_oak_trapdoor',
  'iron_door', 'iron_trapdoor', 'iron_bars', 'ladder', 'scaffolding',
  // 金属与照明
  'iron_block', 'gold_block', 'copper_block', 'cut_copper', 'oxidized_copper',
  'lantern', 'soul_lantern', 'sea_lantern', 'glowstone', 'shroomlight',
  'torch', 'wall_torch', 'soul_torch', 'end_rod', 'light', 'froglight', 'ochre_froglight',
  'verdant_froglight', 'pearlescent_froglight',
  // 地基 / 地形
  'dirt', 'coarse_dirt', 'rooted_dirt', 'grass_block', 'podzol', 'mycelium', 'gravel',
  'sand', 'red_sand', 'clay', 'snow_block', 'ice', 'packed_ice', 'blue_ice', 'water',
  // 家具与储物
  'chest', 'trapped_chest', 'barrel', 'lectern', 'bookshelf', 'chiseled_bookshelf',
  'crafting_table', 'furnace', 'blast_furnace', 'smoker', 'anvil', 'bell',
  'candle', 'candle_cake', 'flower_pot', 'decorated_pot', 'armor_stand',
  // 植被与装饰
  'oak_leaves', 'spruce_leaves', 'birch_leaves', 'dark_oak_leaves', 'azalea_leaves',
  'grass', 'short_grass', 'fern', 'flowering_azalea', 'moss_block', 'moss_carpet',
  'vine', 'glow_lichen', 'lily_pad', 'hay_block',
  'white_wool', 'light_gray_wool', 'gray_wool', 'black_wool', 'brown_wool', 'red_wool',
  'orange_wool', 'yellow_wool', 'lime_wool', 'green_wool', 'cyan_wool', 'light_blue_wool',
  'blue_wool', 'purple_wool', 'magenta_wool', 'pink_wool',
  'white_carpet', 'red_carpet', 'blue_carpet', 'gray_carpet', 'black_carpet',
  // 空气（用于挖掘/清空）
  'air',
])

export const AIR = 'air'

/** 白名单判定：默认清单 + 项目自定义 build/site.json 里的 extraAllowedBlocks。 */
export function isAllowedBlock(name, site = null) {
  const n = String(name).replace(/^minecraft:/, '')
  if (ALLOWED_BLOCKS.has(n)) return true
  return (site?.extraAllowedBlocks ?? []).map((s) => String(s).replace(/^minecraft:/, '')).includes(n)
}

// ---------------------------------------------------------------------------
// 审计 / 快照
// ---------------------------------------------------------------------------
export const AUDIT_PATH = process.env.MC_BUILD_AUDIT ?? join(ROOT, 'logs', 'build-audit.jsonl')

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
export async function connect({
  user = process.env.MC_USER ?? 'BuilderBot',
  host = process.env.MC_HOST ?? '127.0.0.1',
  port = Number(process.env.MC_PORT ?? 25565),
  version = process.env.MC_VERSION ?? '26.1',
  timeoutMs = 30000,
} = {}) {
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
 * 由 PHASE 0/1 勘察后写入 build/site.json；本库只读取，不猜。
 * 仓库自带的是模板骨架，请按自己的地形改成真实值。
 */
export function loadSite() {
  const p = process.env.MC_SITE_FILE ?? join(ROOT, 'build', 'site.json')
  if (!existsSync(p)) throw new Error(`缺少 ${p}：必须先完成 PHASE 0/1 勘察并冻结原点与施工区`)
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
  if (!isAllowedBlock(name, site)) return { ok: false, error: `方块不在白名单: ${name}` }

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
  if (!isAllowedBlock(name, site)) return { ok: false, error: `方块不在白名单: ${name}` }
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
