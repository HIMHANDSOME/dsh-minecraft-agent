#!/bin/bash
# 本机 Minecraft 26.1 沙箱专用服务器 —— 启停 / 状态 / 控制台 / 重置世界
#
# 用法:
#   ./run-server.sh start                 启动（后台，日志在 minecraft-server-26.1/console.log）
#   ./run-server.sh stop                  停止
#   ./run-server.sh restart               重启
#   ./run-server.sh status                状态
#   ./run-server.sh cmd "<指令>"          发一条服务器控制台指令（如 give / setblock / time set day）
#   ./run-server.sh tail                  跟随日志
#   ./run-server.sh reset-world           停服 → 删除沙箱世界 → 重启（背包与掉落物全部清空）
#
# 安全说明：
#   - 只监听 127.0.0.1，online-mode=false，仅本机 bot 沙箱使用。
#   - 控制台通过**命名管道**接入，不开启 RCON、不开放任何网络管理端口。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="$HERE/minecraft-server-26.1"
FIFO="$DIR/server.in"
JAVA="${MC_JAVA:-$HOME/Library/Application Support/minecraft/runtime/java-runtime-epsilon/mac-os-arm64/java-runtime-epsilon/jre.bundle/Contents/Home/bin/java}"
MEM="${MC_MEM:-2G}"
MATCH="server.jar nogui"

is_running() { pgrep -f "$MATCH" >/dev/null 2>&1; }

start() {
  if is_running; then
    echo "已在运行 (pid $(pgrep -f "$MATCH" | head -1))"
    return 0
  fi
  [ -x "$JAVA" ] || { echo "找不到 Java: $JAVA（用 MC_JAVA 覆盖）" >&2; exit 1; }
  [ -f "$DIR/server.jar" ] || { echo "缺少 $DIR/server.jar" >&2; exit 1; }
  cd "$DIR"

  # 命名管道作为 stdin：既能发指令，又不开任何网络管理端口。
  [ -p "$FIFO" ] || mkfifo "$FIFO"
  # 常开写端，防止服务端读到 EOF 后自行退出
  ( sleep 100000000 > "$FIFO" ) & echo $! > "$DIR/fifo-holder.pid"

  nohup "$JAVA" -Xms1G -Xmx"$MEM" -jar server.jar nogui < "$FIFO" > console.log 2>&1 &
  echo $! > server.pid
  echo -n "启动中 pid=$(cat server.pid) ..."
  for _ in $(seq 1 60); do
    if grep -q "Done (" console.log 2>/dev/null; then
      echo " 就绪：$(grep -m1 'Done (' console.log)"
      return 0
    fi
    sleep 1
  done
  echo " 超时（60s）。请查看 $DIR/console.log" >&2
  return 1
}

stop() {
  if ! is_running; then echo "未在运行"; rm -f "$DIR/server.pid"; return 0; fi
  pkill -f "$MATCH" || true
  for _ in $(seq 1 20); do is_running || break; sleep 0.5; done
  [ -f "$DIR/fifo-holder.pid" ] && kill "$(cat "$DIR/fifo-holder.pid")" 2>/dev/null || true
  rm -f "$DIR/server.pid" "$DIR/fifo-holder.pid"
  echo "已停止"
}

status() {
  if is_running; then
    echo "运行中 pid=$(pgrep -f "$MATCH" | head -1)"
    grep -m1 "Done (" "$DIR/console.log" 2>/dev/null || true
    echo "监听: $(grep -m1 '^server-ip=' "$DIR/server.properties" 2>/dev/null) / $(grep -m1 '^server-port=' "$DIR/server.properties" 2>/dev/null)"
    echo "控制台通道: $([ -p "$FIFO" ] && echo 就绪 || echo 未创建)   （./run-server.sh cmd \"...\"）"
    echo "加入记录: $(grep -o 'joined the game' "$DIR/console.log" 2>/dev/null | wc -l | tr -d ' ') 次"
  else
    echo "未运行"
  fi
}

send_cmd() {
  is_running || { echo "服务器未运行" >&2; exit 1; }
  [ -p "$FIFO" ] || { echo "控制台通道不存在，请 restart" >&2; exit 1; }
  echo "$*" > "$FIFO"
  echo "已发送: $*"
}

case "${1:-status}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  reset-world)
    stop
    rm -rf "$DIR/world" "$DIR/logs"
    echo "沙箱世界已清空（玩家背包与地面掉落物一并重置）"
    start
    ;;
  status) status ;;
  cmd) shift; send_cmd "${@:-list}" ;;
  tail) tail -f "$DIR/console.log" ;;
  *) echo "用法: $0 {start|stop|restart|status|cmd \"<指令>\"|tail|reset-world}" >&2; exit 2 ;;
esac
