# P0 预检 · 环境事实快照

采集时间：本次会话 · 采集方式：直接命令实测（非文档推断）

## 主机

| 项 | 值 | 来源 |
|---|---|---|
| OS | macOS 26.6.2 (build 25G83), arm64 | `sw_vers`, `uname -m` |
| Homebrew | 6.0.9 (`/opt/homebrew/bin/brew`) | `brew --version` |
| Node | v25.9.0 | `node --version` |
| npm | 11.12.1 | `npm --version` |
| pnpm | 11.7.0 | `pnpm --version` |
| Python | 3.13.13 | `python3 --version` |
| git | 2.54.0 | `git --version` |
| 系统 Java | **无**（`java` 不在 PATH，`/usr/libexec/java_home -V` 报错） | 实测 |
| 自带 Java | OpenJDK **25.0.1** LTS (Microsoft-12574220) | 直接执行：`~/Library/Application Support/minecraft/runtime/java-runtime-epsilon/mac-os-arm64/java-runtime-epsilon/jre.bundle/Contents/Home/bin/java -version` |

## Minecraft

| 项 | 值 |
|---|---|
| 启动器 | `/Applications/Minecraft.app` |
| 已装版本 | `26.2`（完整）、`26.3-snapshot-10`、`26.3-snapshot-9`、`26.3-rc-2` |
| 存档目录 | `~/Library/Application Support/minecraft/saves`（**本项目全程不读写**） |
| Mojang 最新正式版 | 26.3 |
| 26.x 所需 Java | majorVersion = 25 ✅ 自带 JRE 匹配 |
| server.jar (26.1) | `https://piston-data.mojang.com/v1/objects/3872a7f07a1a595e651aef8b058dfc2bb3772f46/server.jar`（60,417,588 B，SHA1 = `3872a7f0…2f46`） |

## Bot 库版本支持上限（关键实测）

| 库 | 版本 | 最高支持 MC | 证据 |
|---|---|---|---|
| mineflayer + minecraft-data | 4.39.0 / 3.117.0 | **26.1** | 安装后调用 `minecraft-data.supportedVersions.pc`：共 72 个，末位 `26.1`；`includes('26.2') === false` |
| minecraft-data (git master) | — | **26.1** | `data/pc/common/versions.json` 末项 `26.1` |
| azalea (Rust) | 0.16.0+mc26.1 | **26.1** | crates.io API：`max_version = 0.16.0+mc26.1` |

→ **结论：26.2 / 26.3 目前无任何成熟 bot 库支持**，故锁定 26.1。

## DSH

| 项 | 值 |
|---|---|
| 源码 | `~/deepseek-harness` (v0.1.6-alpha.2 预览版) |
| DSH_HOME | `~/.dsh` |
| profiles | `web`（运行中 PID 19987）、`headless` |
| profile 用户层 | `~/.dsh/profiles/<name>/cordis.patch.yml`（顶层 YAML 数组：id 覆盖 / disable / `insert`） |
| MCP 插件 | `@deepseek-ai/dsh-mcp-client`，`Config = StdioConfig | StreamableHttpConfig`；工具公开名 `mcp__<serverName>__<tool>` |
| stdio 配置字段 | `transport:'stdio'`, `serverName`, `command`, `args[]`, `env{}`, `cwd`, `toolCallTimeoutMs`, `failOnStartupError`, `reconnect` |
| headless 用法 | `pnpm dsh --profile headless "<task>"` |
| 端口 3080 | 除 dsh web (19987) 外另有 PID 13591 占用，重启时需留意 |

## npm 候选包

| 包 | 版本 | 说明 |
|---|---|---|
| mineflayer | 4.39.0 | 自研方案核心 |
| minecraft-data | 3.117.0 | 版本数据 |
| mineflayer-pathfinder | 2.4.5 | 寻路 |
| @modelcontextprotocol/sdk | 1.30.0 | MCP server 实现 |
| minecraft-mcp-server | 1.2.0 | 现成包（本次不采用，用户选自研） |
| maicraft | 1.10.6 | mineflayer 系现成包 |
| dsh-mcp-mgr | 0.2.0 | DSH 社区 MCP 管理器（本次不采用，改用原生插件） |

## 用户已批决策

1. 路线 **A**：新建 26.1 独立服务器 + mineflayer
2. 接入面：**新 profile 与 web profile 两者都做**（web 需重启，另行确认时机）
3. MCP Server：**自研薄封装**
4. 同意：EULA `eula=true` ✅、`online-mode=false` ✅、仅绑定 `127.0.0.1` ✅；**不安装 26.1 客户端**（本轮只跑机器人，不联机旁观）
