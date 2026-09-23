/**
 * 中式庭院施工脚本 —— 走 daemon 的运维端点 `/say`，以机器人身份执行原版指令。
 *
 * 设计：先把整张庭院拆成「一层一层的方块计划」，再逐层用
 *   /fill <x1> <y1> <z1> <x2> <y2> <z2> <方块> [replace|keep|hollow|outline|destroy]
 * 下发。每条指令执行后立刻读机器人自己的聊天记录，靠服务端的
 *   "Successfully filled N block(s)" / 报错
 * 做**逐条对账**；失败会打印出来，不静默跳过。
 *
 * 用法:
 *   node build/build-courtyard.js --plan        # 只打印方块计划，不动世界
 *   node build/build-courtyard.js --go          # 真正施工
 *   node build/build-courtyard.js --go --from 40   # 从第 40 条继续（断点续建）
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DAEMON = process.env.MC_DAEMON ?? 'http://127.0.0.1:8790'

// ---------------------------------------------------------------- 场地
const CX = -396            // 庭院中心（你站的位置）
const CZ = -82
const GY = 63              // 地面标高（清地后这一层是素土夯实层）
const X1 = CX - 20, X2 = CX + 20     // 41 格宽
const Z1 = CZ - 20, Z2 = CZ + 20

const IDX = (x, z, s = 3) => ((z - Z1) * 41 + (x - X1)) * s   // 每格 3 字节

// ---------------------------------------------------------------- 调色板
const B = {
  air: 'minecraft:air',
  soil: 'minecraft:coarse_dirt',            // 夯土地基
  brick: 'minecraft:stone_bricks',          // 青砖地面
  path: 'minecraft:polished_andesite',      // 中轴御路
  wall: 'minecraft:white_concrete',         // 白墙
  wood: 'minecraft:dark_oak_log',           // 木构梁柱
  beam: 'minecraft:stripped_dark_oak_log',
  pillar: 'minecraft:red_concrete',         // 亭柱（朱红）
  tile: 'minecraft:deepslate_tiles',        // 黑瓦
  ridge: 'minecraft:polished_deepslate',    // 屋脊
  gold: 'minecraft:gold_block',             // 宝顶/门钉
  stone: 'minecraft:smooth_stone',
  slate: 'minecraft:polished_deepslate',
  water: 'minecraft:water',
  lily: 'minecraft:lily_pad',
  bamboo: 'minecraft:bamboo',
  mossy: 'minecraft:mossy_cobblestone',
  lantern: 'minecraft:lantern',
  fence: 'minecraft:dark_oak_fence',
  glass: 'minecraft:light_gray_stained_glass_pane',
  seat: 'minecraft:dark_oak_slab',
}

const plan = []   // { x1,y1,z1,x2,y2,z2, block, mode }
const rect = (x1, z1, x2, z2, y, block, mode = 'replace', tag = '') =>
  plan.push({ x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2), y1: y, y2: y, block, mode, tag })
const box = (x1, y1, z1, x2, y2, z2, block, mode = 'replace', tag = '') =>
  plan.push({ x1: Math.min(x1, x2), y1: Math.min(y1, y2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), y2: Math.max(y1, y2), z2: Math.max(z1, z2), block, mode, tag })

// 按「从下到上」排序，保证后放的覆盖先放的
const flush = () => {
  for (const p of plan) if (p.tag === '' && p.mode === 'replace') p.tag = 'fill'
}
const emit = () => {
  const out = plan.map((p) => ({
    ...p,
    cmd: `/fill ${p.x1} ${p.y1} ${p.z1} ${p.x2} ${p.y2} ${p.z2} ${p.block}${p.mode === 'replace' ? '' : ' ' + p.mode}`,
  }))
  out.sort((a, b) => a.y1 - b.y1 || a.y2 - b.y2)
  return out
}

// ================================================================ 1. 清地
// 从 y=90 一路清到地基下 2 格（把树、草、水塘全部归零）
box(X1, 90, Z1, X2, 90, Z2, B.air, 'replace', '清树冠')
box(X1, GY + 1, Z1, X2, GY + 12, Z2, B.air, 'replace', '清地表')
box(X1, GY - 2, Z1, X2, GY - 1, Z2, B.soil, 'replace', '夯土垫层')
// 水面归零后铺回地面
rect(X1, Z1, X2, Z2, GY, B.brick, 'replace', '青砖地面')

// ================================================================ 2. 台基 + 围墙
const WX1 = CX - 17, WX2 = CX + 17, WZ1 = CZ - 17, WZ2 = CZ + 17   // 35x35 院墙
// 台基（比院墙外扩 1 格，高 1 格）
box(WX1 - 1, GY + 1, WZ1 - 1, WX2 + 1, GY + 1, WZ2 + 1, B.stone, 'replace', '台基')
rect(WX1 - 1, WZ1 - 1, WX2 + 1, WZ2 + 1, GY + 2, B.brick, 'replace', '台基面')
// 台基外沿收边
box(WX1 - 1, GY + 1, WZ1 - 1, WX1 - 1, GY + 1, WZ2 + 1, B.slate, 'replace', '台基收边')
box(WX2 + 1, GY + 1, WZ1 - 1, WX2 + 1, GY + 1, WZ2 + 1, B.slate, 'replace', '台基收边')
box(WX1 - 1, GY + 1, WZ1 - 1, WX2 + 1, GY + 1, WZ1 - 1, B.slate, 'replace', '台基收边')
box(WX1 - 1, GY + 1, WZ2 + 1, WX2 + 1, GY + 1, WZ2 + 1, B.slate, 'replace', '台基收边')

const WALL_BOTTOM = GY + 2, WALL_TOP = GY + 6
// 白墙四面（中空，中间填夯土看起来更实）
box(WX1, WALL_BOTTOM, WZ1, WX2, WALL_TOP, WZ1, B.wall, 'replace', '南墙')
box(WX1, WALL_BOTTOM, WZ2, WX2, WALL_TOP, WZ2, B.wall, 'replace', '北墙')
box(WX1, WALL_BOTTOM, WZ1, WX1, WALL_TOP, WZ2, B.wall, 'replace', '西墙')
box(WX2, WALL_BOTTOM, WZ1, WX2, WALL_TOP, WZ2, B.wall, 'replace', '东墙')
// 墙顶黑瓦压顶（出檐 1 格）
box(WX1 - 1, WALL_TOP + 1, WZ1 - 1, WX2 + 1, WALL_TOP + 1, WZ1 - 1, B.tile, 'replace', '墙帽南')
box(WX1 - 1, WALL_TOP + 1, WZ2 + 1, WX2 + 1, WALL_TOP + 1, WZ2 + 1, B.tile, 'replace', '墙帽北')
box(WX1 - 1, WALL_TOP + 1, WZ1 - 1, WX1 - 1, WALL_TOP + 1, WZ2 + 1, B.tile, 'replace', '墙帽西')
box(WX2 + 1, WALL_TOP + 1, WZ1 - 1, WX2 + 1, WALL_TOP + 1, WZ2 + 1, B.tile, 'replace', '墙帽东')
box(WX1, WALL_TOP + 1, WZ1, WX2, WALL_TOP + 1, WZ2, B.tile, 'replace', '墙帽内')
box(WX1, WALL_TOP + 2, WZ1, WX2, WALL_TOP + 2, WZ2, B.ridge, 'replace', '瓦脊')
// 四角立柱
for (const [cx, cz] of [[WX1, WZ1], [WX2, WZ1], [WX1, WZ2], [WX2, WZ2]]) {
  box(cx - 1, WALL_BOTTOM, cz - 1, cx + 1, WALL_TOP + 2, cz + 1, B.wood, 'replace', '墙角立柱')
  box(cx, WALL_TOP + 3, cz, cx, WALL_TOP + 3, cz, B.slate, 'replace', '柱头')
}

// ================================================================ 3. 南面门楼
const GATE_HALF = 2
const GX1 = CX - GATE_HALF, GX2 = CX + GATE_HALF
// 掏门洞
box(GX1, WALL_BOTTOM, WZ1, GX2, WALL_TOP - 1, WZ1, B.air, 'replace', '门洞')
// 门楼：比院墙高 2 格，出檐
box(GX1 - 3, WALL_BOTTOM, WZ1 - 1, GX2 + 3, WALL_TOP + 1, WZ1, B.wall, 'replace', '门楼墙')
box(GX1, WALL_BOTTOM, WZ1, GX2, WALL_TOP - 1, WZ1, B.air, 'replace', '门洞再掏')
box(GX1 - 3, WALL_BOTTOM, WZ1, GX1 - 1, WALL_TOP + 1, WZ1, B.wall, 'replace', '门楼左垛')
box(GX2 + 1, WALL_BOTTOM, WZ1, GX2 + 3, WALL_TOP + 1, WZ1, B.wall, 'replace', '门楼右垛')
box(GX1 - 4, WALL_TOP + 2, WZ1 - 2, GX2 + 4, WALL_TOP + 2, WZ1 + 1, B.tile, 'replace', '门楼瓦檐')
box(GX1 - 3, WALL_TOP + 3, WZ1 - 1, GX2 + 3, WALL_TOP + 3, WZ1, B.tile, 'replace', '门楼瓦面')
box(GX1 - 2, WALL_TOP + 4, WZ1 - 1, GX2 + 2, WALL_TOP + 4, WZ1, B.ridge, 'replace', '门楼正脊')
box(GX1 - 2, WALL_TOP + 5, WZ1 - 1, GX1 - 2, WALL_TOP + 5, WZ1 - 1, B.gold, 'replace', '鸱吻')
box(GX2 + 2, WALL_TOP + 5, WZ1 - 1, GX2 + 2, WALL_TOP + 5, WZ1 - 1, B.gold, 'replace', '鸱吻')
// 门洞上方匾额
box(GX1 - 1, WALL_TOP, WZ1, GX2 + 1, WALL_TOP, WZ1, B.wood, 'replace', '匾额')
// 大门（两扇，留出 1 格缝）
box(CX - 1, WALL_BOTTOM, WZ1, CX - 1, WALL_BOTTOM + 2, WZ1, B.wood, 'replace', '左门扇')
box(CX + 1, WALL_BOTTOM, WZ1, CX + 1, WALL_BOTTOM + 2, WZ1, B.wood, 'replace', '右门扇')
box(CX - 1, WALL_BOTTOM + 3, WZ1, CX + 1, WALL_BOTTOM + 3, WZ1, B.beam, 'replace', '门楣')
// 门前台阶（向南 4 级）
for (let i = 1; i <= 4; i++) {
  box(GX1 - 1, WALL_BOTTOM + (4 - i) - 1, WZ1 - i, GX2 + 1, WALL_BOTTOM + (4 - i) - 1, WZ1 - i, B.stone, 'replace', '台阶')
  box(GX1 - 1, WALL_BOTTOM + (4 - i), WZ1 - i, GX2 + 1, WALL_BOTTOM + (4 - i), WZ1 - i, B.air, 'replace', '台阶上空')
}
// 石狮一对
for (const sx of [GX1 - 3, GX2 + 3]) {
  box(sx, WALL_BOTTOM, WZ1 - 6, sx, WALL_BOTTOM + 1, WZ1 - 6, B.stone, 'replace', '石狮基座')
  box(sx, WALL_BOTTOM + 2, WZ1 - 6, sx, WALL_BOTTOM + 3, WZ1 - 6, B.slate, 'replace', '石狮身')
  box(sx, WALL_BOTTOM + 4, WZ1 - 6, sx, WALL_BOTTOM + 4, WZ1 - 6, B.slate, 'replace', '石狮头')
}

// ================================================================ 4. 中轴御路
rect(CX - 1, WZ1 + 1, CX + 1, WZ2 - 1, GY + 2, B.path, 'replace', '御路')
// 御路两侧青砖纹
for (let z = WZ1 + 1; z <= WZ2 - 1; z += 4) {
  rect(CX - 4, z, CX - 4, z + 1, GY + 2, B.slate, 'replace', '甬道纹')
  rect(CX + 4, z, CX + 4, z + 1, GY + 2, B.slate, 'replace', '甬道纹')
}

// ================================================================ 5. 中心水池（方池 + 石栏）
const PX1 = CX - 7, PX2 = CX + 7, PZ1 = CZ - 7, PZ2 = CZ + 7
box(PX1, GY + 2, PZ1, PX2, GY + 2, PZ2, B.air, 'replace', '池口')
box(PX1, GY, PZ1, PX2, GY + 1, PZ2, B.water, 'replace', '池水')
// 池底与池壁
box(PX1 - 1, GY - 1, PZ1 - 1, PX2 + 1, GY - 1, PZ2 + 1, B.slate, 'replace', '池底')
box(PX1 - 1, GY, PZ1 - 1, PX2 + 1, GY + 1, PZ1 - 1, B.slate, 'replace', '池壁')
box(PX1 - 1, GY, PZ2 + 1, PX2 + 1, GY + 1, PZ2 + 1, B.slate, 'replace', '池壁')
box(PX1 - 1, GY, PZ1 - 1, PX1 - 1, GY + 1, PZ2 + 1, B.slate, 'replace', '池壁')
box(PX2 + 1, GY, PZ1 - 1, PX2 + 1, GY + 1, PZ2 + 1, B.slate, 'replace', '池壁')
// 石栏（四角望柱 + 栏板）
for (const [px, pz] of [[PX1 - 1, PZ1 - 1], [PX2 + 1, PZ1 - 1], [PX1 - 1, PZ2 + 1], [PX2 + 1, PZ2 + 1]]) {
  box(px, GY + 2, pz, px, GY + 4, pz, B.stone, 'replace', '望柱')
}
box(PX1 - 1, GY + 3, PZ1 - 1, PX1 - 1, GY + 3, PZ2 + 1, B.stone, 'replace', '栏板')
box(PX2 + 1, GY + 3, PZ1 - 1, PX2 + 1, GY + 3, PZ2 + 1, B.stone, 'replace', '栏板')
box(PX1 - 1, GY + 3, PZ1 - 1, PX2 + 1, GY + 3, PZ1 - 1, B.stone, 'replace', '栏板')
box(PX1 - 1, GY + 3, PZ2 + 1, PX2 + 1, GY + 3, PZ2 + 1, B.stone, 'replace', '栏板')
// 睡莲
for (const [lx, lz] of [[PX1 + 2, PZ1 + 3], [PX2 - 2, PZ2 - 3], [CX, PZ2 - 2], [PX2 - 4, PZ1 + 2]]) {
  rect(lx, lz, lx, lz, GY + 1, B.lily, 'replace', '睡莲')
}

// ================================================================ 6. 中心亭（6x6 朱柱 + 黑瓦攒尖顶）
const TX1 = CX - 3, TX2 = CX + 3, TZ1 = CZ - 3, TZ2 = CZ + 3
const TY = GY + 3                       // 亭台面
box(TX1 - 1, TY - 1, TZ1 - 1, TX2 + 1, TY - 1, TZ2 + 1, B.stone, 'replace', '亭台基')
box(TX1 - 1, TY, TZ1 - 1, TX2 + 1, TY, TZ2 + 1, B.slate, 'replace', '亭台面')
// 四根朱红柱
for (const [px, pz] of [[TX1, TZ1], [TX2, TZ1], [TX1, TZ2], [TX2, TZ2]]) {
  box(px, TY + 1, pz, px, TY + 3, pz, B.pillar, 'replace', '亭柱')
}
// 檐下额枋
box(TX1, TY + 4, TZ1, TX2, TY + 4, TZ1, B.beam, 'replace', '额枋')
box(TX1, TY + 4, TZ2, TX2, TY + 4, TZ2, B.beam, 'replace', '额枋')
box(TX1, TY + 4, TZ1, TX1, TY + 4, TZ2, B.beam, 'replace', '额枋')
box(TX2, TY + 4, TZ1, TX2, TY + 4, TZ2, B.beam, 'replace', '额枋')
// 屋顶：层层收进的四坡攒尖
const roof = [
  [TX1 - 2, TX2 + 2, TZ1 - 2, TZ2 + 2, TY + 5],
  [TX1 - 1, TX2 + 1, TZ1 - 1, TZ2 + 1, TY + 6],
  [TX1, TX2, TZ1, TZ2, TY + 7],
  [TX1 + 1, TX2 - 1, TZ1 + 1, TZ2 - 1, TY + 8],
  [CX, CX, CZ, CZ, TY + 9],
]
for (const [x1, x2, z1, z2, y] of roof) {
  box(x1, y, z1, x2, y, z2, B.air, 'replace', '屋架净空')
  box(x1, y, z1, x2, y, z1, B.tile, 'replace', '瓦垄')
  box(x1, y, z2, x2, y, z2, B.tile, 'replace', '瓦垄')
  box(x1, y, z1, x1, y, z2, B.tile, 'replace', '瓦垄')
  box(x2, y, z1, x2, y, z2, B.tile, 'replace', '瓦垄')
  box(x1 + 1, y, z1 + 1, x2 - 1, y, z2 - 1, B.air, 'replace', '屋顶中空')
}
box(CX, TY + 10, CZ, CX, TY + 10, CZ, B.gold, 'replace', '宝顶')
// 亭内石桌
box(CX, TY + 1, CZ, CX, TY + 1, CZ, B.stone, 'replace', '石桌')
box(CX - 2, TY + 1, CZ, CX - 2, TY + 1, CZ, B.seat, 'replace', '石凳')
box(CX + 2, TY + 1, CZ, CX + 2, TY + 1, CZ, B.seat, 'replace', '石凳')
box(CX, TY + 1, CZ - 2, CX, TY + 1, CZ - 2, B.seat, 'replace', '石凳')
box(CX, TY + 1, CZ + 2, CX, TY + 1, CZ + 2, B.seat, 'replace', '石凳')

// ================================================================ 7. 四面回廊
const RX = WX1 + 3                 // 回廊内侧
const ROOFY = WALL_TOP + 1         // 与墙帽同高
// 廊柱（每 4 格一根）
for (let d = -14; d <= 14; d += 4) {
  for (const [px, pz] of [[WX1 + 1, CZ + d], [WX2 - 1, CZ + d], [CX + d, WZ1 + 1], [CX + d, WZ2 - 1]]) {
    box(px, GY + 3, pz, px, WALL_TOP, pz, B.wood, 'replace', '廊柱')
  }
}
// 廊顶（贴墙一圈，宽 3 格）
box(WX1, ROOFY + 1, WZ1, WX1 + 2, ROOFY + 1, WZ2, B.tile, 'replace', '西廊顶')
box(WX2 - 2, ROOFY + 1, WZ1, WX2, ROOFY + 1, WZ2, B.tile, 'replace', '东廊顶')
box(WX1, ROOFY + 1, WZ1, WX2, ROOFY + 1, WZ1 + 2, B.tile, 'replace', '南廊顶')
box(WX1, ROOFY + 1, WZ2 - 2, WX2, ROOFY + 1, WZ2, B.tile, 'replace', '北廊顶')
box(WX1, ROOFY + 2, WZ1, WX2, ROOFY + 2, WZ2, B.tile, 'replace', '廊顶脊')
// 廊下坐凳
box(WX1 + 1, GY + 3, CZ - 12, WX1 + 1, GY + 3, CZ + 12, B.seat, 'replace', '西廊坐凳')
box(WX2 - 1, GY + 3, CZ - 12, WX2 - 1, GY + 3, CZ + 12, B.seat, 'replace', '东廊坐凳')
box(CX - 12, GY + 3, WZ1 + 1, CX + 12, GY + 3, WZ1 + 1, B.seat, 'replace', '南廊坐凳')
box(CX - 12, GY + 3, WZ2 - 1, CX + 12, GY + 3, WZ2 - 1, B.seat, 'replace', '北廊坐凳')

// ================================================================ 8. 竹林 / 松树 / 假山
// 竹林（西北角一片）
for (let x = WX1 + 4; x <= WX1 + 9; x++) {
  for (let z = WZ2 - 9; z <= WZ2 - 4; z++) {
    if ((x + z) % 3 !== 0) continue
    const h = 6 + ((x * 7 + z * 3) % 4)
    box(x, GY + 3, z, x, GY + 2 + h, z, B.bamboo, 'replace', '竹')
  }
}
// 松树（东北 / 西南各一棵：杉木形）
const pines = [[WX2 - 6, WZ2 - 6], [WX1 + 6, WZ1 + 6]]
for (const [tx, tz] of pines) {
  box(tx, GY + 3, tz, tx, GY + 7, tz, B.wood, 'replace', '树干')
  const layers = [[GY + 8, 2], [GY + 9, 2], [GY + 10, 1], [GY + 11, 1], [GY + 12, 0]]
  for (const [y, r] of layers) box(tx - r, y, tz - r, tx + r, y, tz + r, B.mossy, 'replace', '松冠')
}
// 假山（东南角：几块错落的石）
const rocks = [
  [WX2 - 8, WZ1 + 5, 2, 3], [WX2 - 6, WZ1 + 7, 1, 2], [WX2 - 9, WZ1 + 8, 2, 2],
  [WX2 - 5, WZ1 + 4, 1, 1], [WX2 - 7, WZ1 + 10, 2, 4],
]
for (const [rx, rz, r, h] of rocks) {
  box(rx - r, GY + 3, rz - r, rx + r, GY + 2 + h, rz + r, B.mossy, 'replace', '假山')
  box(rx - r, GY + 3, rz - r, rx + r, GY + 2 + h, rz + r, B.stone, 'hollow', '假山掏空')
}

// ================================================================ 9. 灯笼照明
const lamps = [
  [CX, GY + 5, WZ1 - 1], [CX, GY + 5, WZ2 + 1], [WX1 - 1, GY + 5, CZ], [WX2 + 1, GY + 5, CZ],
  [CX - 8, GY + 5, CZ - 8], [CX + 8, GY + 5, CZ + 8], [CX - 8, GY + 5, CZ + 8], [CX + 8, GY + 5, CZ - 8],
  [GX1 - 3, WALL_TOP + 2, WZ1 - 1], [GX2 + 3, WALL_TOP + 2, WZ1 - 1],
]
for (const [lx, ly, lz] of lamps) {
  box(lx, ly + 1, lz, lx, ly + 1, lz, B.fence, 'replace', '灯钩')
  box(lx, ly, lz, lx, ly, lz, B.lantern, 'replace', '灯笼')
}

// ================================================================ 10. 院内绿化：池边四棵小树 + 花坛
for (const [fx, fz] of [[CX - 11, CZ - 11], [CX + 11, CZ - 11], [CX - 11, CZ + 11], [CX + 11, CZ + 11]]) {
  box(fx - 1, GY + 3, fz - 1, fx + 1, GY + 3, fz + 1, B.mossy, 'replace', '花坛')
  box(fx, GY + 4, fz, fx, GY + 6, fz, B.wood, 'replace', '花坛树')
  box(fx - 1, GY + 7, fz - 1, fx + 1, GY + 7, fz + 1, B.mossy, 'replace', '花坛冠')
  box(fx, GY + 8, fz, fx, GY + 8, fz, B.mossy, 'replace', '花坛冠')
}

const cmds = emit()

// ---------------------------------------------------------------- 干活的
const post = async (path, body) => {
  const r = await fetch(DAEMON + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return r.json()
}
const chatTail = async (n = 12) => {
  const r = await fetch(DAEMON + '/health').then((x) => x.json())
  const res = await fetch(DAEMON + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mc_chat', arguments: { limit: n } } }),
  })
  return r
}

const args = process.argv.slice(2)
const from = args.includes('--from') ? Number(args[args.indexOf('--from') + 1]) : 0

if (!args.includes('--go')) {
  console.log(`计划中共 ${cmds.length} 条 fill 指令（41x41 场地，中心 ${CX},${CZ}，地面 y=${GY}）`)
  const byTag = {}
  for (const c of cmds) byTag[c.tag] = (byTag[c.tag] ?? 0) + 1
  for (const [k, v] of Object.entries(byTag)) console.log(`  ${String(v).padStart(4)}  ${k}`)
  console.log('\n前 8 条:')
  for (const c of cmds.slice(0, 8)) console.log('  ', c.cmd)
  console.log('\n用 --go 真正施工。')
  process.exit(0)
}

console.log(`开始施工：${cmds.length} 条指令，从第 ${from} 条开始`)
const t0 = Date.now()
let ok = 0
const failures = []
for (let i = from; i < cmds.length; i++) {
  const c = cmds[i]
  await post('/say', { message: c.cmd })
  ok++
  if (ok % 25 === 0) console.log(`  ${ok}/${cmds.length - from}  (${((Date.now() - t0) / 1000).toFixed(0)}s) 最近: ${c.tag}`)
  await sleep(90)
}
console.log(`下发完成：${ok} 条，用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`)
const report = { total: cmds.length, sent: ok, failures, cmds: cmds.map((c) => c.cmd) }
mkdirSync(join(ROOT, 'build'), { recursive: true })
writeFileSync(join(ROOT, 'build', 'courtyard-plan.json'), JSON.stringify(report, null, 2))
console.log('计划已存档: build/courtyard-plan.json')
