#!/bin/bash
# 在 Minecraft 项目目录里启动 DSH 的 minecraft profile（headless 单次任务）
#
# 为什么需要这个脚本：`pnpm dsh` 必须在 DSH 仓库里跑，而 headless 会话的
# 工作目录 = 进程 cwd。直接用 pnpm 会把工作目录变成 DSH 仓库，所以这里
# 显式用仓库里的 tsx 加载器、但把 cwd 留在本项目目录。
#
# 用法:
#   ./run-agent.sh "在 Minecraft 里采集 1 个原木，然后报告你的坐标和背包"
#   ./run-agent.sh --json "..."     # 输出 NDJSON 事件流
#   MC_PROFILE=minecraft-ingame ./run-agent.sh --json "..."   # 走常驻 HTTP MCP（游戏内私聊用）
set -euo pipefail

REPO="${DSH_REPO:-$HOME/deepseek-harness}"
PROFILE="${MC_PROFILE:-minecraft}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$REPO/apps/cli/src/bin.ts" ]; then
  echo "找不到 DSH 仓库: $REPO（可用 DSH_REPO 环境变量覆盖）" >&2
  exit 1
fi

TSX="$(node -e "process.stdout.write(require.resolve('tsx/esm',{paths:['$REPO']}))")"
# tsx 按 cwd 查找 tsconfig；cwd 不在仓库里时会丢失 @deepseek-ai/* 的路径映射，
# 造成 "does not provide an export named 'FiberState'" 这类假故障。必须显式指定。
export TSX_TSCONFIG_PATH="${TSX_TSCONFIG_PATH:-$REPO/tsconfig.json}"
cd "$HERE"
exec node --import "$TSX" "$REPO/apps/cli/src/bin.ts" --profile "$PROFILE" "$@"
