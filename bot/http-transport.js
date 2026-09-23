/**
 * 常驻 HTTP 传输：让机器人一直在线，DSH 每次 headless 运行连过来就行。
 *
 * 用 SDK 的 StreamableHTTPServerTransport（MCP 官方 HTTP 传输）。
 * 每次 initialize 建一个会话，每个会话一个独立 McpServer 实例（SDK 要求），
 * 但它们共享同一个 BotManager —— 也就是同一个 Minecraft 连接。
 *
 * 附带几个运维端点（都只绑 127.0.0.1）：
 *   GET  /health            → 机器人是否在线
 *   POST /say    {message}  → 让机器人在公共聊天说话
 *   POST /whisper{player,message} → 让机器人给某玩家发私聊
 */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(new Error(`invalid JSON body: ${e.message}`))
      }
    })
    req.on('error', reject)
  })

const sendJson = (res, code, payload) => {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

/**
 * @param {object} options
 * @param {number} options.port
 * @param {() => import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} options.buildServer
 * @param {object} options.botManager
 * @param {(...a:any[]) => void} options.log
 */
export async function startHttpServer({ port, buildServer, botManager, log }) {
  /** @type {Map<string, StreamableHTTPServerTransport>} */
  const sessions = new Map()

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)

    try {
      // ---------- 运维端点 ----------
      if (url.pathname === '/health') {
        return sendJson(res, 200, {
          ok: true,
          connected: botManager.connected,
          username: botManager.bot?.username ?? null,
          version: botManager.bot?.version ?? null,
          mcpSessions: sessions.size,
        })
      }
      if (url.pathname === '/say' && req.method === 'POST') {
        const body = await readJsonBody(req)
        if (!body?.message) return sendJson(res, 400, { ok: false, error: 'message is required' })
        await botManager.say(body.message)
        return sendJson(res, 200, { ok: true })
      }
      if (url.pathname === '/whisper' && req.method === 'POST') {
        const body = await readJsonBody(req)
        if (!body?.player || !body?.message) return sendJson(res, 400, { ok: false, error: 'player and message are required' })
        const sent = await botManager.whisperTo(body.player, body.message)
        return sendJson(res, 200, { ok: true, chunks: sent })
      }

      // ---------- MCP ----------
      if (url.pathname !== '/mcp') return sendJson(res, 404, { ok: false, error: 'not found' })

      const sessionId = req.headers['mcp-session-id']
      if (sessionId && sessions.has(sessionId)) {
        const transport = sessions.get(sessionId)
        const body = req.method === 'POST' ? await readJsonBody(req) : undefined
        await transport.handleRequest(req, res, body)
        return
      }

      if (!sessionId && req.method === 'POST') {
        const body = await readJsonBody(req)
        if (body?.method !== 'initialize') {
          return sendJson(res, 400, {
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: no valid session, first request must be initialize' },
            id: null,
          })
        }
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, transport)
            log(`MCP session opened: ${sid}`)
          },
        })
        transport.onclose = () => {
          const sid = transport.sessionId
          if (sid) {
            sessions.delete(sid)
            log(`MCP session closed: ${sid}`)
          }
        }
        const mcp = buildServer()
        await mcp.connect(transport) // 注意：SDK 要求连上之后再 handleRequest
        await transport.handleRequest(req, res, body)
        return
      }

      return sendJson(res, 400, {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: unknown or missing session' },
        id: null,
      })
    } catch (e) {
      log(`HTTP handler error (${url.pathname}):`, e?.stack ?? e?.message ?? e)
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: e?.message ?? String(e) })
      else res.end()
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })

  return server
}
