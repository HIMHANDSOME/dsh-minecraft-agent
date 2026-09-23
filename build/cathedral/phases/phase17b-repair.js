/**
 * PHASE 17b —— 修复尖塔"格环"被填实
 *
 * 症状：早期版本用 `hollow` 打水平格环，但 hollow 在只有 1 层高的区域
 * 会把整块填实（没有内部），实测尖塔中心 y=150 处变成 deepslate_tiles，
 * 不是镂空。
 * 修法：把已填实的格环内部掏空；phase17.js 已改为"显式 4 条边 + 掏空内部"。
 */
import { createPlan, AXIS } from '../layout.js'
import { TX, TMAT } from '../tower.js'

const ringLevels = () => {
  const out = []
  for (let y = 138; y <= 160; y++) {
    const t = (y - 138) / 22
    const r = Math.max(1, Math.round(2 + (10 - 2) * (1 - t)))
    if ((y - 138) % 4 === 0 && r >= 2) out.push({ y, r })
  }
  return out
}

export function build({ site }) {
  const api = createPlan('17b-repair')
  for (const zc of [AXIS.TOWER_Z, -AXIS.TOWER_Z]) {
    for (const { y, r } of ringLevels()) {
      api.box(TX - r + 1, y, zc - r + 1, TX + r - 1, y, zc + r - 1, 'air', 'replace', `修复/格环内y${y}`)
      api.box(TX - r, y, zc - r, TX + r, y, zc - r, TMAT.roof, 'replace', `修复/格环Ny${y}`)
      api.box(TX - r, y, zc + r, TX + r, y, zc + r, TMAT.roof, 'replace', `修复/格环Sy${y}`)
      api.box(TX - r, y, zc - r + 1, TX - r, y, zc + r - 1, TMAT.roof, 'replace', `修复/格环Wy${y}`)
      api.box(TX + r, y, zc - r + 1, TX + r, y, zc + r - 1, TMAT.roof, 'replace', `修复/格环Ey${y}`)
    }
  }
  return api.ops
}
