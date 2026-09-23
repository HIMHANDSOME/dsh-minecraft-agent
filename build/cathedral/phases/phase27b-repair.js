/**
 * PHASE 27b —— 把墓园小径抬到行走面
 *
 * 症状：PHASE 27 的小径铺在 y=Y（石基那一层），而行走面是 y=Y+1（草地层），
 * 结果小径被草地盖住，等于看不见。
 * 修法：把小径重铺到 y=Y+1；phase27.js 已改为 Y+1。
 */
import { createPlan } from '../layout.js'

const M = { path: 'smooth_stone' }
const Y = -48
const WALL = { x1: 292, x2: 394, z1: -56, z2: 56 }

export function build({ site }) {
  const api = createPlan('27b-repair')
  api.box(WALL.x1 + 1, Y + 1, -1, WALL.x2 - 1, Y + 1, 1, M.path, 'replace', '修复/主径')
  api.box(318, Y + 1, WALL.z1 + 1, 320, Y + 1, WALL.z2 - 1, M.path, 'replace', '修复/横径')
  return api.ops
}
