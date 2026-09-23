/**
 * P0 工具验收测试 —— 直接打 HTTP MCP 服务，检查受控批量施工工具的存在性与边界。
 *
 *   MC_PORT=11451 MC_USER=ToolTestBot node bot/mcp-server.js --http 8799 &
 *   node bot/test-p0-tools.js http://127.0.0.1:8799/mcp
 *
 * 只读 + 拒绝性用例，不改世界（唯一的写用例是 disallowed/越界，必须被拒绝）。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8799/mcp')
const client = new Client({ name: 'p0-test', version: '1.0.0' })
const transport = new StreamableHTTPClientTransport(url)
await client.connect(transport)

let pass = 0, fail = 0
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

const { tools } = await client.listTools()
const names = tools.map((t) => t.name)
console.log('工具总数:', names.length)
for (const t of ['mc_fill', 'mc_scan_region', 'mc_batch_place', 'mc_allowed_blocks']) {
  check(`工具存在: ${t}`, names.includes(t))
}

// 白名单
const wl = await call('mc_allowed_blocks', {})
check('白名单返回方块集合', wl.parsed?.ok === true && wl.parsed.count > 50, wl.parsed?.count)

// 拒绝：不在白名单
const badBlock = await call('mc_fill', { x1: 100, y1: 130, z1: 400, x2: 101, y2: 130, z2: 401, block: 'diamond_block' })
check('拒绝白名单外方块(diamond_block)', badBlock.isError === true, badBlock.parsed?.error)

// 拒绝：越出施工区
const outRegion = await call('mc_fill', { x1: 0, y1: 200, z1: 0, x2: 1, y2: 200, z2: 1, block: 'stone_bricks' })
check('拒绝施工区外坐标(0,200,0)', outRegion.isError === true, outRegion.parsed?.error)

// 拒绝：保护圈（既有中式庭院 -396,-82）
const prot = await call('mc_fill', { x1: -396, y1: 70, z1: -82, x2: -395, y2: 70, z2: -81, block: 'stone_bricks' })
check('拒绝保护圈内坐标(既有庭院)', prot.isError === true, prot.parsed?.error)

// 拒绝：体积超限
const tooBig = await call('mc_fill', { x1: 44, y1: 122, z1: 330, x2: 300, y2: 200, z2: 456, block: 'stone_bricks' })
check('拒绝单条体积 > 32768', tooBig.isError === true, tooBig.parsed?.error)

// 只读：区域实测
const scan = await call('mc_scan_region', { x1: 177, y1: 140, z1: 386, x2: 185, y2: 146, z2: 394 })
check('mc_scan_region 只读成功', scan.parsed?.ok === true && scan.parsed.volume === 9 * 7 * 9, scan.parsed?.error ?? scan.parsed?.volume)

// dryRun 不写世界
const dry = await call('mc_fill', { x1: 180, y1: 200, z1: 390, x2: 181, y2: 200, z2: 391, block: 'stone_bricks', dryRun: true })
check('mc_fill dryRun 返回指令且不写入', dry.parsed?.dryRun === true && String(dry.parsed.cmd).startsWith('/fill'), dry.parsed?.error)

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
await client.close()
process.exit(fail ? 1 : 0)
