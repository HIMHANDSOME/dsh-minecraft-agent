/**
 * PHASE 9b —— 修复 PHASE 9 早期版本对中殿束柱柱头/顶板的覆盖
 *
 * 症状：PHASE 5 的束柱顶板（polished_deepslate, y=41..42）在部分柱线上
 * 变成 stone_bricks —— 实测由 PHASE 9 早期版本的"券下支承柱"写坏。
 * 该支承柱已从 phase9.js 删除；这里按束柱原设计把柱头与顶板重新写回。
 */
import { createPlan, AXIS } from '../layout.js'
import { PIER_MAT } from '../pier.js'

export function build({ site }) {
  const api = createPlan('9b-repair')
  for (const xi of AXIS.PIER_LINES) {
    for (const cz of [AXIS.Z_NAVE_PIER, -AXIS.Z_NAVE_PIER]) {
      api.box(xi - 2, 38, cz - 2, xi + 2, 40, cz + 2, PIER_MAT.accent, 'replace', `修复/柱头x${xi}z${cz}`)
      api.box(xi - 3, 41, cz - 3, xi + 3, 42, cz + 3, PIER_MAT.abacus, 'replace', `修复/顶板x${xi}z${cz}`)
    }
  }
  return api.ops
}
