/**
 * mc-cli：通过 HTTP 直连**常驻 daemon**（默认 http://127.0.0.1:8790/mcp）调用 Minecraft 工具。
 *
 * 为什么需要它：GUI（dsh web profile）里注入的是 **stdio** 版 MCP，它会用同名
 * `DeepSeekBot` 再连一次服务器 → 和 daemon 的机器人互相踢（"You logged in from
 * another location"）。用这个 CLI 走 daemon 的 HTTP 入口，操作的是**同一个**机器人，
 * 不会再引发同名冲突。
 *
 * 用法:
 *   node bot/mc-cli.js                       # 等价于 mc_status
 *   node bot/mc-cli.js mc_status
 *   node bot/mc-cli.js mc_scan '{"blockNames":["oak_log","stone"],"maxDistance":32}'
 *   node bot/mc-cli.js mc_follow '{"action":"start","player":"Player1","distance":3}'
 *   node bot/mc-cli.js --list                # 列出 daemon 暴露的工具
 *
 * 环境变量: MC_MCP_URL（默认 http://127.0.0.1:8790/mcp）
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const URL_ = process.env.MC_MCP_URL ?? 'http://127.0.0.1:8790/mcp'
const argv = process.argv.slice(2)

const client = new Client({ name: 'mc-cli', version: '0.1.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(URL_)))

try {
  if (argv[0] === '--list' || argv[0] === '-l') {
    const { tools } = await client.listTools()
    console.log(tools.map((t) => t.name).join('\n'))
    process.exit(0)
  }

  const name = argv[0] ?? 'mc_status'
  let args = {}
  if (argv[1]) {
    try {
      args = JSON.parse(argv[1])
    } catch {
      console.error(`参数不是合法 JSON: ${argv[1]}`)
      process.exit(2)
    }
  }

  const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 180_000 })
  const text = res.content?.find((c) => c.type === 'text')?.text
  if (text === undefined) {
    console.log(JSON.stringify(res, null, 2))
  } else {
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2))
    } catch {
      console.log(text)
    }
  }
  process.exit(res.isError ? 1 : 0)
} catch (e) {
  console.error(`调用失败: ${e?.message ?? e}`)
  process.exit(1)
} finally {
  await client.close().catch(() => {})
}
