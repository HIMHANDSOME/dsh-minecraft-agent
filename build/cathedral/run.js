/**
 * run.js —— 分阶段施工执行器
 *
 *   node build/cathedral/run.js --phase 2 --plan           # 干跑：只统计，不改世界
 *   node build/cathedral/run.js --phase 2 --go             # 真正施工
 *   node build/cathedral/run.js --phase 2 --go --from 120  # 断点续跑
 *   node build/cathedral/run.js --phase 2 --go --limit 50  # 只做前 50 条（小步验证）
 *
 * 每条指令都经 builder-core 的白名单/施工区/保护圈/体积校验，逐条读服务端回执，
 * 写 logs/cathedral-audit.jsonl，并把进度写入 build/cathedral/progress/phaseN.json。
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import {
  ROOT, connect, fill, setblock, loadSite, sleep, audit, at, tp,
  snapshotRegion, rollbackCommands,
} from '../../bot/builder-core.js'
import { DEFAULT_MATERIALS } from './layout.js'

const args = process.argv.slice(2)
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const has = (k) => args.includes(k)

const phase = getArg('--phase', null)
if (!phase) { console.error('用法: run.js --phase <n> [--plan|--go] [--from i] [--limit n]'); process.exit(2) }
const go = has('--go')
const fromIdx = Number(getArg('--from', 0))
const limit = getArg('--limit', null) ? Number(getArg('--limit')) : Infinity
const SNAPSHOT_MAX = Number(getArg('--snapshotMax', 20000))
// 集成服务端在大批量施工后回执会积压；可用环境变量缩短等待，配合分批重连
const FILL_TIMEOUT_MS = Number(process.env.MC_FILL_TIMEOUT_MS ?? 30000)

const planPath = join(ROOT, 'build', 'cathedral', 'phases', `phase${phase}.js`)
if (!existsSync(planPath)) { console.error('找不到阶段计划:', planPath); process.exit(2) }
const mod = await import(planPath + `?t=${Date.now()}`)
const site = loadSite()

const build = mod.build
if (typeof build !== 'function') { console.error('阶段文件必须导出 build(ctx)'); process.exit(2) }

const ctx = { site, materials: DEFAULT_MATERIALS, AXIS: (await import('./layout.js')).AXIS }

const ops = build(ctx)
// 预检：方块名必须在目标版本真实存在（building.md §2：不认识的名称不得直接下发）
{
  const require_ = createRequire(join(ROOT, 'bot', 'index.js'))
  const md = require_('minecraft-data')(process.env.MC_VERSION ?? '26.1')
  const known = new Set(Object.values(md.blocksByName).map((b) => b.name))
  const bad = new Map()
  for (const op of ops) {
    const n = String(op.block).replace(/^minecraft:/, '')
    if (n !== 'air' && !known.has(n)) bad.set(n, (bad.get(n) ?? 0) + 1)
  }
  if (bad.size) {
    console.error(`[phase ${phase}] ❌ 存在 ${bad.size} 个目标版本不存在的方块名：`)
    for (const [n, c] of bad) console.error(`   ${n}  ×${c}`)
    process.exit(3)
  } else {
    console.log(`[phase ${phase}] 方块名预检通过（${new Set(ops.map((o) => o.block)).size} 种，均存在于 ${md.version.minecraftVersion}）`)
  }
}
console.log(`[phase ${phase}] 计划 op 数 = ${ops.length}`)

// 汇总体积
let totalVol = 0
for (const op of ops) {
  const v = (Math.abs(op.rel.x2 - op.rel.x1) + 1) * (Math.abs(op.rel.y2 - op.rel.y1) + 1) * (Math.abs(op.rel.z2 - op.rel.z1) + 1)
  op._vol = v
  totalVol += v
}
const byTag = {}
for (const op of ops) { const k = op.tag || op.block; byTag[k] = (byTag[k] ?? 0) + 1 }
console.log(`[phase ${phase}] 预计改动方块总量 = ${totalVol.toLocaleString()}  标签分布 = ${JSON.stringify(byTag)}`)

if (!go) {
  console.log('\n干跑（--plan）：前 12 条 op')
  for (const op of ops.slice(0, 12)) {
    console.log('  ', op.kind, JSON.stringify(op.rel), op.block, op.mode, op.tag)
  }
  console.log('\n用 --go 真正施工。')
  process.exit(0)
}

// ---------------------------------------------------------------------------
const progressPath = join(ROOT, 'build', 'cathedral', 'progress', `phase${phase}.json`)
mkdirSync(join(ROOT, 'build', 'cathedral', 'progress'), { recursive: true })
let progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, 'utf8')) : { phase, done: {}, failures: [] }

const { makeTransform, splitBox } = await import('./layout.js')
const T = makeTransform(site)

const bot = await connect({ user: process.env.MC_BUILDER_USER ?? 'BuilderBot', port: Number(process.env.MC_PORT ?? 11451) })
console.log(`[phase ${phase}] BuilderBot 已上线 @ ${JSON.stringify(bot.entity.position)} gameMode=${bot.game.gameMode}`)

// 把施工机器人 tp 到工地中心上空：/fill 要求目标区块已加载，
// 不能依赖玩家恰好站在附近。
{
  const cx = T.X(137), cz = T.Z(0), cy = T.Y(30)
  await tp(bot, cx, cy, cz, { settleMs: 1200 })
  console.log(`[phase ${phase}] BuilderBot tp 到工地 ${cx},${cy},${cz} 以加载区块`)
}

const t0 = Date.now()
let done = 0, failed = 0, skipped = 0
const failures = []

for (let i = 0; i < ops.length; i++) {
  const op = ops[i]
  if (i < fromIdx) { skipped++; continue }
  if (done >= limit) break
  if (progress.done[i]) { skipped++; continue }

  // 危险提示：如果正在补做一个"比已完成 op 更早"的操作，而它又是清场/掏空(air)，
  // 就可能把后来放进去的细节一起清掉（实测在 PHASE 27 发生过）。
  if (op.block === 'air' && !progress.done[i]) {
    const maxDone = Object.keys(progress.done).reduce((m, k) => Math.max(m, Number(k)), -1)
    if (i < maxDone) console.warn(`  ⚠️  op#${i} 是清场指令(air)但序号早于已完成的最大序号 #${maxDone}，可能清掉后续细节`)
  }

  const worldBox = {
    x1: T.X(op.rel.x1), y1: T.Y(op.rel.y1), z1: T.Z(op.rel.z1),
    x2: T.X(op.rel.x2), y2: T.Y(op.rel.y2), z2: T.Z(op.rel.z2),
  }
  const parts = op.kind === 'set' ? [worldBox] : splitBox(worldBox)

  // 回滚快照（仅对非 air 的小体积批次做，避免快照比施工还慢）
  if (op.block !== 'air' && op._vol <= SNAPSHOT_MAX) {
    try {
      const snap = snapshotRegion(bot, worldBox)
      const dir = join(ROOT, 'build', 'cathedral', 'snapshots')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `phase${phase}-${String(i).padStart(4, '0')}.json.gz`), gzipSync(JSON.stringify(snap)))
    } catch (e) { audit({ kind: 'snapshot-fail', i, error: e.message }) }
  }

  let okAll = true
  const acks = []
  // 把机器人移到本 op 中心上空：/fill 需要目标区块已加载，
  // 集成服务端（客户端开的 LAN 世界）视距有限，远处指令会静默丢失回执。
  {
    const cxb = Math.round((worldBox.x1 + worldBox.x2) / 2)
    const czb = Math.round((worldBox.z1 + worldBox.z2) / 2)
    const bpos = bot.entity?.position
    if (!bpos || Math.hypot(bpos.x - cxb, bpos.z - czb) > 90) {
      try { await tp(bot, cxb, T.Y(30), czb, { settleMs: 700 }) } catch {}
    }
  }
  const started = Date.now()
  for (const p of parts) {
    const res = op.kind === 'set'
      ? await setblock(bot, p.x1, p.y1, p.z1, op.block, { site })
      : await fill(bot, p, op.block, { mode: op.mode ?? 'replace', site, timeoutMs: FILL_TIMEOUT_MS })
    acks.push({ box: p, ok: res.ok, ack: res.ack, error: res.error })
    if (!res.ok) { okAll = false; }
    // 限速：大 fill 会让集成服务端卡顿，按体积加延时
    const pvol = (p.x2 - p.x1 + 1) * (p.y2 - p.y1 + 1) * (p.z2 - p.z1 + 1)
    await sleep(op.block === 'air' ? Math.min(1200, 120 + pvol / 40) : Math.min(2500, 200 + pvol / 25))
  }

  if (okAll) { done++; progress.done[i] = Date.now() }
  else {
    failed++
    failures.push({ i, tag: op.tag, rel: op.rel, block: op.block, acks })
    progress.failures = failures.slice(-50)
    console.error(`  [FAIL] #${i} ${op.tag} ${JSON.stringify(op.rel)} ${op.block}: ${JSON.stringify(acks.filter((a) => !a.ok))}`)
  }
  if (done % 25 === 0 && done > 0) {
    const el = ((Date.now() - t0) / 1000).toFixed(0)
    console.log(`  ${done} ok / ${failed} fail  (${el}s)  最近: ${op.tag}`)
  }
  if (done % 20 === 0) writeFileSync(progressPath, JSON.stringify(progress, null, 2))
}

writeFileSync(progressPath, JSON.stringify(progress, null, 2))
console.log(`\n[phase ${phase}] 完成 ${done}，失败 ${failed}，跳过 ${skipped}，用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`)
console.log(`[phase ${phase}] 进度: ${progressPath}`)
if (failures.length) { console.log('失败样例:'); for (const f of failures.slice(0, 10)) console.log('  ', JSON.stringify(f).slice(0, 300)) }
bot.quit()
setTimeout(() => process.exit(failed ? 1 : 0), 500)
