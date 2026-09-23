#!/bin/bash
# 分批驱动施工：客户端集成服务端在连续几百条 /fill 之后回执会积压，
# 表现为后续指令"no server ack"（方块其实已写入）。分批 + 批间重连可以稳定推进，
# 且幂等：已经写好的 op 重跑会返回 "No blocks were filled"，一样记为完成。
#
# 用法: ./build/cathedral/drive.sh <phase> [batch] [maxBatches]
set -uo pipefail
PHASE="${1:?phase}"
BATCH="${2:-140}"
MAXB="${3:-60}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HERE"
PROG="build/cathedral/progress/phase${PHASE}.json"
LOG="logs/phase${PHASE}-drive.log"

count_done() {
  python3 -c "import json,sys
try: print(len(json.load(open('$PROG'))['done']))
except Exception: print(0)" 2>/dev/null || echo 0
}

stall=0
for i in $(seq 1 "$MAXB"); do
  before=$(count_done)
  echo "=== batch $i: done=$before ===" | tee -a "$LOG"
  MC_FILL_TIMEOUT_MS="${MC_FILL_TIMEOUT_MS:-12000}" node build/cathedral/run.js --phase "$PHASE" --go --limit "$BATCH" >> "$LOG" 2>&1
  after=$(count_done)
  echo "    $before -> $after"
  if [ "$after" -le "$before" ]; then
    stall=$((stall+1))
    echo "    (no progress, stall=$stall)"
    [ "$stall" -ge 3 ] && { echo "连续 3 批无进展，停止。看 $LOG"; break; }
  else
    stall=0
  fi
  sleep 4
done
echo "最终 done=$(count_done)"
