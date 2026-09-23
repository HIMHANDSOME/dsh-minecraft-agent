/**
 * PHASE 9 —— 飞扶壁（flying buttresses）
 *
 * building.md §2：每个主开间外侧对应一组飞扶壁：内墙承点、弧形飞券、外扶壁塔、
 * 尖塔、排水雕饰；扶壁塔约 45–54 格高，飞券连接约 y=40..57，
 * 位置对齐内部柱网和窗口。
 *
 * 体素做法（相对坐标，每 14 格开间一组，南北镜像）：
 *   外扶壁塔   z=±(58..66)，x=xi±4，y=0..50，塔基外扩、塔顶尖塔到 y=60
 *   弧形飞券   z 从 61 收到 19、y 从 44 升到 57（抛物），3 格宽，横向 1 条 fill（按 y 合并）
 *   排水雕饰   塔身内侧 y=46 处外凸一格
 */
import { createPlan, AXIS } from '../layout.js'

const M = {
  wall: 'stone_bricks',
  trim: 'polished_deepslate',
  rib: 'polished_andesite',
  spire: 'deepslate_tiles',
  gargoyle: 'andesite',
}

const TOWER_Z = [58, 66]
const FLY_OUT = 61        // 飞券外端（塔侧）
const FLY_IN = 19         // 飞券内端（高窗墙）
const FLY_Y_OUT = 44
const FLY_Y_IN = 57

export function build({ site }) {
  const api = createPlan(9)

  for (const s of [1, -1]) {
    const side = s > 0 ? 'S' : 'N'
    const tz = s > 0 ? TOWER_Z : [-TOWER_Z[1], -TOWER_Z[0]]     // [58,66] 或 [-66,-58]
    const flyOut = s * FLY_OUT, flyIn = s * FLY_IN

    for (const xi of AXIS.PIER_LINES) {
      // ---------------- 外扶壁塔
      api.box(xi - 4, 0, tz[0], xi + 4, 50, tz[1], M.wall, 'replace', `飞扶壁${side}/塔x${xi}`)
      api.box(xi - 5, 0, tz[0] - 1, xi + 5, 3, tz[1] + 1, M.trim, 'replace', `飞扶壁${side}/塔基x${xi}`)
      api.box(xi - 5, 48, tz[0] - 1, xi + 5, 50, tz[1] + 1, M.trim, 'replace', `飞扶壁${side}/塔顶x${xi}`)
      // 尖塔（逐层收进，不是实心金字塔缩放到顶）
      api.box(xi - 3, 51, tz[0] + 1, xi + 3, 53, tz[1] - 1, M.wall, 'replace', `飞扶壁${side}/尖塔1x${xi}`)
      api.box(xi - 2, 54, tz[0] + 2, xi + 2, 56, tz[1] - 2, M.spire, 'replace', `飞扶壁${side}/尖塔2x${xi}`)
      api.box(xi - 1, 57, tz[0] + 3, xi + 1, 59, tz[1] - 3, M.spire, 'replace', `飞扶壁${side}/尖塔3x${xi}`)
      api.box(xi, 60, (tz[0] + tz[1]) / 2, xi, 61, (tz[0] + tz[1]) / 2, M.trim, 'replace', `飞扶壁${side}/尖顶x${xi}`)
      // 排水雕饰（内侧外凸一格）
      api.box(xi, 45, tz[0] - 1, xi, 46, tz[0] - 1, M.gargoyle, 'replace', `飞扶壁${side}/排水x${xi}`)

      // ---------------- 弧形飞券（3 格宽，按 y 合并成横向 fills）
      const zFrom = flyOut, zTo = flyIn
      const span = Math.abs(zFrom - zTo)
      const prof = (z) => Math.round(FLY_Y_OUT + (FLY_Y_IN - FLY_Y_OUT) * (1 - Math.pow(Math.abs(z - zFrom) / span, 2)))
      const step = zFrom > zTo ? -1 : 1
      let rs = zFrom, prev = prof(zFrom)
      for (let z = zFrom + step; ; z += step) {
        const atEnd = step > 0 ? z > zTo : z < zTo
        const hv = atEnd ? null : prof(z)
        if (hv !== prev) {
          const z1 = Math.min(rs, z - step), z2 = Math.max(rs, z - step)
          api.box(xi - 1, prev, z1, xi + 1, prev + 1, z2, M.rib, 'replace', `飞扶壁${side}/飞券x${xi}`)
          rs = z; prev = hv
        }
        if (atEnd) break
      }
      // 注：飞券内端直接落在高窗墙（z=±(14..18), y=44..62）上，无需再加支承柱。
      // 早期版本在这里加过一根 stone_bricks 支承柱，会覆盖中殿束柱的柱头/顶板，
      // 已删除；被覆盖的部分由 phases/phase9b-repair.js 复原。
    }
  }

  return api.ops
}
