/**
 * P0 工具验收测试 —— 直接打 HTTP MCP 服务，检查受控批量建造工具的存在性与边界。
 *
 *   # 先起一个独立的 MCP HTTP 服务（不要和 daemon 抢机器人名）
 *   node bot/mcp-server.js --http 8799
 *   node bot/test-p0-tools.js http://127.0.0.1:8799/mcp
 *
 * 特性：
 *  - **坐标全部从 build/site.json 推导**，不写死任何项目专属数值。
 *    所以你把 site.json 换成自己项目后，这个测试照样成立。
 *  - 只读 + 拒绝性用例，**不改世界**（写用例只有 dryRun，且必须不落盘）。
 *  - `protected[]` 为空时自动跳过保护圈用例（不做无意义的断言）。
 *
 * 退出码：0 = 全通过，1 = 有失败。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8799/mcp')
const client = new Client({ name: 'p0-test', version: '1.0.0' })
const transport = new StreamableHTTPClientTransport(url)
await client.connect(transport)

let pass = 0, fail = 0, skip = 0
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name}`, extra ?? '') }
}
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args })
  const text = r.content?.find((c) => c.type === 'text')?.text
  let parsed = null
  try { parsed = JSON.parse(text) } catch {}
  return { isError: r.isError, parsed, text }
}
const box = (x1, y1, z1, x2, y2, z2) => ({ x1, y1, z1, x2, y2, z2 })

// ---------------------------------------------------------------- 读 site.json
const sitePath = process.env.MC_SITE_FILE ?? join(ROOT, 'build', 'site.json')
const site = JSON.parse(readFileSync(sitePath, 'utf8'))
const work = site.regions?.work
if (!work) {
  console.error(`❌ ${sitePath} 里没有 regions.work，无法推导测试坐标`)
  process.exit(1)
}
console.log(`site.json: ${sitePath}`)
console.log(`  施工区 work = ${JSON.stringify(work)}`)
console.log(`  保护圈 ${site.protected?.length ?? 0} 个`)

const cx = Math.floor((work.min.x + work.max.x) / 2)
const cy = Math.floor((work.min.y + work.max.y) / 2)
const cz = Math.floor((work.min.z + work.max.z) / 2)

// ---------------------------------------------------------------- 工具存在性
const { tools } = await client.listTools()
const names = tools.map((t) => t.name)
console.log(`\n工具总数: ${names.length}`)
for (const t of ['mc_fill', 'mc_scan_region', 'mc_batch_place', 'mc_allowed_blocks']) {
  check(`工具存在: ${t}`, names.includes(t))
}

// ---------------------------------------------------------------- 白名单
const wl = await call('mc_allowed_blocks', {})
check('白名单返回方块集合', wl.parsed?.ok === true && wl.parsed.count > 50, wl.parsed?.count)
check(
  '白名单含 extraAllowedBlocks 追加项',
  (site.extraAllowedBlocks ?? []).every((b) => wl.parsed?.blocks?.includes(b)),
  JSON.stringify(site.extraAllowedBlocks),
)

// ---------------------------------------------------------------- 拒绝：白名单外
const badBlock = await call('mc_fill', { ...box(cx, cy, cz, cx + 1, cy, cz + 1), block: 'diamond_block' })
check('拒绝白名单外方块(diamond_block)', badBlock.isError === true, badBlock.parsed?.error)

// ---------------------------------------------------------------- 拒绝：越出施工区
// 取施工区外 50 格的一小块，必定越界
const out = box(work.max.x + 50, work.max.y + 50, work.max.z + 50, work.max.x + 51, work.max.y + 50, work.max.z + 51)
const outRegion = await call('mc_fill', { ...out, block: 'stone_bricks' })
check('拒绝施工区内→区外坐标', outRegion.isError === true, outRegion.parsed?.error)

// ---------------------------------------------------------------- 拒绝：保护圈
const prot = site.protected?.[0]
if (prot) {
  const px = Math.floor((prot.min.x + prot.max.x) / 2)
  const py = Math.floor((prot.min.y + prot.max.y) / 2)
  const pz = Math.floor((prot.min.z + prot.max.z) / 2)
  const r = await call('mc_fill', { ...box(px, py, pz, px + 1, py, pz + 1), block: 'stone_bricks' })
  check(`拒绝保护圈内坐标(${px},${py},${pz} 「${prot.name}」)`, r.isError === true, r.parsed?.error)
} else {
  skip++
  console.log('  ⏭  跳过保护圈用例：site.json 的 protected[] 为空')
}

// ---------------------------------------------------------------- 拒绝：体积超限
// 施工区内取一个必然 > 32768 格的框（33×33×33 = 35937）
const big = box(work.min.x, work.min.y, work.min.z, work.min.x + 32, work.min.y + 32, work.min.z + 32)
const bigVol = 33 * 33 * 33
const tooBig = await call('mc_fill', { ...big, block: 'stone_bricks' })
check(`拒绝单条体积 > 32768 (${bigVol})`, tooBig.isError === true, tooBig.parsed?.error)

// ---------------------------------------------------------------- 只读：区域实测
const scanBox = box(cx, cy, cz, cx + 8, cy + 6, cz + 8)
const scan = await call('mc_scan_region', scanBox)
check(
  `mc_scan_region 只读成功 (9×7×9 = ${9 * 7 * 9})`,
  scan.parsed?.ok === true && scan.parsed.volume === 9 * 7 * 9,
  scan.parsed?.error ?? scan.parsed?.volume,
)

// ---------------------------------------------------------------- 拒绝：超扫描上限
const huge = await call('mc_scan_region', { ...box(cx, cy, cz, cx + 80, cy + 80, cz + 80), maxCells: 1000 })
check('mc_scan_region 超上限被拒绝', huge.isError === true, huge.parsed?.error)

// ---------------------------------------------------------------- dryRun 不写世界
const dryBox = box(cx, cy, cz, cx + 1, cy, cz + 1)
const before = await call('mc_scan_region', dryBox)
const dry = await call('mc_fill', { ...dryBox, block: 'stone_bricks', dryRun: true })
check(
  'mc_fill dryRun 返回指令且不写入',
  dry.parsed?.dryRun === true && String(dry.parsed.cmd).startsWith('/fill'),
  dry.parsed?.error,
)
const after = await call('mc_scan_region', dryBox)
check(
  'dryRun 前后世界方块直方图一致（证明没写）',
  JSON.stringify(before.parsed?.histogram) === JSON.stringify(after.parsed?.histogram),
  `${JSON.stringify(before.parsed?.histogram)} -> ${JSON.stringify(after.parsed?.histogram)}`,
)

// ---------------------------------------------------------------- 批量：逐条对账
const batch = await call('mc_batch_place', {
  ops: [
    { ...dryBox, block: 'diamond_block' },          // 必须失败：不在白名单
    { ...out, block: 'stone_bricks' },              // 必须失败：越界
  ],
  stopOnError: false,
})
check(
  'mc_batch_place 逐条对账（2 条全失败且如实回报）',
  batch.parsed?.ok === false && batch.parsed.failCount === 2 && batch.parsed.okCount === 0,
  JSON.stringify(batch.parsed),
)

console.log(`\n结果: ${pass} 通过 / ${fail} 失败${skip ? ` / ${skip} 跳过` : ''}`)
await client.close()
process.exit(fail ? 1 : 0)
