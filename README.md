# DeepSeek Agent × Minecraft（macOS）

让 DeepSeek Harness 里的 Agent 通过 **MCP** 真实操作一个 Minecraft Java 机器人：
自己看世界、走过去、砍树挖矿、合成、放方块、开箱子、烧熔炉、打怪、吃东西。

- 目标版本：**Minecraft Java 26.1**（当前 bot 库支持上限，原因见下）
- 机器人库：`mineflayer 4.39.0`（+ `mineflayer-pathfinder`）
- 接入方式：自研 MCP Server（**19 个工具**）→ DSH 原生 `@deepseek-ai/dsh-mcp-client`
- 服务器：本机专用服，只监听 `127.0.0.1`，`online-mode=false`，**不碰你的个人存档**
- **游戏内交互**：在聊天框敲 `/msg DeepSeekBot <内容>`，Agent 当场在游戏里执行并私聊回复你
- **双角色协同**：你用官方客户端进同一世界，DeepSeek 操控 `DeepSeekBot`，两人互见、可跟随、可交接物品
- 测试结果：见 [RESULTS.md](RESULTS.md) —— S1 ✅ / S2 8-8 ✅ / S4 生存链 19-19 ✅ / S5 游戏内交互 5-5 ✅ / S6 控制+记忆 9-9 ✅ / **S7 双角色协同 7-7 ✅**

---

## 双角色协同：你一个角色，DeepSeek 一个角色

服务器只绑 `127.0.0.1`、`online-mode=false`，所以你用官方客户端连 `localhost` 就是一个独立玩家，和 `DeepSeekBot` 同处一个世界。

**⚠️ 版本必须匹配 26.1**：服务器是 26.1，你 launcher 里装的 26.2 连不上（协议不兼容）。

**加入步骤（你自己操作，我不动你的 launcher 目录）**：

1. 打开 Minecraft Launcher → **安装 / Installations** → **新建 / New installation**
2. 名称随意，版本下拉选 **release 26.1**（列表里没有就勾上"显示快照"或等它拉取版本清单）
3. 保存 → 用这个安装启动游戏 → **多人游戏 → 直接连接 → `localhost`**（端口默认 25565）

进来以后，按 `T` 在聊天框里直接指挥它：

```
/msg DeepSeekBot 跟着我              → 一直跟着你（常驻后台循环）
/msg DeepSeekBot 到我这儿来          → 一次性走到你身边
/msg DeepSeekBot 把 3 个原木给我      → 走到你旁边把东西丢在你脚边
/msg DeepSeekBot 别跟了              → 停止跟随
/msg DeepSeekBot 帮我在旁边搭个小屋   → 自由发挥
```

`mc_status` 会返回队友的**坐标与距离**，所以它知道你在哪；你不需要按 F3 报坐标。

### 为此新增的 3 个工具

| 工具 | 作用 |
|---|---|
| `mc_follow` | `start` / `stop` / `status`。常驻后台跟随，说一次"跟着我"就够；后台循环会让路给其它工具调用，所以"跟着我"和"顺便砍棵树"能并存 |
| `mc_goto_player` | 走到指定玩家身边（一次性） |
| `mc_give` | 走到玩家约 1 格内、**垂直丢下**物品让玩家自动拾取（丢完主动退开避免自己捡回；落点太远会把物品捡回来重试） |

---

## 游戏内 `/msg DeepSeekBot` 交互

在游戏聊天框里：

```
/msg DeepSeekBot 帮我砍 2 个原木，然后告诉我背包里有什么
/msg DeepSeekBot 你在哪？血量和背包怎么样
/msg DeepSeekBot 你上一轮砍的是什么树？        ← 有对话记忆，能接着聊
```

机器人会：先回一句「收到，正在处理」→ **真的在游戏里调用工具干活** → 把结果私聊回给你。
**只有你（发起者）能看到回复**，不会刷公共聊天。

> 为什么是 `/msg` 而不是 `/deepseek`：斜杠命令必须由**服务端**注册，原版服务端收到 `/deepseek` 只会回 `Unknown command`，无法拦截。要做真正的 `/deepseek` 必须换 Paper/Fabric 服务端并装插件（已调研：Paper 26.1.2 build 74 与 Fabric 26.1 都可用，自带 JDK 25 也够），按你的选择本轮**不换服务端**。

相关开关：

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `MC_INGAME_ALLOW` | 空（所有人） | 允许使用私聊控制的玩家名，逗号分隔 |
| `MC_INGAME_QUEUE` | 10 | 队列上限，超出会回「我还在忙」 |
| `MC_INGAME_TIMEOUT_MS` | 300000 | 单条 turn 超时 |
| `MC_INGAME_REPLY_CHARS` | 900 | 回复字符上限，超出截断 |

---

## 为什么必须是 26.1（重要）

实测（不是查文档）：`minecraft-data@3.117.0` 的 `supportedVersions.pc` 共 72 个版本，末位是 **26.1**，`includes('26.2') === false`；`minecraft-data` 的 git master 同样止步 26.1；Rust 生态的 `azalea` 最新版是 `0.16.0+mc26.1`。

**目前没有任何成熟 bot 库会说 26.2 / 26.3 的协议。** 所以本方案自建一个 26.1 专用服务器，而不是连你 26.2 的客户端世界。

升级路径：等 `minecraft-data` 支持 26.2+ 后，把 `bot/package.json` 里 mineflayer/minecraft-data 升级、`MC_VERSION` 改成新版本、下载对应 `server.jar` 即可，MCP 与 DSH 侧不用动。

---

## 架构

```
【方式一】一次性任务（跑完就断）
DSH profile "minecraft"  ──stdio──▶  bot/mcp-server.js  ──协议 26.1──▶  服务器
                                      mineflayer 机器人 + 16 工具

【方式二】游戏内交互（机器人常驻在线）  ← ./run-daemon.sh start
玩家: /msg DeepSeekBot 帮我砍树
   │
   ▼  mineflayer whisper 事件
bot/mcp-server.js --http 8790 --ingame   （常驻：持有机器人 + MCP HTTP + 私聊入口）
   │  ① 串行队列
   │  ② MC_PROFILE=minecraft-ingame ./run-agent.sh --json --session-id <记住的会话>
   ▼
DSH agent ──streamable-http──▶ 同一个常驻 MCP 服务 ──▶ 机器人在世界里干活
   │
   ▼  ③ 结果用 bot.whisper 私聊回发起者
玩家 ← 「坐标 x=6.5, y=69, z=-2.5，背包 oak_log ×2」

公共设施：minecraft-server-26.1/  仅 127.0.0.1:25565，无 RCON；logs/mcp-audit.jsonl 记录每次工具调用
```

---

## 快速开始

```bash
cd /path/to/dsh-minecraft-agent

# 1) 起服务器（后台，就绪后自动返回）
./run-server.sh start

# 2A) 【游戏内交互】起常驻机器人 daemon —— 之后在游戏聊天框里 /msg DeepSeekBot ...
./run-daemon.sh start
./run-daemon.sh status        # 看机器人是否在线、最近处理了什么
./run-daemon.sh logs          # 跟随日志

# 2B) 【一次性任务】不开 daemon 也能用（机器人为这一次任务临时上线）
./run-agent.sh "在 Minecraft 里采集 3 个原木，完成后报告坐标和背包"
./run-agent.sh --json "采集 4 个原木，做一个工作台并合成一把木镐"   # NDJSON 事件流

# 3) 核对 Agent 有没有瞎说（服务端审计日志，模型无法伪造）
./tools/audit-report.py

# 4) 想造测试夹具 / 查在线玩家（走 FIFO 控制台，不开任何网络管理端口）
./run-server.sh cmd "list"
./run-server.sh cmd "give DeepSeekBot minecraft:cobblestone 8"

# 5) 收工
./run-daemon.sh stop
./run-server.sh stop
```

> ⚠️ **同名冲突**：daemon 的机器人叫 `DeepSeekBot`。开着 daemon 时再跑一次性的 `./run-agent.sh`（也是 `DeepSeekBot`）会被服务端踢掉其中一个。二选一用。

单人验证（不花 LLM token）：

```bash
node bot/connect.js              # S1：连通性 / 移动 / 挖掘
node bot/test-s2.js              # S2：MCP 协议层 + 16 个工具（8 项断言）
node bot/test-survival.js        # S4：完整生存链（19 项断言）
node bot/test-ingame.js          # S5：游戏内私聊交互（5 项断言，需 daemon 在跑）
node bot/test-ingame-memory.js   # S6：真控制 + 对话记忆（9 项断言，需 daemon 在跑）
node bot/test-coop.js            # S7：双角色协同（7 项断言，需 daemon 在跑）
```

想亲自进游戏旁观：官方 Launcher → 安装 → 新建 **26.1** 版本 → 多人游戏连 `localhost`。
（`online-mode=false`，任何用户名都能进；仅本机可达。）

---

## Minecraft 工具清单（19 个）

### 感知
| 工具 | 作用 |
|---|---|
| `mc_status` | 坐标/血量/饥饿/维度/时间/背包/附近敌对生物/**队友坐标与距离**/跟随状态。首次调用自动连接 |
| `mc_scan` | 半径内查找若干种方块 + 附近实体类型统计（支持空数组只查实体） |

### 移动与交互
| 工具 | 作用 | 超时上限 |
|---|---|---|
| `mc_goto` | 寻路走到坐标（不挖穿地形） | 60s |
| `mc_goto_player` | **走到某个玩家身边**（协同用） | 60s |
| `mc_follow` | **持续跟随某个玩家**，`start`/`stop`/`status` | — |
| `mc_give` | **把物品交给某个玩家**（走到约 1 格内垂直丢下） | 20s |
| `mc_look_at` | 看向坐标或某类实体 | — |
| `mc_chat` | 发言 / 读取最近聊天（游戏内模式下发言被禁用） | — |
| `mc_wait` | 等待世界推进（等掉落、等天亮） | — |

### 采集与建造
| 工具 | 作用 | 超时上限 |
|---|---|---|
| `mc_collect` | **最常用**：反复寻找→走过去→挖→**把掉落物捡起来**，直到拿到指定数量 | 45s |
| `mc_dig` | 挖指定坐标或附近最近的某类方块 | 20s |
| `mc_place` | 放置方块；**不给坐标就放在视线所看方块的上面** | 15s |
| `mc_inventory` | 列出 / 装备 / 丢弃物品 | — |

### 生存循环
| 工具 | 作用 | 超时上限 |
|---|---|---|
| `mc_craft` | 合成物品；自动判断要不要工作台，会自动找附近的合成台 | 30s |
| `mc_container` | 箱子/木桶/潜影盒：list / deposit / withdraw | 20s |
| `mc_smelt` | 熔炉冶炼；自动挑燃料，自动找熔炉（每 1 个约 10 秒） | 60s |
| `mc_attack` | 攻击敌对生物或指定实体；自动换武器、低血先吃东西、够不着不算挥击 | 30s |
| `mc_eat` | 吃食物回饥饿 | — |
| `mc_disconnect` | 断开机器人 | — |

设计原则：**不提供任意命令执行**（不能 `/op`、`/kick`、`/stop`）；每个工具都有硬超时；
失败一律返回结构化 `{ ok:false, error }`，让 Agent 自己改策略而不是卡死。

---

## 关键文件

| 路径 | 说明 |
|---|---|
| `run-server.sh` | 服务器 start / stop / restart / status / **cmd** / tail / **reset-world** |
| `run-daemon.sh` | **游戏内交互用的常驻机器人** start / stop / restart / status / logs |
| `run-agent.sh` | 一次性任务；`MC_PROFILE=` 可切换 stdio / HTTP 两种 profile |
| `tools/audit-report.py` | 把服务端审计日志渲染成可读的核对报告 |
| `bot/mcp-server.js` | 机器人 + 16 个 MCP 工具；`--http <port> [--ingame]` 进常驻模式 |
| `bot/http-transport.js` | streamable-http 传输 + `/health` `/say` `/whisper` 运维端点 |
| `bot/ingame.js` | **游戏内私聊交互**：串行队列 + DSH 会话记忆 + 私聊回复 |
| `bot/connect.js` | S1 连通性测试 |
| `bot/test-s2.js` | S2 MCP 协议层测试（8 项断言） |
| `bot/test-survival.js` | S4 完整生存链测试（19 项断言） |
| `bot/test-ingame.js` | S5 游戏内交互测试（5 项断言） |
| `bot/test-ingame-memory.js` | S6 真控制 + 对话记忆测试（9 项断言） |
| `bot/test-coop.js` | S7 双角色协同测试（7 项断言：互见/跟随/停止/过来/给东西） |
| `bot/probe-give3.js` | 受控探针：不给 LLM，直接验 mc_give 交付链路 |
| `bot/probe-pathfinder.js` | ⚠️ `pathfinder.stop()` 有毒的**最小复现** |
| `bot/probe-collect.js` / `probe-pickup.js` | 拾取链路、实体数据可信度探针 |
| `logs/mcp-audit.jsonl` | **服务端审计日志**：每次工具调用的入参与真实返回 |
| `logs/ingame-session.txt` | 游戏内对话的 DSH 会话号（决定了有没有记忆） |
| `logs/daemon.log` | 常驻 daemon 日志（含每条私聊的入队与回复记录） |
| `minecraft-server-26.1/` | 服务器目录（world / server.properties / console.log / server.in 控制台管道） |
| `~/.dsh/profiles/minecraft/cordis.patch.yml` | 一次性任务：stdio MCP（不改 DSH 源码、不动 web profile） |
| `~/.dsh/profiles/minecraft-ingame/cordis.patch.yml` | 游戏内交互：streamable-http MCP → 常驻 daemon（:8790） |
| `PLAN.md` / `recon.md` / `RESULTS.md` | 计划 / 环境事实快照 / 测试结果报告 |

---

## 配置要点

一次性任务 `~/.dsh/profiles/minecraft/cordis.patch.yml`：

```yaml
- insert:
    - id: minecraft-mcp
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: minecraft
        transport: stdio
        command: /opt/homebrew/bin/node
        args: [ /path/to/dsh-minecraft-agent/bot/mcp-server.js ]
        cwd: /path/to/dsh-minecraft-agent/bot
        toolCallTimeoutMs: 180000   # 必须 > mc_collect 的 45s，否则长任务被传输层掐断
        failOnStartupError: true
```

游戏内交互 `~/.dsh/profiles/minecraft-ingame/cordis.patch.yml`（差别只有 transport）：

```yaml
- insert:
    - id: minecraft-mcp
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: minecraft
        transport: streamable-http
        url: http://127.0.0.1:8790/mcp
        toolCallTimeoutMs: 180000
        failOnStartupError: true
```

两个 profile 都基于 `headless` 模板，权限预设收紧为 **`read-only`**（Minecraft 工具不需要文件写权限），
**完全不影响**你正在用的 `web` profile。

`web` profile 里也写入了 stdio 版配置（`failOnStartupError: false`，避免机器人挂掉连累 GUI 启动），
**但需要重启 `dsh web` 才生效**；原文件已备份为 `cordis.patch.yml.bak-before-minecraft-<时间戳>`。

---

## 排错

| 症状 | 原因 / 处理 |
|---|---|
| 私聊没反应 | 先 `./run-daemon.sh status` 看机器人是否在线；daemon 没跑就收不到私聊 |
| `EADDRINUSE ... 8790` | 端口被别的程序占了（本机 8766 被 `claude-sc*` 占用），用 `MC_MCP_PORT=xxxx ./run-daemon.sh start` 换端口，并同步改 `minecraft-ingame` profile 里的 `url` |
| 私聊回复很慢 | 一个 turn 要跑完整的 agent 循环（多次工具调用）。看 `logs/daemon.log` 的 `[ingame]` 行确认进度 |
| 私聊回复太长被截断 | 调大 `MC_INGAME_REPLY_CHARS`（默认 900） |
| 想限制谁能用 | `MC_INGAME_ALLOW=Steve,Alex ./run-daemon.sh start` |
| daemon 跑着时 `run-agent.sh` 机器人被踢 | 同名 `DeepSeekBot` 冲突。先 `./run-daemon.sh stop` |
| `does not provide an export named 'FiberState'` | `tsx` 丢失 tsconfig 路径映射。必须用 `./run-agent.sh`（它设了 `TSX_TSCONFIG_PATH`） |
| `MCP error -32001: Request timed out` | MCP client 超时太短。调大 profile 里的 `toolCallTimeoutMs` |
| 所有 `mc_goto` 突然报 `PathStopped` | 代码里有人调了 `bot.pathfinder.stop()` —— **它会把 pathfinder 永久打坏**，只能用 `setGoal(null)`。见 `bot/probe-pathfinder.js` |
| `mc_collect` 报 `nothing picked up` | 拾取半径只有约 1 格。本仓库已修（靠近到 1 格 + 主动捡）；仍复现请把审计日志里的 `failures` 拿出来 |
| 机器人卡在树上/掉落物拿不到 | `pickBlock` 已改为优先砍最近树里最低那一段 |
| 刚连上 `mc_scan` 返回 0 个方块 | 区块未加载完，已加 `waitForWorld` + 重试 |
| `Invalid itemType` | 混用了物品定义（`.id`）与背包物品（`.type`），本仓库已修 |
| 世界想回到干净状态 | `./run-server.sh reset-world`（已固定种子，地形可复现） |
| 端口被占用 | `lsof -ti :25565` 查；服务器只绑定 127.0.0.1 |

---

## 安全边界

- 服务器 `server-ip=127.0.0.1`，**仅本机可达**，不暴露到局域网/外网。
- `online-mode=false`（机器人免微软账号加入），因此**绝不要**把 `server-ip` 改成 `0.0.0.0`。
- 服务器控制台走**命名管道**（`server.in`），**未开启 RCON**，没有任何网络管理端口。
- daemon 的 MCP HTTP 服务与运维端点（`/health` `/say` `/whisper`）**只绑 127.0.0.1**。
- 游戏内私聊的文本会直接作为任务交给 Agent。本机单人服风险很低；多人服请用 `MC_INGAME_ALLOW` 限定玩家。
- 全程只操作 `./minecraft-server-26.1/world`，**不读写** `~/Library/Application Support/minecraft/saves` 里你的个人存档。
- 已接受 Mojang EULA（`eula.txt`，服务端启动必需）。
- Agent 侧权限预设为 `read-only`，它无法改你的文件系统。

---

## 关于本仓库（开源说明）

本仓库以 [MIT License](LICENSE) 开源。**只收录自研源码与文档**——开源整理时已排除 Mojang 专有二进制、运行态密钥、世界存档、日志与依赖，详见 [NOTICE.md](NOTICE.md)。

### 你没有拿到、需要自己准备的东西

| 缺少的路径 | 怎么补 |
|---|---|
| `minecraft-server-26.1/server.jar` | 从 Mojang 官方 `piston-data.mojang.com` 下载 26.1 服务端（SHA1 见 [recon.md](recon.md)） |
| `minecraft-server-26.1/server.properties` | `cp server.properties.example minecraft-server-26.1/server.properties` |
| `bot/node_modules/` | `cd bot && npm install`（`package-lock.json` 已锁定版本） |
| `logs/`、`build/cathedral/snapshots/`、`phase0-survey.json` | 运行脚本时自动生成 |
| `~/.dsh/profiles/minecraft*/cordis.patch.yml` | 按下方 README「配置要点」自建 |

### 路径占位符

开源整理时，文档里出现的本机绝对路径已统一替换：

- 原工作目录 → `/path/to/dsh-minecraft-agent`
- 原用户主目录 → `~`

请按你自己的实际路径替换后再执行命令。

### 文档中引用的日志文件

README 与 [build/CATHEDRAL-STATUS.md](build/CATHEDRAL-STATUS.md) 会引用 `logs/mcp-audit.jsonl`、`logs/cathedral-audit.jsonl` 等审计日志作为测试证据。这些日志**未随仓库分发**（属运行产物），在你本地跑完测试后会自行出现。

### 非官方声明

本项目**不是** DeepSeek 官方项目，也**未获** DeepSeek 或 Mojang/Microsoft 的赞助或背书。"DeepSeek"、"Minecraft" 均为其各自权利人的商标，此处仅在描述性意义上使用。详见 [NOTICE.md](NOTICE.md)。
