/**
 * S2 测试：MCP 协议层 + 工具真实可用性（不涉及 LLM）
 * 用官方 SDK 的裸 MCP client 通过 stdio 连接我们的 server，验证：
 *   1) 能起来、tools/list 正常、stdout 未被日志污染
 *   2) mc_status / mc_scan 返回真实游戏状态
 *   3) mc_collect 能真正改变游戏世界（背包出现目标物品）
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`)
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(here, 'mcp-server.js')],
  cwd: here,
  stderr: 'inherit',
  env: { ...process.env, MC_USER: 'S2Bot' },
})

const client = new Client({ name: 's2-raw-client', version: '0.0.1' })
await client.connect(transport)

// ---- 1. tools/list ----
const { tools } = await client.listTools()
const names = tools.map((t) => t.name).sort()
record('tools/list', names.length >= 16, `count=${names.length} -> ${names.join(',')}`)

const call = async (name, args = {}, timeout = 30_000) => {
  const res = await client.callTool({ name, arguments: args }, undefined, { timeout })
  const text = res.content?.find((c) => c.type === 'text')?.text ?? ''
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { res, json, text }
}

// ---- 2. mc_status：懒连接 ----
const st = await call('mc_status')
record(
  'mc_status connected',
  st.json?.ok === true && st.json?.connected === true,
  JSON.stringify({ pos: st.json?.position, dim: st.json?.dimension, hp: st.json?.health, ver: st.json?.serverVersion }),
)

// ---- 3. mc_scan ----
const scan = await call('mc_scan', { blockNames: ['birch_log', 'oak_log', 'grass_block'], maxDistance: 48, limit: 5 })
record(
  'mc_scan finds blocks',
  scan.json?.ok === true && (scan.json?.blocks?.length ?? 0) > 0,
  `found=${scan.json?.blocks?.length} sample=${JSON.stringify(scan.json?.blocks?.[0])}`,
)

// ---- 4. mc_wait ----
const w = await call('mc_wait', { seconds: 0.5 })
record('mc_wait', w.json?.ok === true, `connected=${w.json?.connected}`)

// ---- 5. mc_collect 真实改变世界 ----
// 树种类随世界种子而变，先问世界有什么，别写死 birch_log
const woodScan = await call('mc_scan', { blockNames: ['oak_log', 'birch_log', 'spruce_log'], maxDistance: 48, limit: 3 })
const logBlock = woodScan.json?.blocks?.[0]?.block
record('mc_scan 找到可用树木', Boolean(logBlock), `nearest=${logBlock ?? 'none'}`)
const before = await call('mc_inventory', { action: 'list' })
const beforeCount = (before.json?.inventory ?? []).filter((i) => i.name.endsWith('_log')).reduce((s, i) => s + i.count, 0)
const col = await call('mc_collect', { blockName: logBlock, count: 1, maxDistance: 48, timeoutMs: 90_000 }, 150_000)
const after = await call('mc_inventory', { action: 'list' })
const afterCount = (after.json?.inventory ?? []).filter((i) => i.name.endsWith('_log')).reduce((s, i) => s + i.count, 0)
const gainedLogs = afterCount - beforeCount
record(
  'mc_collect changes world',
  gainedLogs >= 1,
  `logs ${beforeCount} -> ${afterCount}; toolOk=${col.json?.ok} attempts=${col.json?.attempts} err=${col.json?.error ?? '-'}`,
)
if (col.json?.failures?.length) console.log('  collect failures:', JSON.stringify(col.json.failures))

// ---- 6. 错误路径：不存在的方块应返回结构化错误而不是挂死 ----
const bad = await call('mc_dig', { blockName: 'not_a_real_block' })
record('structured error path', bad.json?.ok === false && typeof bad.json?.error === 'string', `error=${bad.json?.error}`)

// ---- 7. 最终状态复核 ----
const final = await call('mc_status')
record('final mc_status', final.json?.ok === true, `inventory=${JSON.stringify(final.json?.inventory)}`)

await client.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n===== S2 SUMMARY: ${results.length - failed.length}/${results.length} passed =====`)
console.log(failed.length === 0 ? 'S2_PASS' : 'S2_FAIL')
process.exit(failed.length === 0 ? 0 : 1)
