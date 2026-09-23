/**
 * PHASE 3 —— 地下墓室（crypt）
 *
 * building.md §1 F 区：约 x=75..244, z=-35..35, y=-17..-3；
 * §2：柱网呼应上层，先结构后墓龛、石棺和小祭坛；至少两条实际连通地面的楼梯。
 * §3 PHASE 3 停止点：先不做大量墓饰。
 *
 * 现状：PHASE 2 已把台地核心填成实心石（y=-20..-1），地坪面层在 y=0。
 * 因此地宫是"从实心台地里挖出来的真空间"，天花板（y=-3..-1）与地面（y=0）保持完整。
 *
 * 体素做法：
 *   1. 挖空：x=79..240, z=-31..31, y=-16..-4，留 4 格厚顶板 + 4 格厚底板；
 *   2. 柱网：x=85,113,141,169,197,225 × z=±18（12 根），柱础/柱身/柱头，柱顶 y=-4；
 *   3. 肋：柱线上 y=-4 的横向肋 + z=±18 的纵向肋（呼应上层柱网）；
 *   4. 墓龛：南北墙每柱线一个 3×3 凹龛（结构性的，不做墓饰）；
 *   5. 两条楼梯：西侧 x=80..96、东侧 x=240..224（均 z=-5..5），
 *      17 级实心踏步从 y=-17 升到 y=0，并在地坪 y=0 开出井口。
 */
import { createPlan, AXIS } from '../layout.js'

const M = {
  stone: 'stone_bricks',
  trim: 'polished_deepslate',
  base: 'andesite',
  rib: 'polished_andesite',
  accent: 'calcite',
  stair: 'smooth_stone',
}

export const CRYPT = {
  x1: 79, x2: 240,
  z1: -31, z2: 31,
  yFloor: -17,
  yCeil: -3,      // 顶板底 = -3（块），室内净空到 -4
  pierX: [85, 113, 141, 169, 197, 225],
  pierZ: [18, -18],
}

/** 一条实心楼梯：从 (xStart, y=-17) 沿 dir 方向逐级升到 y=0，宽 zHalf */
function stairway(api, api_plan, xStart, dir, zHalf, tag) {
  const N = 17
  // 井道必须正好等于踏步所在列：多挖一格就会把出口平台挖成竖井（实测导致楼梯成死路）
  const shaftX1 = xStart + dir * 1
  const shaftX2 = xStart + dir * N
  // 井道：从踏步上方一路开到地坪层，留出净空与地面井口
  api.box(Math.min(shaftX1, shaftX2), -16, -zHalf, Math.max(shaftX1, shaftX2), 0, zHalf, 'air', 'replace', `${tag}/井道`)
  // 实心踏步
  for (let k = 1; k <= N; k++) {
    const x = xStart + dir * k
    api.box(x, -17, -zHalf, x, -17 + k, zHalf, M.stone, 'replace', `${tag}/踏步${k}`)
  }
  // 踏面收边
  for (let k = 1; k <= N; k++) {
    const x = xStart + dir * k
    api.box(x, -17 + k, -zHalf, x, -17 + k, -zHalf, M.stair, 'replace', `${tag}/踏面北${k}`)
    api.box(x, -17 + k, zHalf, x, -17 + k, zHalf, M.stair, 'replace', `${tag}/踏面南${k}`)
  }
  return api
}

export function build({ site }) {
  const api = createPlan(3)
  const C = CRYPT

  // ---------------- 1. 挖空
  api.box(C.x1, -16, C.z1, C.x2, -4, C.z2, 'air', 'replace', '地宫/挖空')
  // 地面层（夯实石板）
  api.box(C.x1, -17, C.z1, C.x2, -17, C.z2, M.stone, 'replace', '地宫/地面')
  api.box(C.x1 + 2, -17, C.z1 + 2, C.x2 - 2, -17, C.z2 - 2, M.trim, 'replace', '地宫/地面铺装')

  // ---------------- 2. 柱网（呼应上层）
  for (const px of C.pierX) {
    for (const pz of C.pierZ) {
      api.box(px - 3, -17, pz - 3, px + 3, -16, pz + 3, M.base, 'replace', `地宫/柱础x${px}z${pz}`)
      api.box(px - 1, -15, pz - 1, px + 1, -5, pz + 1, M.stone, 'replace', `地宫/柱身x${px}z${pz}`)
      api.box(px - 2, -5, pz - 2, px + 2, -4, pz + 2, M.accent, 'replace', `地宫/柱头x${px}z${pz}`)
    }
  }

  // ---------------- 3. 肋（横向 + 纵向）
  for (const px of C.pierX) {
    api.box(px, -4, C.z1 + 1, px, -4, C.z2 - 1, M.rib, 'replace', `地宫/横肋x${px}`)
  }
  for (const pz of C.pierZ) {
    api.box(C.x1 + 1, -4, pz, C.x2 - 1, -4, pz, M.rib, 'replace', `地宫/纵肋z${pz}`)
  }

  // ---------------- 4. 墓龛（南北墙，每柱线一个 3x3 凹龛）
  for (const px of C.pierX) {
    api.box(px - 1, -14, C.z1 - 1, px + 1, -12, C.z1, 'air', 'replace', `地宫/北龛x${px}`)
    api.box(px - 1, -14, C.z2, px + 1, -12, C.z2 + 1, 'air', 'replace', `地宫/南龛x${px}`)
    api.box(px - 2, -15, C.z1 - 1, px + 2, -15, C.z1, M.trim, 'replace', `地宫/北龛楣x${px}`)
    api.box(px - 2, -15, C.z2, px + 2, -15, C.z2 + 1, M.trim, 'replace', `地宫/南龛楣x${px}`)
  }

  // ---------------- 5. 两条连通地面的楼梯
  stairway(api, null, 80, 1, 5, '地宫/西梯')
  stairway(api, null, 239, -1, 5, '地宫/东梯')

  // 楼梯口石栏（地坪层，防止直接掉下去；留出入口）
  for (const [xc, tag] of [[96, '西'], [223, '东']]) {
    api.box(xc - 1, 1, -5, xc + 1, 2, -5, M.trim, 'replace', `地宫/${tag}梯口栏N`)
    api.box(xc - 1, 1, 5, xc + 1, 2, 5, M.trim, 'replace', `地宫/${tag}梯口栏S`)
  }

  return api.ops
}
