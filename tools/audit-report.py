#!/usr/bin/env python3
"""
把服务端审计日志（logs/mcp-audit.jsonl）渲染成可读的核对报告。

审计日志由 MCP 服务端写入（不是模型生成的），因此可以用它核对 Agent 的自述
有没有编造。用法：

    ./tools/audit-report.py                # 全部
    ./tools/audit-report.py --tail 20      # 最近 20 次调用
    ./tools/audit-report.py --json         # 原始 JSON 逐行
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LOG = os.path.join(HERE, "..", "logs", "mcp-audit.jsonl")

# 优先展示这些字段，避免整棵实体树刷屏
KEEP = (
    "ok", "error", "dug", "position", "collected", "requested", "attempts",
    "pickedUp", "crafted", "times", "gained", "usesTable", "placed", "at",
    "container", "contents", "moved", "smelted", "got", "fuelUsed",
    "attacks", "kills", "whiffs", "weapon", "ate", "inventory",
    "unknownBlockNames", "retriedForChunks", "notes", "failures",
)


def shorten(value, limit=160):
    text = json.dumps(value, ensure_ascii=False)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", default=DEFAULT_LOG)
    ap.add_argument("--tail", type=int, default=0, help="只看最近 N 次调用")
    ap.add_argument("--json", action="store_true", help="输出原始 JSON 行")
    args = ap.parse_args()

    path = os.path.abspath(args.log)
    if not os.path.exists(path):
        print(f"找不到审计日志: {path}", file=sys.stderr)
        print("先跑一次 ./run-agent.sh 或 node bot/test-s2.js", file=sys.stderr)
        return 1

    rows = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    if args.json:
        for row in rows:
            print(json.dumps(row, ensure_ascii=False))
        return 0

    if args.tail:
        rows = rows[-args.tail :]

    print(f"审计日志: {path}")
    print(f"共 {len(rows)} 次工具调用")
    print("=" * 78)

    for i, row in enumerate(rows, 1):
        res = row.get("result") or {}
        flag = "ERR " if row.get("isError") else "ok  "
        print(f"[{i:>3}] {flag}{row.get('tool', '?'):<14} {row.get('durationMs', '?'):>6}ms  args={shorten(row.get('args', {}), 110)}")
        kept = {k: res[k] for k in KEEP if k in res}
        if "blocks" in res:
            kept["blocks"] = f"<{len(res['blocks'])} 个方块>"
        if kept:
            print(f"       {shorten(kept, 400)}")
        if res.get("failures"):
            for f in res["failures"][-3:]:
                print(f"       ! {f}")

    errs = [r for r in rows if r.get("isError")]
    print("=" * 78)
    print(f"失败 {len(errs)} / {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
