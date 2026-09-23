/**
 * PHASE 27 —— 外围（四）：东墓园
 *
 * building.md §2：东墓园含石墙、小径与墓碑。
 * 实测地形：该区地表世界 y 42..154，平台取 **世界 y=74**（rel y=-48）。
 *
 * 布局（rel）：矩形墓园，四周石墙（留南门），中央十字小径，两侧成行墓碑，
 * 中央设一座小祭堂（平面 11×9）。
 */
import { createPlan } from '../layout.js'

const M = {
  stone: 'stone',
  wall: 'stone_bricks',
  trim: 'polished_deepslate',
  path: 'smooth_stone',
  grass: 'grass_block',
  grave: 'polished_andesite',
  graveOld: 'mossy_stone_bricks',
  roof: 'deepslate_tiles',
  glass: 'light_gray_stained_glass',
  cross: 'polished_deepslate',
  gold: 'gold_block',
}

const Y = -48
const FOOT = { x1: 288, x2: 398, z1: -60, z2: 60 }
const WALL = { x1: 292, x2: 394, z1: -56, z2: 56 }

export function build({ site }) {
  const api = createPlan(27)

  // =============================================================== 1. 台地
  api.box(FOOT.x1, -80, FOOT.z1, FOOT.x2, Y - 1, FOOT.z2, M.stone, 'replace', '墓园/基础')
  api.box(FOOT.x1 - 2, Y + 1, FOOT.z1 - 2, FOOT.x2 + 2, Y + 24, FOOT.z2 + 2, 'air', 'replace', '墓园/清场')
  api.box(FOOT.x1, Y, FOOT.z1, FOOT.x2, Y, FOOT.z2, M.stone, 'replace', '墓园/地坪')
  api.box(WALL.x1, Y + 1, WALL.z1, WALL.x2, Y + 1, WALL.z2, M.grass, 'replace', '墓园/草地')

  // =============================================================== 2. 石墙（留南门）
  const H = 4
  api.box(WALL.x1, Y + 1, WALL.z1, WALL.x2, Y + H, WALL.z1, M.wall, 'replace', '墓园/北墙')
  api.box(WALL.x1, Y + 1, WALL.z2, WALL.x2, Y + H, WALL.z2, M.wall, 'replace', '墓园/南墙')
  api.box(WALL.x1, Y + 1, WALL.z1, WALL.x1, Y + H, WALL.z2, M.wall, 'replace', '墓园/西墙')
  api.box(WALL.x2, Y + 1, WALL.z1, WALL.x2, Y + H, WALL.z2, M.wall, 'replace', '墓园/东墙')
  api.box(WALL.x1, Y + H + 1, WALL.z1, WALL.x2, Y + H + 1, WALL.z1, M.trim, 'replace', '墓园/北墙帽')
  api.box(WALL.x1, Y + H + 1, WALL.z2, WALL.x2, Y + H + 1, WALL.z2, M.trim, 'replace', '墓园/南墙帽')
  api.box(WALL.x1, Y + H + 1, WALL.z1, WALL.x1, Y + H + 1, WALL.z2, M.trim, 'replace', '墓园/西墙帽')
  api.box(WALL.x2, Y + H + 1, WALL.z1, WALL.x2, Y + H + 1, WALL.z2, M.trim, 'replace', '墓园/东墙帽')
  api.box(340, Y + 1, WALL.z2, 346, Y + H, WALL.z2, 'air', 'replace', '墓园/南门')
  api.box(339, Y + H + 1, WALL.z2, 347, Y + H + 1, WALL.z2, M.trim, 'replace', '墓园/门楣')

  // =============================================================== 3. 十字小径
  // 注意：这里全部是**相对坐标**。主径沿 x、在 z=-1..1；横径沿 z、在 x=318..320
  // （放在 318 而不是 343，是为了避开中央小祭堂）。
  api.box(WALL.x1 + 1, Y + 1, -1, WALL.x2 - 1, Y + 1, 1, M.path, 'replace', '墓园/主径')
  api.box(318, Y + 1, WALL.z1 + 1, 320, Y + 1, WALL.z2 - 1, M.path, 'replace', '墓园/横径')

  // =============================================================== 4. 墓碑（成行，错落 + 少量苔石）
  let gi = 0
  for (let x = WALL.x1 + 6; x <= WALL.x2 - 6; x += 8) {
    for (const zs of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const z = zs * (12 + k * 10)
        gi++
        const blk = gi % 5 === 0 ? M.graveOld : M.grave
        api.box(x, Y + 1, z, x + 1, Y + 2, z, blk, 'replace', '墓园/墓碑')
        api.box(x, Y + 3, z, x, Y + 3, z, M.cross, 'replace', '墓园/十字')
        api.box(x - 1, Y + 1, z - 1, x + 2, Y + 1, z + 1, M.stone, 'replace', '墓园/墓基')
      }
    }
  }

  // =============================================================== 5. 中央小祭堂
  const CH = { x1: 337, x2: 349, z1: -20, z2: -10 }
  api.box(CH.x1, Y + 1, CH.z1, CH.x2, Y + 8, CH.z2, M.wall, 'replace', '祭堂/墙身')
  api.box(CH.x1 + 2, Y + 2, CH.z1 + 2, CH.x2 - 2, Y + 7, CH.z2 - 2, 'air', 'replace', '祭堂/内部')
  api.box(CH.x1, Y + 1, CH.z1, CH.x2, Y + 2, CH.z2, M.trim, 'replace', '祭堂/基座')
  api.box(CH.x1 - 1, Y + 9, CH.z1 - 1, CH.x2 + 1, Y + 9, CH.z2 + 1, M.roof, 'replace', '祭堂/檐')
  api.box(CH.x1, Y + 10, CH.z1, CH.x2, Y + 11, CH.z2, M.roof, 'replace', '祭堂/屋面')
  api.box(343, Y + 12, -15, 343, Y + 14, -15, M.trim, 'replace', '祭堂/顶饰')
  api.box(343, Y + 15, -15, 343, Y + 15, -15, M.gold, 'replace', '祭堂/金顶')
  api.box(342, Y + 1, CH.z2, 344, Y + 4, CH.z2, 'air', 'replace', '祭堂/门')
  api.box(CH.x1 + 1, Y + 4, CH.z1, CH.x2 - 1, Y + 7, CH.z1, M.glass, 'replace', '祭堂/北窗')

  return api.ops
}
