/**
 * PHASE 3b —— 修复地宫柱础被柱身覆盖
 *
 * 症状：PHASE 3 早期版本柱身从 y=-17 起，把 7×7 的柱础（andesite, y=-17..-16）
 * 覆盖成 stone_bricks（实测于 x=85,z=18,y=-16）。
 * 修法：按原设计把柱础写回；phase3.js 已改为柱身自 y=-15 起。
 */
import { createPlan } from '../layout.js'
import { CRYPT } from './phase3.js'

export function build({ site }) {
  const api = createPlan('3b-repair')
  for (const px of CRYPT.pierX) {
    for (const pz of CRYPT.pierZ) {
      api.box(px - 3, -17, pz - 3, px + 3, -16, pz + 3, 'andesite', 'replace', `修复/地宫柱础x${px}z${pz}`)
    }
  }
  return api.ops
}
