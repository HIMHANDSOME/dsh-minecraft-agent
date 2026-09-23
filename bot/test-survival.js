/**
 * 生存链路测试：直接驱动 MCP 工具跑一遍真实生存循环（不涉及 LLM）
 *
 *   采集原木 → 合成木板 → 合成工作台 → 放置 → 合成木棍/木镐
 *   → 合成箱子 → 放置 → 存入/取出 → 合成熔炉 → 放置 → 冶炼
 *   → 召唤牛 → 攻击 → 进食
 *
 * 少数"从零获取太慢"的材料（圆石/沙子/食物/牛）用服务器控制台造夹具，
 * 需要造夹具的步骤会在报告里明确标出。
 *
 * 用法: node test-survival.js
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const USER = 'SurvBot'
const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 通过 run-server.sh 的命名管道发服务器控制台指令（造夹具用） */
function serverCmd(cmd) {
  try {
    execFileSync(join(here, '..', 'run-server.sh'), ['cmd', cmd], { encoding: 'utf8' })
    return true
  } catch (e) {
    console.log(`  (server cmd failed: ${cmd} -> ${e.message})`)
    return false
  }
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(here, 'mcp-server.js')],
  cwd: here,
  stderr: 'inherit',
  env: { ...process.env, MC_USER: USER },
})
const client = new Client({ name: 'survival-test', version: '0.0.1' })
await client.connect(transport)

const call = async (name, args = {}, timeout = 60_000) => {
  const res = await client.callTool({ name, arguments: args }, undefined, { timeout })
  const text = res.content?.find((c) => c.type === 'text')?.text ?? ''
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { json, text }
}
const inv = (j) => Object.fromEntries((j?.inventory ?? []).map((i) => [i.name, i.count]))
const countIn = (j, n) => (j?.inventory ?? []).filter((i) => i.name === n).reduce((s, i) => s + i.count, 0)

// ---------------------------------------------------------------- 0
const st0 = await call('mc_status')
record('连接 + 状态', st0.json?.ok === true, `pos=${JSON.stringify(st0.json?.position)} ver=${st0.json?.serverVersion}`)

// 先把时间设为白天，避免骷髅/僵尸干扰；再给测试机器人清空背包
serverCmd('time set day')
serverCmd(`clear ${USER}`)
serverCmd('gamerule doDaylightCycle false')
await sleep(500)

// ---------------------------------------------------------------- 1 采集
const scan = await call('mc_scan', { blockNames: ['oak_log', 'birch_log', 'spruce_log'], maxDistance: 48, limit: 6 })
const logType = scan.json?.blocks?.[0]?.block
record('mc_scan 找到树', Boolean(logType), `最近: ${logType ?? 'none'} (共 ${scan.json?.blocks?.length ?? 0} 处)`)
if (!logType) { await client.close(); process.exit(1) }
const wood = logType.replace(/_log$/, '')
const planks = `${wood}_planks`

const collect = await call('mc_collect', { blockName: logType, count: 6, maxDistance: 48, timeoutMs: 100_000 }, 150_000)
record('mc_collect 采 6 原木', collect.json?.collected === 6, `collected=${collect.json?.collected} attempts=${collect.json?.attempts} err=${collect.json?.error ?? '-'}`)

// ---------------------------------------------------------------- 2 合成木板
const c1 = await call('mc_craft', { itemName: planks, count: 6 })
record('mc_craft 木板(免工作台)', c1.json?.ok === true && countIn(c1.json, planks) > 0, `gained=${JSON.stringify(c1.json?.gained)} err=${c1.json?.error ?? '-'}`)

// ---------------------------------------------------------------- 3 合成工作台
const c2 = await call('mc_craft', { itemName: 'crafting_table', count: 1 })
record('mc_craft 工作台', c2.json?.ok === true, `gained=${JSON.stringify(c2.json?.gained)} err=${c2.json?.error ?? '-'}`)

// ---------------------------------------------------------------- 4 放置工作台（视线模式）
const st1 = await call('mc_status')
const p = st1.json.position
const fx = Math.floor(p.x); const fy = Math.round(p.y); const fz = Math.floor(p.z)
console.log(`  bot 所在方块 ~ (${fx},${fy},${fz})  背包=${JSON.stringify(inv(st1.json))}`)

let placeMode = null
for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
  const r = await call('mc_place', { blockName: 'crafting_table', x: fx + dx, y: fy, z: fz + dz }, 25_000)
  if (r.json?.ok) { placeMode = 'coords'; break }
}
if (!placeMode) {
  // 降级：看向脚下前方再放
  await call('mc_look_at', { x: fx + 2, y: fy - 1, z: fz }, 15_000)
  const r = await call('mc_place', { blockName: 'crafting_table' }, 25_000)
  if (r.json?.ok) placeMode = 'cursor'
}
record('mc_place 放置工作台', placeMode !== null, `mode=${placeMode ?? 'failed'}`)

// ---------------------------------------------------------------- 5 需要工作台的合成
const c3 = await call('mc_craft', { itemName: 'stick', count: 1, maxTableDistance: 10 })
record('mc_craft 木棍(自动找工作台)', c3.json?.ok === true, `usesTable=${c3.json?.usesTable} gained=${JSON.stringify(c3.json?.gained)} err=${c3.json?.error ?? '-'}`)

const c4 = await call('mc_craft', { itemName: 'wooden_pickaxe', count: 1, maxTableDistance: 10 })
record('mc_craft 木镐(3x3 配方)', c4.json?.ok === true, `usesTable=${c4.json?.usesTable} gained=${JSON.stringify(c4.json?.gained)} err=${c4.json?.error ?? '-'}`)

// ---------------------------------------------------------------- 6 箱子
const c5 = await call('mc_craft', { itemName: 'chest', count: 1, maxTableDistance: 10 })
record('mc_craft 箱子', c5.json?.ok === true, `gained=${JSON.stringify(c5.json?.gained)} err=${c5.json?.error ?? '-'}`)

let chestPlaced = false
for (const [dx, dz] of [[-1, 0], [0, -1], [0, 1], [1, 0], [2, 0], [-2, 0]]) {
  const r = await call('mc_place', { blockName: 'chest', x: fx + dx, y: fy, z: fz + dz }, 25_000)
  if (r.json?.ok) { chestPlaced = true; break }
}
record('mc_place 放置箱子', chestPlaced)

// ---------------------------------------------------------------- 7 容器存取
const k1 = await call('mc_container', { action: 'list', maxDistance: 12 })
record('mc_container list', k1.json?.ok === true, `${k1.json?.container} contents=${JSON.stringify(k1.json?.contents)} err=${k1.json?.error ?? '-'}`)

const dep = await call('mc_container', { action: 'deposit', itemName: planks, count: 3, maxDistance: 12 })
record('mc_container deposit', dep.json?.ok === true && dep.json?.moved === 3, `moved=${dep.json?.moved} contents=${JSON.stringify(dep.json?.contents)} err=${dep.json?.error ?? '-'}`)

const wd = await call('mc_container', { action: 'withdraw', itemName: planks, count: 2, maxDistance: 12 })
record('mc_container withdraw', wd.json?.ok === true && wd.json?.moved === 2, `moved=${wd.json?.moved} contents=${JSON.stringify(wd.json?.contents)} err=${wd.json?.error ?? '-'}`)

// ---------------------------------------------------------------- 8 熔炉
serverCmd(`give ${USER} minecraft:cobblestone 8`)
serverCmd(`give ${USER} minecraft:sand 2`)
serverCmd('time set day')
await sleep(1200)
const st2 = await call('mc_status')
record('控制台夹具到货(圆石8/沙子2)', countIn(st2.json, 'cobblestone') >= 8, `inv=${JSON.stringify(inv(st2.json))}`)

const c6 = await call('mc_craft', { itemName: 'furnace', count: 1, maxTableDistance: 10 })
record('mc_craft 熔炉', c6.json?.ok === true, `gained=${JSON.stringify(c6.json?.gained)} err=${c6.json?.error ?? '-'}`)

let furnacePos = null
for (const [dx, dz] of [[0, 2], [2, 0], [-2, 0], [0, -2], [1, 1], [-1, -1]]) {
  const r = await call('mc_place', { blockName: 'furnace', x: fx + dx, y: fy, z: fz + dz }, 25_000)
  if (r.json?.ok) { furnacePos = r.json.at; break }
}
record('mc_place 放置熔炉', furnacePos !== null, `at=${JSON.stringify(furnacePos)}`)

if (furnacePos) {
  const sm = await call('mc_smelt', { inputName: 'sand', count: 1, x: furnacePos.x, y: furnacePos.y, z: furnacePos.z, timeoutMs: 60_000 }, 120_000)
  record('mc_smelt 沙子→玻璃', sm.json?.ok === true && sm.json?.got?.name === 'glass', `got=${JSON.stringify(sm.json?.got)} fuel=${sm.json?.fuelUsed} err=${sm.json?.error ?? '-'}`)
} else {
  record('mc_smelt 沙子→玻璃', false, 'furnace not placed')
}

// ---------------------------------------------------------------- 9 战斗
// 在地面生成目标（而不是在机器人脚下），避免"从树上召唤摔死"造成假阳性
serverCmd(`give ${USER} minecraft:stone_sword 1`)
const gs = await call('mc_scan', { blockNames: ['grass_block'], maxDistance: 20, limit: 1 })
const gp = gs.json?.blocks?.[0]?.position
serverCmd(gp ? `summon minecraft:cow ${gp.x} ${gp.y + 1} ${gp.z}` : `execute at ${USER} run summon minecraft:cow ~3 ~ ~`)
await sleep(1500)
const k2 = await call('mc_attack', { entityName: 'cow', count: 1, maxDistance: 24, timeoutMs: 40_000 }, 70_000)
record(
  'mc_attack 击杀牛(自动换武器)',
  (k2.json?.kills ?? 0) >= 1,
  `spawn=${JSON.stringify(gp)} attacks=${k2.json?.attacks} kills=${k2.json?.kills} whiffs=${k2.json?.whiffs} weapon=${k2.json?.weapon} notes=${JSON.stringify(k2.json?.notes)} err=${k2.json?.error ?? '-'}`,
)

// ---------------------------------------------------------------- 10 进食
serverCmd(`give ${USER} minecraft:cooked_beef 3`)
serverCmd(`effect give ${USER} minecraft:hunger 40 200`) // 高倍率饥饿，尽量把 food 压下来
let foodNow = 20
for (let i = 0; i < 30; i++) {
  await sleep(1000)
  const s = await call('mc_status')
  foodNow = s.json?.food ?? 20
  if (foodNow < 20) break
}
// 关键：测进食前先清掉饥饿效果，否则吃完立刻被抽回去，读到"吃了但数值没变"
serverCmd(`effect clear ${USER} minecraft:hunger`)
await sleep(1200)
const eat = await call('mc_eat', {}, 30_000)
if (foodNow >= 20) {
  // 没能制造出饥饿：此时正确行为是返回结构化错误，而不是假装吃饱
  record('mc_eat 进食', eat.json?.ok === false && /不饿/.test(eat.json?.error ?? ''), `没能制造饥饿(food=20)；mc_eat 正确返回: ${eat.json?.error}`)
} else {
  record('mc_eat 进食', eat.json?.ok === true && (eat.json?.after?.food ?? 0) > foodNow, `food ${foodNow} -> ${eat.json?.after?.food}，吃了 ${eat.json?.ate}`)
}

// ---------------------------------------------------------------- 汇总
const final = await call('mc_status')
console.log(`\n最终背包: ${JSON.stringify(final.json?.inventory)}`)
await client.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n===== SURVIVAL SUMMARY: ${results.length - failed.length}/${results.length} passed =====`)
if (failed.length) console.log('failed:', failed.map((f) => f.name).join(', '))
console.log(failed.length === 0 ? 'SURVIVAL_PASS' : 'SURVIVAL_FAIL')
process.exit(failed.length === 0 ? 0 : 1)
