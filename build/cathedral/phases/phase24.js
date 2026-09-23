/**
 * PHASE 24 —— 外围（一）：西广场（湖岸大石埠）
 *
 * building.md §2：西广场约宽 170 格、进深 110 格，中央石路对齐 z=0，
 * 两侧喷泉、雕像、花坛与阶梯；高树不要挡住西立面；外围房屋约 25–35 格高，
 * 不抢双塔轮廓。
 *
 * 实测地形（build/cathedral/probe-sites.js）：教堂以西是**湖**，水面世界 y=58
 * （rel y=-64）。因此西广场做成"湖岸大石埠"：先在水下做石基，再铺广场面，
 * 标高与 PHASE 2 大台阶的谷底平台一致（rel y=-64），中央石路正对 z=0 与西门。
 *
 * 范围：rel x=-200..-110（深 91），z=-90..90（宽 181）。
 */
import { createPlan } from '../layout.js'

const M = {
  stone: 'stone',
  deck: 'stone_bricks',
  road: 'polished_andesite',
  trim: 'polished_deepslate',
  water: 'water',
  soil: 'dirt',
  grass: 'grass_block',
  wood: 'spruce_planks',
  beam: 'stripped_spruce_log',
  roof: 'deepslate_tiles',
  wall: 'stone_bricks',
  statue: 'polished_andesite',
}

const P = { x1: -200, x2: -110, z1: -90, z2: 90, deck: -64, base: -73 }

export function build({ site }) {
  const api = createPlan(24)

  // =============================================================== 1. 水下石基 + 广场面
  api.box(P.x1, P.base, P.z1, P.x2, P.deck - 1, P.z2, M.stone, 'replace', '西广场/石基')
  api.box(P.x1, P.deck, P.z1, P.x2, P.deck, P.z2, M.deck, 'replace', '西广场/铺面')
  // 埠头边缘压顶
  api.box(P.x1, P.deck, P.z1, P.x2, P.deck + 1, P.z1, M.trim, 'replace', '西广场/北缘')
  api.box(P.x1, P.deck, P.z2, P.x2, P.deck + 1, P.z2, M.trim, 'replace', '西广场/南缘')
  api.box(P.x1, P.deck, P.z1, P.x1, P.deck + 1, P.z2, M.trim, 'replace', '西广场/西缘')

  // =============================================================== 2. 中央石路（对齐 z=0，正对西门）
  api.box(P.x1, P.deck, -5, P.x2 + 12, P.deck, 5, M.road, 'replace', '西广场/中央石路')
  for (let x = P.x1 + 6; x <= P.x2; x += 12) {
    api.box(x, P.deck, -12, x, P.deck, -6, M.trim, 'replace', '西广场/路纹N')
    api.box(x, P.deck, 6, x, P.deck, 12, M.trim, 'replace', '西广场/路纹S')
  }

  // =============================================================== 3. 喷泉（两座）
  for (const zc of [-46, 46]) {
    const cx = -150
    api.box(cx - 6, P.deck, zc - 6, cx + 6, P.deck + 1, zc + 6, M.trim, 'replace', '喷泉/池沿')
    api.box(cx - 5, P.deck, zc - 5, cx + 5, P.deck, zc + 5, M.water, 'replace', '喷泉/水面')
    api.box(cx - 1, P.deck + 1, zc - 1, cx + 1, P.deck + 4, zc + 1, M.trim, 'replace', '喷泉/中柱')
    api.box(cx, P.deck + 5, zc, cx, P.deck + 7, zc, M.water, 'replace', '喷泉/水柱')
    api.box(cx - 2, P.deck + 4, zc, cx + 2, P.deck + 4, zc, M.trim, 'replace', '喷泉/上盘')
  }

  // =============================================================== 4. 雕像（4 座，沿石路两侧）
  for (const [sx, sz] of [[-178, -18], [-178, 18], [-122, -18], [-122, 18]]) {
    api.box(sx - 2, P.deck + 1, sz - 2, sx + 2, P.deck + 3, sz + 2, M.trim, 'replace', '雕像/基座')
    api.box(sx - 1, P.deck + 4, sz - 1, sx + 1, P.deck + 8, sz + 1, M.statue, 'replace', '雕像/身')
    api.box(sx, P.deck + 9, sz, sx, P.deck + 10, sz, M.statue, 'replace', '雕像/头')
  }

  // =============================================================== 5. 花坛（6 处）
  for (const [fx, fz] of [[-165, -70], [-165, 70], [-135, -70], [-135, 70], [-190, -30], [-190, 30]]) {
    api.box(fx - 3, P.deck + 1, fz - 3, fx + 3, P.deck + 1, fz + 3, M.trim, 'replace', '花坛/沿')
    api.box(fx - 2, P.deck + 1, fz - 2, fx + 2, P.deck + 1, fz + 2, M.soil, 'replace', '花坛/土')
    api.box(fx - 2, P.deck + 2, fz - 2, fx + 2, P.deck + 2, fz + 2, M.grass, 'replace', '花坛/草')
    api.box(fx, P.deck + 3, fz, fx, P.deck + 5, fz, M.beam, 'replace', '花坛/树')
    api.box(fx - 2, P.deck + 6, fz - 2, fx + 2, P.deck + 6, fz + 2, M.grass, 'replace', '花坛/冠')
    api.box(fx, P.deck + 7, fz, fx, P.deck + 7, fz, M.grass, 'replace', '花坛/冠2')
  }

  // =============================================================== 6. 外围房屋（沿南北边缘，25–35 格高，不抢双塔）
  const houses = []
  for (let i = 0; i < 5; i++) houses.push([-192 + i * 18, -78, 30 + (i % 3)])
  for (let i = 0; i < 5; i++) houses.push([-192 + i * 18, 78, 30 + ((i + 1) % 3)])
  for (const [hx, hz, h] of houses) {
    const s = 8
    // 四面墙做成 2 格厚（不能"实心再掏空"，那样只剩 1 格厚，实测确认过）
    api.box(hx - s, P.deck + 1, hz - s, hx - s + 1, P.deck + h, hz + s, M.wall, 'replace', '民居/西墙')
    api.box(hx + s - 1, P.deck + 1, hz - s, hx + s, P.deck + h, hz + s, M.wall, 'replace', '民居/东墙')
    api.box(hx - s, P.deck + 1, hz - s, hx + s, P.deck + h, hz - s + 1, M.wall, 'replace', '民居/北墙')
    api.box(hx - s, P.deck + 1, hz + s - 1, hx + s, P.deck + h, hz + s, M.wall, 'replace', '民居/南墙')
    api.box(hx - s, P.deck + 1, hz - s, hx + s, P.deck + 3, hz + s, M.wall, 'replace', '民居/基座')
    // 尖顶
    api.box(hx - s, P.deck + h + 1, hz - s, hx + s, P.deck + h + 1, hz + s, M.roof, 'replace', '民居/檐')
    api.box(hx - s + 2, P.deck + h + 2, hz - s + 2, hx + s - 2, P.deck + h + 3, hz + s - 2, M.roof, 'replace', '民居/屋面')
    api.box(hx, P.deck + h + 4, hz, hx, P.deck + h + 4, hz, M.trim, 'replace', '民居/尖顶')
    // 门与窗
    api.box(hx - 1, P.deck + 1, hz + s, hx + 1, P.deck + 3, hz + s, 'air', 'replace', '民居/门')
    for (const wz of [-4, 4]) {
      api.box(hx + wz, P.deck + 5, hz - s, hx + wz + 1, P.deck + 7, hz - s, 'light_gray_stained_glass', 'replace', '民居/窗')
      api.box(hx + wz, P.deck + 5, hz + s, hx + wz + 1, P.deck + 7, hz + s, 'light_gray_stained_glass', 'replace', '民居/窗')
    }
  }

  return api.ops
}
