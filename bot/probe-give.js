/**
 * 探针：mc_give 丢失真相 —— 物品到底丢在哪、谁捡到了。
 * 不涉及 LLM，直接通过 MCP 调工具，全程打印坐标与距离。
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
const ME = 'ProbePlayer'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const mcp = new Client({ name: 'probe', version: '0' })
await mcp.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8790/mcp')))
const call = async (name, args = {}) => {
  const r = await mcp.callTool({ name, arguments: args }, undefined, { timeout: 60_000 })
  const t = r.content.find((c) => c.type === 'text').text
  try { return JSON.parse(t) } catch { return { raw: t } }
}

execFileSync(join(ROOT, 'run-server.sh'), ['cmd', `give ${BOT} minecraft:oak_log 8`], { encoding: 'utf8' })

const me = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: ME, version: '26.1', auth: 'offline' })
me.on('error', (e) => { console.error('ME err', e.message); process.exit(1) })

const inv = () => me.inventory.items().map((i) => `${i.name}:${i.count}`)
const itemEntities = () =>
  Object.values(me.entities)
    .filter((e) => e.name === 'item')
    .map((e) => ({ p: e.position.floored(), dMe: +e.position.distanceTo(me.entity.position).toFixed(2) }))

me.once('spawn', async () => {
  await sleep(2500)
  console.log('我（=玩家）在', me.entity.position.floored(), '背包', inv())

  const g = await call('mc_goto_player', { player: ME, range: 1 })
  console.log('mc_goto_player ->', JSON.stringify(g))
  await sleep(1000)

  const st = await call('mc_status')
  const botPos = st.position
  console.log('机器人位置', JSON.stringify(botPos), '我在', me.entity.position.floored())
  console.log('3D 距离 =', Math.hypot(botPos.x - me.entity.position.x, botPos.y - me.entity.position.y, botPos.z - me.entity.position.z).toFixed(2))
  console.log('机器人背包(给之前)', JSON.stringify(st.inventory))

  const before = inv()
  const give = await call('mc_give', { player: ME, itemName: 'oak_log', count: 3 })
  console.log('\nmc_give ->', JSON.stringify(give))
  const st2 = await call('mc_status')
  console.log('机器人位置(丢完)', JSON.stringify(st2.position))

  console.log('\n--- 之后 12 秒逐秒观察 ---')
  for (let i = 1; i <= 12; i++) {
    await sleep(1000)
    const list = itemEntities()
    console.log(
      `t=${i}s 我的背包=${JSON.stringify(inv())} | 我附近掉落物=${list.length} ${JSON.stringify(list.slice(0, 4))}`,
    )
  }
  const st3 = await call('mc_status')
  console.log('\n机器人最终背包', JSON.stringify(st3.inventory))
  console.log('我最终背包', JSON.stringify(inv()), '（起始', JSON.stringify(before), '）')

  await mcp.close(); me.quit(); await sleep(300); process.exit(0)
})
setTimeout(() => { console.error('probe timeout'); process.exit(2) }, 180_000)
