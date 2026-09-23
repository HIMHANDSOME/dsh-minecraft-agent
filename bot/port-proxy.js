// 极简 TCP 转发：127.0.0.1:25565 -> 127.0.0.1:11451
// 目的：DSH 的 minecraft profile 里 MCP server 写死了 25565；玩家现在把世界开在
// LAN 端口 11451。用本转发让现有 MCP 工具（mc_status/mc_scan/...）连到该世界，
// 不需要重启 dsh web、也不需要改 profile。
import net from 'node:net'

const LISTEN_PORT = Number(process.env.PROXY_LISTEN ?? 25565)
const TARGET_PORT = Number(process.env.PROXY_TARGET ?? 11451)
const TARGET_HOST = process.env.PROXY_TARGET_HOST ?? '127.0.0.1'

let n = 0
const server = net.createServer((client) => {
  const id = ++n
  const upstream = net.connect(TARGET_PORT, TARGET_HOST)
  const kill = () => { client.destroy(); upstream.destroy() }
  client.on('error', kill)
  upstream.on('error', (e) => { console.error(`[proxy] #${id} upstream error: ${e.message}`); kill() })
  client.pipe(upstream)
  upstream.pipe(client)
  client.on('close', () => upstream.destroy())
  upstream.on('close', () => client.destroy())
})

server.on('error', (e) => { console.error('[proxy] listen error:', e.message); process.exit(1) })
server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.error(`[proxy] 127.0.0.1:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`)
})
