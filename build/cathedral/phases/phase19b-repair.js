/**
 * PHASE 19b —— 把挡在中轴上的前厅灯笼移到两侧
 *
 * 症状：PHASE 19 早期把前厅（西门内）灯笼挂在 (14,10,0)，正好落在
 * "西门→祭坛"的中央通视轴上；后殿灯笼同样挂在 z=0。
 * 修法：清掉中轴上的那两盏，改挂到 z=±6 / z=±8。
 */
import { createPlan } from '../layout.js'
import { C as EC } from '../eastend.js'

export function build({ site }) {
  const api = createPlan('19b-repair')
  // 清掉中轴上的灯笼与链
  api.box(14, 9, 0, 14, 10, 0, 'air', 'replace', '修复/中轴灯笼')
  api.box(EC.x + 20, 29, 0, EC.x + 20, 30, 0, 'air', 'replace', '修复/后殿中轴灯笼')
  // 改挂两侧
  for (const z of [6, -6]) {
    api.box(14, 10, z, 14, 10, z, 'iron_chain', 'replace', '修复/前厅链')
    api.box(14, 9, z, 14, 9, z, 'lantern', 'replace', '修复/前厅灯')
  }
  for (const z of [8, -8]) {
    api.box(EC.x + 20, 30, z, EC.x + 20, 30, z, 'iron_chain', 'replace', '修复/后殿链')
    api.box(EC.x + 20, 29, z, EC.x + 20, 29, z, 'lantern', 'replace', '修复/后殿灯')
  }
  return api.ops
}
