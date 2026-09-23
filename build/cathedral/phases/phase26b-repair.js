/**
 * PHASE 26b —— 主教宫整体南移，并清除旧位置
 *
 * 症状（实测发现）：PHASE 26 原本占 rel z=66..134，与**耳堂南臂**（z 到 79）
 * 及其台地（z 到 84）重叠。它的"清场"指令把耳堂南端墙 x=155..180、y<=14 与
 * 台地铺面一起清掉了。
 * 修法：
 *   1. 这里把旧位置（z=64..140）整体清空，再按南移 24 格后的位置重建主教宫
 *      （phase26.js 已加 DZ=24）；
 *   2. 随后重跑 PHASE 11（重置其进度）把耳堂南臂原样恢复。
 */
import { createPlan } from '../layout.js'
import { buildInto } from './phase26.js'

export function build({ site }) {
  const api = createPlan('26b-repair')
  api.box(60, -15, 64, 180, 40, 140, 'air', 'replace', '修复/清除旧主教宫')
  buildInto(api)
  return api.ops
}
