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

---

# P9 增量 · Windows 环境事实快照

采集方式同 P0：**实测**，不是查文档。

## 主机

| 项 | 值 | 来源 |
|---|---|---|
| OS | Windows 11 (build 10.0.22621), x64 | `$PSVersionTable` / Win32 |
| PowerShell | **5.1.22621.6133**（系统自带；所有脚本按 PS 5.1 兼容写） | `$PSVersionTable.PSVersion` |
| Node / npm | v24.14.1 / 11.12.1 | `node --version` |
| Python | 已装（`python` 在 PATH） | `python -m py_compile` 通过 |
| 系统 Java | **JDK 24.0.1**（`C:\Program Files\Java\jdk-24`）+ JRE 1.8.0_491；PATH 上是 Oracle `javapath` → **24** | 实测 |
| Minecraft Launcher | `.minecraft\versions` 有 **26.1 / 26.2 / 26.3** 等 5 个版本；`PCL.ini` 显示用 PCL2 | 目录 + 配置 |
| `.minecraft\runtime\` | **不存在**（PCL2 自管 Java，借不到启动器自带 JRE） | 实测 |
| MC 26.1 所需 Java | 客户端 `versions\26.1\26.1.json` 的 `javaVersion.majorVersion` = **25**，component `java-runtime-epsilon` | 直接读该 JSON |

→ **结论：本机原状跑不了 26.1 服务端**（只有 24 和 8）。必须补 JDK 25，这就是 `tools/install-java-win.ps1` 存在的原因。

## 补上的 Java 25

| 项 | 值 |
|---|---|
| 分发 | Microsoft Build of OpenJDK 25.0.4.1 LTS |
| 入口 | `https://aka.ms/download-jdk/microsoft-jdk-25-windows-x64.zip`（302 → `download.visualstudio.microsoft.com/.../microsoft-jdk-25.0.4.1-windows-x64.zip`） |
| 大小 | 210.5 MB（zip）/ 解压后 584 MB |
| 落点 | `<仓库>\.runtime\jdk-25\`（**不改系统 PATH、不改注册表、不写 Program Files**，删目录即回退） |
| 指针 | `<仓库>\.runtime\java-path.txt`，`run-server.ps1` 自动读取 |

## Windows 上实测通过的链路

| 项 | 结果 |
|---|---|
| `run-server.ps1 java` | 探测到 4 个候选，正确识别 25/24/24/8，选中 25 ✅ |
| `run-server.ps1 start` | 真实启动 MC 26.1 → `Done (0.234s)! For help, type "help"` ✅ |
| `run-server.ps1 cmd "list"` | 命名管道回环 → 服务端日志 `There are 2 of a max of 5 players online: ...` ✅ |
| `run-server.ps1 stop` | **优雅停机** → `Saving worlds` → `Saving chunks ... All dimensions are saved` → 干净退出 ✅ |
| `run-server.ps1 status` | 进程、`Done` 行、`server-ip`/`server-port`、加入次数、端口占用 PID ✅ |
| `run-daemon.ps1 start` | `DeepSeekBot` 真实登入：服务端 `logged in with entity id 493`；`/health` → `connected:true` ✅ |
| `run-daemon.ps1 stop` | 服务端记录 `DeepSeekBot left the game` ✅ |
| MCP（Windows） | `tools/list` = **23** 个工具；`mc_status` 拿到真实坐标；`mc_collect` 让背包 `0 -> 2` ✅ |
| S2 回归 | **8/8 PASS** ✅ |
| `test-p0-tools.js` | **14/14 PASS**（1 项按设计跳过：模板 `protected[]` 为空）✅ |
| `run-agent.ps1` 启动链路 | 正确识别"无源码 checkout"→ 回退全局 `dsh`，参数与报错如实透传 ✅ |

## Windows 上未验证 / 需要先配置

| 项 | 状态 |
|---|---|
| `run-agent.ps1` 的**实际 headless 任务** | ⏸ 被 profile 挡住：本机 `~\.dsh\profiles` 只有 `web`，没有 `minecraft`。dsh 报 `profile "minecraft" does not exist`。需先按 README「配置要点」建好 profile |
| 游戏内 `/msg DeepSeekBot` 全链路 | ⏸ 同上（daemon 已能收私聊，但每个 turn 要调 `run-agent` → 需要 profile） |
| S4 / S5 / S6 / S7 长链在 Windows 上重跑 | ⏸ 未做（S2 与 P0 工具边界已在 Windows 上重跑通过） |

## Windows 上的 6 个已修坑

见 [PLAN.md](PLAN.md) §9.3 的表格（`.ps1` 必须有 UTF-8 BOM、`$ErrorActionPreference='Stop'` 吃掉 java stderr、`OutputDataReceived` 回调在阻塞的 runspace 里排不上、`Select-String` 遇共享锁静默失败、`Start-Process` 不许 stdout/stderr 同文件、`-like` 锚定误命中）。
下载侧：`HttpWebRequest` / `HttpClient` 同步 Read / `Start-BitsTransfer` **三者都会卡死**，故自研 **异步读 + 60s stall 判定 + HTTP Range 续传**，实测 210.5 MB / 26s 完成。

