/**
 * 受控探针 2：用控制台 tp 把机器人和"玩家"放到同一平地上，排除地形因素，
 * 精确回答三件事：
 *   A) mc_give 之后掉落物到底出现在哪、离玩家多远
 *   B) 玩家站原地不动会不会自动拾取
 *   C) 玩家主动走过去踩到物品上会不会拾取（验证我方 inventory 读取是否正常）
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
const cmd = (c) => { try { return execFileSync(join(ROOT, 'run-server.sh'), ['cmd', c], { encoding: 'utf8' }) } catch (e) { return String(e) } }

const mcp = new Client({ name: 'probe2', version: '0' })
await mcp.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8790/mcp')))
const call = async (name, args = {}) => {
  const r = await mcp.callTool({ name, arguments: args }, undefined, { timeout: 60_000 })
  const t = r.content.find((c) => c.type === 'text').text
  try { return JSON.parse(t) } catch { return { raw: t } }
}

const me = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: ME, version: '26.1', auth: 'offline' })
me.on('error', (e) => { console.error('ME err', e.message); process.exit(1) })

const inv = () => me.inventory.items().map((i) => `${i.name}:${i.count}`)
const items = () => Object.values(me.entities).filter((e) => e.name === 'item')
const dTo = (p) => +p.distanceTo(me.entity.position).toFixed(2)

me.once('spawn', async () => {
  await sleep(2500)
  cmd(`give ${BOT} minecraft:oak_log 8`)
  await sleep(1200)

  const st = await call('mc_status')
  const b = st.position
  const fx = Math.floor(b.x), fy = Math.round(b.y), fz = Math.floor(b.z)
  console.log(`机器人在 (${fx},${fy},${fz})；把它和我都 tp 到这块平地旁边`)
  cmd(`tp ${BOT} ${fx} ${fy} ${fz}`)
  cmd(`tp ${ME} ${fx + 2} ${fy} ${fz}`)
  await sleep(2500)
  console.log('我在', me.entity.position.floored(), '背包', inv())

  // ---- A/B: mc_give 后原地不动 ----
  const before = inv()
  const give = await call('mc_give', { player: ME, itemName: 'oak_log', count: 3 })
  console.log('\n[A] mc_give ->', JSON.stringify(give))
  const st2 = await call('mc_status')
  console.log('    机器人(丢完)在', JSON.stringify(st2.position))

  for (let i = 1; i <= 6; i++) {
    await sleep(1000)
    const list = items().map((e) => ({ p: e.position.floored(), d: dTo(e.position) }))
    console.log(`    t=${i}s 我的背包=${JSON.stringify(inv())} 掉落物=${JSON.stringify(list)}`)
  }
  const pickedIdle = inv().length > before.length
  console.log(`[B] 原地不动自动拾取: ${pickedIdle ? '成功' : '失败'}`)

  // ---- C: 玩家主动走过去踩 ----
  const near = items().sort((a, c) => dTo(a.position) - dTo(c.position))[0]
  if (near) {
    console.log(`\n[C] 我朝掉落物 ${near.position.floored()} 走过去（距离 ${dTo(near.position)}）`)
    for (let i = 0; i < 40; i++) {
      const e = items().sort((a, c) => dTo(a.position) - dTo(c.position))[0]
      if (!e) break
      if (dTo(e.position) < 0.9) break
      await me.lookAt(e.position.offset(0, 0.2, 0), true)
      me.setControlState('forward', true)
      await sleep(200)
      me.setControlState('forward', false)
    }
    await sleep(1500)
    console.log(`    走过去后我的背包=${JSON.stringify(inv())} 剩余掉落物=${items().length}`)
  } else {
    console.log('\n[C] 附近没有任何掉落物 —— 说明 mc_give 的物品根本没生成在玩家附近')
  }

  console.log(`\n最终：我的背包=${JSON.stringify(inv())}（起始 ${JSON.stringify(before)}）`)
  const st3 = await call('mc_status')
  console.log(`机器人背包=${JSON.stringify(st3.inventory)}`)

  await mcp.close(); me.quit(); await sleep(300); process.exit(0)
})
setTimeout(() => { console.error('probe timeout'); process.exit(2) }, 200_000)
