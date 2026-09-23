/**
 * PHASE 24b —— 把外围民居的薄墙补厚
 *
 * 症状：PHASE 24 早期用"实心大方块 + 掏空内部"建房，结果四面墙各只剩 1 格厚。
 * 修法：按 2 格厚重发四面墙；phase24.js 已改为直接按墙面砌。
 */
import { createPlan } from '../layout.js'

const M = { wall: 'stone_bricks' }
const P = { deck: -64 }
const s = 8

export function build({ site }) {
  const api = createPlan('24b-repair')
  const houses = []
  for (let i = 0; i < 5; i++) houses.push([-192 + i * 18, -78, 30 + (i % 3)])
  for (let i = 0; i < 5; i++) houses.push([-192 + i * 18, 78, 30 + ((i + 1) % 3)])
  for (const [hx, hz, h] of houses) {
    api.box(hx - s, P.deck + 1, hz - s, hx - s + 1, P.deck + h, hz + s, M.wall, 'replace', '修复/民居西墙')
    api.box(hx + s - 1, P.deck + 1, hz - s, hx + s, P.deck + h, hz + s, M.wall, 'replace', '修复/民居东墙')
    api.box(hx - s, P.deck + 1, hz - s, hx + s, P.deck + h, hz - s + 1, M.wall, 'replace', '修复/民居北墙')
    api.box(hx - s, P.deck + 1, hz + s - 1, hx + s, P.deck + h, hz + s, M.wall, 'replace', '修复/民居南墙')
  }
  return api.ops
}
