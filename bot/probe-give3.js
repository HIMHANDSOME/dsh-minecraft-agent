/**
 * 受控探针 3：不走 LLM，直接用 MCP 调 mc_goto_player + mc_give，
 * 快速迭代"把东西交给玩家"这条链路。地形不行就重试整轮。
 */
import mineflayer from 'mineflayer'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')
const BOT = process.env.MC_USER ?? 'DeepSeekBot'
const ME = 'GiveProbe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const cmd = (c) => { try { execFileSync(join(ROOT, 'run-server.sh'), ['cmd', c], { encoding: 'utf8' }) } catch {} }

const mcp = new Client({ name: 'give3', version: '0' })
await mcp.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8790/mcp')))
const call = async (name, args = {}, t = 90_000) => {
  const r = await mcp.callTool({ name, arguments: args }, undefined, { timeout: t })
  const txt = r.content.find((c) => c.type === 'text').text
  try { return JSON.parse(txt) } catch { return { raw: txt } }
}

const me = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: ME, version: '26.1', auth: 'offline' })
me.on('error', (e) => { console.error('ME err', e.message); process.exit(1) })
const inv = () => me.inventory.items().map((i) => `${i.name}:${i.count}`)

me.once('spawn', async () => {
  await sleep(2500)
  cmd(`give ${BOT} minecraft:oak_log 16`)
  await sleep(1500)

  let success = false
  for (let round = 1; round <= 4 && !success; round++) {
    console.log(`\n===== 第 ${round} 轮 =====`)
    const g = await call('mc_goto_player', { player: ME, range: 1 })
    console.log('mc_goto_player:', JSON.stringify(g))
    if (!g.ok) { await sleep(2000); continue }
    await sleep(800)

    const before = inv()
    const give = await call('mc_give', { player: ME, itemName: 'oak_log', count: 3 })
    console.log('mc_give:', JSON.stringify(give))
    let after = before
    for (let i = 0; i < 8; i++) {
      await sleep(500)
      after = inv()
      if (after.length > before.length) break
    }
    const gained = after.filter((x) => x.startsWith('oak_log')).length > 0
    console.log(`我的背包 ${JSON.stringify(before)} -> ${JSON.stringify(after)}  捡到了=${gained}`)
    success = gained
    if (!success) { console.log('本轮没捡到，换个位置再来'); await sleep(1500) }
  }

  console.log(`\n结果: ${success ? 'GIVE_PASS' : 'GIVE_FAIL'}`)
  await mcp.close(); me.quit(); await sleep(300); process.exit(success ? 0 : 1)
})
setTimeout(() => { console.error('probe timeout'); process.exit(2) }, 300_000)
