#!/bin/bash
# 常驻机器人 daemon：持有 Minecraft 连接 + 提供 MCP(streamable-http) + 游戏内私聊交互
#
# 为什么需要它：玩家用 `/msg DeepSeekBot <内容>` 时机器人必须**一直在线**才收得到私聊。
# 之前 `./run-agent.sh` 是每次任务拉起一个进程、跑完就断开，不满足这个前提。
#
# 用法:
#   ./run-daemon.sh start      启动（等 MCP 就绪后返回）
#   ./run-daemon.sh stop       停止
#   ./run-daemon.sh restart
#   ./run-daemon.sh status     状态（含机器人是否在线）
#   ./run-daemon.sh logs       跟随日志
#
# 环境变量:
#   MC_MCP_PORT        MCP HTTP 端口（默认 8766）
#   MC_INGAME_ALLOW    允许使用私聊控制的玩家名（逗号分隔；不设=所有人。本机服默认即可）
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${MC_MCP_PORT:-8790}"
PIDFILE="$HERE/logs/daemon.pid"
LOG="$HERE/logs/daemon.log"
DAEMON="$HERE/bot/mcp-server.js"

mkdir -p "$HERE/logs"

is_running() {
  [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
}

start() {
  if is_running; then echo "已在运行 (pid $(cat "$PIDFILE"))"; return 0; fi
  cd "$HERE"
  MC_NO_PUBLIC_CHAT=1 nohup node "$DAEMON" --http "$PORT" --ingame >> "$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  echo -n "启动中 pid=$(cat "$PIDFILE")，等待机器人上线 ..."
  for _ in $(seq 1 60); do
    if curl -sf --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
      local h
      h="$(curl -s --max-time 2 "http://127.0.0.1:$PORT/health")"
      echo " 就绪"
      echo "  $h"
      return 0
    fi
    sleep 1
  done
  echo " 超时（60s）。看 $LOG" >&2
  return 1
}

stop() {
  if ! is_running; then echo "未在运行"; rm -f "$PIDFILE"; return 0; fi
  local pid; pid="$(cat "$PIDFILE")"
  pkill -P "$pid" 2>/dev/null || true   # 先收掉正在跑的 dsh 子进程
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$PIDFILE"
  echo "已停止"
}

status() {
  if is_running; then
    echo "运行中 pid=$(cat "$PIDFILE")"
    curl -s --max-time 3 "http://127.0.0.1:$PORT/health" || echo "(health 无响应)"
    echo
    echo "最近 ingame 记录:"
    grep -a "\[ingame\]" "$LOG" 2>/dev/null | tail -5 || echo "  (暂无)"
  else
    echo "未运行"
  fi
}

case "${1:-status}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  logs) tail -f "$LOG" ;;
  *) echo "用法: $0 {start|stop|restart|status|logs}" >&2; exit 2 ;;
esac
