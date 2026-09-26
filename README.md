# DeepSeek Agent × Minecraft（Windows / macOS / Linux）

让 DeepSeek Harness 里的 Agent 通过 **MCP** 真实操作一个 Minecraft Java 机器人：
自己看世界、走过去、砍树挖矿、合成、放方块、开箱子、烧熔炉、打怪、吃东西，以及**受控的大规模批量建造**。

- 目标版本：**Minecraft Java 26.1**（当前 bot 库支持上限，原因见下）
- 机器人库：`mineflayer 4.39.0`（+ `mineflayer-pathfinder`）
- 接入方式：自研 MCP Server（**23 个工具**）→ DSH 原生 `@deepseek-ai/dsh-mcp-client`
- 服务器：本机专用服，只监听 `127.0.0.1`，`online-mode=false`，**不碰你的个人存档**
- **游戏内交互**：在聊天框敲 `/msg DeepSeekBot <内容>`，Agent 当场在游戏里执行并私聊回复你
- **双角色协同**：你用官方客户端进同一世界，DeepSeek 操控 `DeepSeekBot`，两人互见、可跟随、可交接物品
- 平台支持：**Windows（PowerShell）/ macOS / Linux（bash）** 两套启动脚本功能对等
- 测试结果：见 [RESULTS.md](RESULTS.md) —— S1 ✅ / S2 8-8 ✅ / S4 生存链 19-19 ✅ / S5 游戏内交互 5-5 ✅ / S6 控制+记忆 9-9 ✅ / **S7 双角色协同 7-7 ✅**

---

## 平台选择：用哪套脚本

| 平台 | 服务器 | 常驻机器人 | 一次性任务 | Java |
|---|---|---|---|---|
| **Windows** | `.\run-server.ps1` | `.\run-daemon.ps1` | `.\run-agent.ps1` | OpenJDK **25**（`tools\install-java-win.ps1` 可自动获取） |
| macOS / Linux | `./run-server.sh` | `./run-daemon.sh` | `./run-agent.sh` | JDK **25**，或用 Minecraft 自带 runtime |

两套脚本做的是同一件事，参数名、环境变量、日志路径全部一致，所以本文其余章节的命令在两边都成立——
只要把 `./run-server.sh start` 读成 `.\run-server.ps1 start`。

> Windows 侧不需要 WSL、不需要 Git Bash、不需要 MSYS2。原生 PowerShell 5.1（系统自带）即可。

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
                                      mineflayer 机器人 + 23 工具

【方式二】游戏内交互（机器人常驻在线）  ← run-daemon start
玩家: /msg DeepSeekBot 帮我砍树
   │
   ▼  mineflayer whisper 事件
bot/mcp-server.js --http 8790 --ingame   （常驻：持有机器人 + MCP HTTP + 私聊入口）
   │  ① 串行队列
   │  ② MC_PROFILE=minecraft-ingame run-agent --json --session-id <记住的会话>
   ▼
DSH agent ──streamable-http──▶ 同一个常驻 MCP 服务 ──▶ 机器人在世界里干活
   │
   ▼  ③ 结果用 bot.whisper 私聊回发起者
玩家 ← 「坐标 x=6.5, y=69, z=-2.5，背包 oak_log ×2」

公共设施：minecraft-server-26.1/  仅 127.0.0.1:25565，无 RCON；logs/mcp-audit.jsonl 记录每次工具调用
```

---

## 快速开始（Windows）

```powershell
cd D:\path\to\dsh-minecraft-agent

# 0) 一次性准备：确认 Node，装 bot 依赖，准备 Java 25
node --version                                  # 需要 >= 20
cd bot; npm install; cd ..                      # package-lock.json 已锁定版本

#    Java 25 是硬要求。先探测：若报“找不到 Java 25”，用下面脚本自动下载到项目内
.\run-server.ps1 java                            # 只探测并打印结果
.\tools\install-java-win.ps1                     # 下载 OpenJDK 25 到 .runtime\，不污染系统
.\tools\install-java-win.ps1 -UseSystem          # 或者：改用你已装好的 JDK 25

# 1) 起服务器（后台，就绪后自动返回）
.\run-server.ps1 start

# 2A) 【游戏内交互】起常驻机器人 daemon —— 之后在游戏聊天框里 /msg DeepSeekBot ...
.\run-daemon.ps1 start
.\run-daemon.ps1 status        # 看机器人是否在线、最近处理了什么
.\run-daemon.ps1 logs          # 跟随日志

# 2B) 【一次性任务】不开 daemon 也能用（机器人为这一次任务临时上线）
.\run-agent.ps1 "在 Minecraft 里采集 3 个原木，完成后报告坐标和背包"
.\run-agent.ps1 -Json "采集 4 个原木，做一个工作台并合成一把木镐"

# 3) 核对 Agent 有没有瞎说（服务端审计日志，模型无法伪造）
python .\tools\audit-report.py

# 4) 想造测试夹具 / 查在线玩家（走服务器 stdin，不开任何网络管理端口）
.\run-server.ps1 cmd "list"
.\run-server.ps1 cmd "give DeepSeekBot minecraft:cobblestone 8"

# 5) 收工
.\run-daemon.ps1 stop
.\run-server.ps1 stop
```

服务器目录首次使用前需要两个文件（都在仓库外准备）：

```powershell
New-Item -ItemType Directory -Force minecraft-server-26.1 | Out-Null
Copy-Item server.properties.example minecraft-server-26.1\server.properties
# server.jar：从 Mojang 官方下载 26.1 服务端（SHA1 见 recon.md）
```

### 快速开始（macOS / Linux）

```bash
cd /path/to/dsh-minecraft-agent
node --version
(cd bot && npm install)

./run-server.sh start
./run-daemon.sh start
./run-agent.sh "在 Minecraft 里采集 3 个原木，完成后报告坐标和背包"
python3 tools/audit-report.py
./run-daemon.sh stop && ./run-server.sh stop
```

> ⚠️ **同名冲突**：daemon 的机器人叫 `DeepSeekBot`。开着 daemon 时再跑一次性的 `run-agent`（也是 `DeepSeekBot`）会被服务端踢掉其中一个。二选一用。

### 单人验证（不花 LLM token）

```bash
node bot/connect.js              # S1：连通性 / 移动 / 挖掘
node bot/test-s2.js              # S2：MCP 协议层 + 工具（8 项断言）
node bot/test-survival.js        # S4：完整生存链（19 项断言）
node bot/test-p0-tools.js        # 批量建造工具（mc_fill / mc_scan_region / mc_batch_place）
node bot/test-ingame.js          # S5：游戏内私聊交互（5 项断言，需 daemon 在跑）
node bot/test-ingame-memory.js   # S6：真控制 + 对话记忆（9 项断言，需 daemon 在跑）
node bot/test-coop.js            # S7：双角色协同（7 项断言，需 daemon 在跑）
```

想亲自进游戏旁观：官方 Launcher → 安装 → 新建 **26.1** 版本 → 多人游戏连 `localhost`。
（`online-mode=false`，任何用户名都能进；仅本机可达。）

---

## Windows 专项说明

### Java 25

Minecraft 26.1 的服务端要求 **Java 25**（`majorVersion: 25`）。Windows 上常见的坑：

- 微软商店 / Oracle 装的 `javapath` 很可能是 **Java 8 或 24**，**跑不起来 26.1 服务端**。
- 装了 PCL2 / HMCL 之类启动器时，`.minecraft\runtime\` 通常**不存在**，借不到启动器自带的 JRE。

`run-server.ps1` 按下面顺序找 Java，并**校验主版本必须 >= 25**：

1. `-Java` 参数指定的路径
2. 环境变量 `MC_JAVA`
3. 环境变量 `JAVA_HOME`
4. `<仓库>\.runtime\` （`tools\install-java-win.ps1` 下载的）
5. `PATH` 上的 `java.exe`
6. 常见安装目录（`C:\Program Files\Java|Eclipse Adoptium|Microsoft\jdk|Zulu|Amazon Corretto` 等）
7. 注册表 `HKLM:\SOFTWARE\JavaSoft\JDK` 与 `JDK-64`

只看 `java -version` 不够——版本不对时会明确报错并告诉你怎么补：

```
找不到满足要求的 Java（需要主版本 >= 25）。
  已探测到：C:\Program Files\Common Files\Oracle\Java\javapath\java.exe -> 1.8.0_491
补法（任选其一）：
  .\tools\install-java-win.ps1                     # 下载 OpenJDK 25 到 <仓库>\.runtime\
  .\tools\install-java-win.ps1 -UseSystem          # 用你已装的 JDK 25
  $env:MC_JAVA = 'C:\path\to\jdk-25\bin\java.exe'  # 手动指定
```

`tools\install-java-win.ps1` 默认下载 **Microsoft Build of OpenJDK 25**（zip，解压即用，**不改系统 PATH、不改注册表、不写 Program Files**），落到 `<仓库>\.runtime\`，并生成 `java-path.txt` 供 `run-server.ps1` 读取。`-UseSystem` 则只做校验并把已装 JDK 登记进去。

### PowerShell 执行策略

脚本未做数字签名。如果双击被拦，用下列任一方式：

```powershell
# 方式 A（推荐，只对当前会话生效，最安全）
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\run-server.ps1 start

# 方式 B：逐个文件解锁（解除“来自 Internet”的标记）
Get-ChildItem *.ps1, tools\*.ps1 | Unblock-File

# 方式 C：不落盘直接跑
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-server.ps1 start
```

### 服务器控制台（Windows 没有 FIFO）

bash 版用 `mkfifo server.in` 把命令喂给服务端。Windows 没有命名管道文件，`run-server.ps1` 改为**常驻在后台作业里持有服务端进程的 stdin**：

- `.\run-server.ps1 start` 在后台作业中启动 `javaw.exe`，把 stdin 挂着；
- `.\run-server.ps1 cmd "list"` 往同一个作业里投递命令（通过命令队列文件 + 作业内轮询）；
- `.\run-server.ps1 tail` 读 `minecraft-server-26.1\console.log`。

对使用者来说三端命令完全一致，仍然**不打 RCON、不开任何网络管理端口**。

### 进程与端口

- 进程记录在 `minecraft-server-26.1\server.pid.json`（含 PID、启动时间、Java 路径），`stop` 靠它精确定位，不会误杀别的 `java.exe`。
- 端口占用用 `Get-NetTCPConnection -LocalPort 25565` 查。
- `run-daemon.ps1` 的日志在 `logs\daemon.log`（**UTF-8**），daemon 的 MCP 端口默认 8790。

### 编码

脚本、日志、控制台都是 **UTF-8**。若你的控制台看不到中文，执行一次 `chcp 65001`，或在 Windows Terminal 里把配置文件设为 UTF-8。

> ⚠️ **改脚本时请注意**：本仓库所有 `.ps1` 都存为 **UTF-8 with BOM**。
> Windows PowerShell 5.1 会把**没有 BOM** 的 `.ps1` 当作系统 ANSI 代码页（简中环境下是 GBK）读取，
> 于是文件里的中文全部变成乱码，脚本会直接**语法解析失败**。
> 用记事本 / VS Code 保存时请确认编码是 "UTF-8 with BOM"（VS Code 里选 `UTF-8 with BOM`，不是 `UTF-8`）。
> 校验方法：
>
> ```powershell
> $b = [System.IO.File]::ReadAllBytes('.\run-server.ps1')[0..2]
> "$b   # 239,187,191 = 有 BOM；否则需要补"
> ```

---

## Minecraft 工具清单（23 个）

### 感知
| 工具 | 作用 |
|---|---|
| `mc_status` | 坐标/血量/饥饿/维度/时间/背包/附近敌对生物/**队友坐标与距离**/跟随状态。首次调用自动连接 |
| `mc_scan` | 半径内查找若干种方块 + 附近实体类型统计（支持空数组只查实体） |
| `mc_scan_region` | **只读**：限定长方体区域内每种方块的计数与首个坐标，用于复核结构、对称与门洞 |

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
| `mc_fill` | **批量填充**（受控 `/fill`）：坐标须在 `build/site.json` 施工区内、方块须在白名单内、单条体积 ≤ 32768；`dryRun` 只校验不写入 | 30s |
| `mc_batch_place` | **批量建造**：一次最多 500 条操作，逐条对账，写审计日志 | — |
| `mc_allowed_blocks` | 查看 `mc_fill` / `mc_batch_place` 可用的方块白名单 | — |
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
批量建造走独立的受控通道（白名单 + 施工区 + 保护圈 + 逐条回执 + 审计），不是"给 Agent 开 `/fill`"。

---

## 大批量建造

`building.md` 是交给 Agent 的**通用**大型建造规范（阶段划分、坐标契约、审计顺序、每轮报告模板）。
它不绑定任何具体建筑：第 1、2 节留了占位符给你填自己的项目，第 3、4、5 节可直接沿用。

三步上手：

```powershell
# 1) 勘察并把施工区写进 build/site.json（仓库自带的是模板骨架，必须改）
notepad build\site.json

# 2) 让 Agent 先只读核对，再开始施工
.\run-agent.ps1 "读 building.md，先 mc_status 与 mc_scan_region 核对 build/site.json 里的施工区，报告你真实可用的建造工具，暂不动工"

# 3) 单批干跑 → 真跑
.\run-agent.ps1 "用 mc_fill 在施工区干跑一层地基（dryRun=true），把指令和体积报给我"
.\run-agent.ps1 "确认无误后真正执行这一层，然后 mc_scan_region 复核"
```

关键约束（都由服务端强制，模型绕不过）：

| 约束 | 在哪 | 行为 |
|---|---|---|
| 施工区 | `build/site.json` 的 `regions.work` | 任何一个角越界即整条拒绝 |
| 保护圈 | `build/site.json` 的 `protected[]` | 碰到既有作品即拒绝，并回传保护圈名字 |
| 材料白名单 | `bot/builder-core.js` 的 `ALLOWED_BLOCKS` + `site.json` 的 `extraAllowedBlocks` | 不在清单内直接拒绝 |
| 单条体积 | 硬编码 | > 32768 格拒绝（原版 `/fill` 上限） |
| 审计 | `logs/build-audit.jsonl` | 每条指令的入参 + 服务端原样回执 |
| 回滚 | `builder-core.js` 的 `snapshotRegion()` / `rollbackCommands()` | 写入前调色板快照，可生成反向 `/fill` 序列 |

---

## 关键文件

| 路径 | 说明 |
|---|---|
| `run-server.ps1` / `run-server.sh` | 服务器 start / stop / restart / status / **cmd** / tail / **reset-world** / **java** |
| `run-daemon.ps1` / `run-daemon.sh` | **游戏内交互用的常驻机器人** start / stop / restart / status / logs |
| `run-agent.ps1` / `run-agent.sh` | 一次性任务；`MC_PROFILE=` 可切换 stdio / HTTP 两种 profile |
| `tools/install-java-win.ps1` | **Windows**：下载/登记 OpenJDK 25 到 `<仓库>\.runtime\` |
| `tools/audit-report.py` | 把服务端审计日志渲染成可读的核对报告 |
| `bot/mcp-server.js` | 机器人 + 23 个 MCP 工具；`--http <port> [--ingame]` 进常驻模式 |
| `bot/builder-core.js` | **受控批量建造核心**：白名单 / 施工区 / 保护圈 / 快照回滚 / 审计 |
| `bot/http-transport.js` | streamable-http 传输 + `/health` `/say` `/whisper` 运维端点 |
| `bot/ingame.js` | **游戏内私聊交互**：串行队列 + DSH 会话记忆 + 私聊回复（跨平台调 `run-agent`） |
| `bot/connect.js` | S1 连通性测试 |
| `bot/test-s2.js` | S2 MCP 协议层测试（8 项断言） |
| `bot/test-survival.js` | S4 完整生存链测试（19 项断言） |
| `bot/test-p0-tools.js` | 批量建造工具测试（白名单 / 施工区 / 保护圈 / 体积 / dryRun） |
| `bot/test-ingame.js` | S5 游戏内交互测试（5 项断言） |
| `bot/test-ingame-memory.js` | S6 真控制 + 对话记忆测试（9 项断言） |
| `bot/test-coop.js` | S7 双角色协同测试（7 项断言：互见/跟随/停止/过来/给东西） |
| `bot/probe-give3.js` | 受控探针：不给 LLM，直接验 mc_give 交付链路 |
| `bot/probe-pathfinder.js` | ⚠️ `pathfinder.stop()` 有毒的**最小复现** |
| `bot/probe-collect.js` / `probe-pickup.js` | 拾取链路、实体数据可信度探针 |
| `build/site.json` | **施工区模板**：原点、可建范围、保护圈、追加白名单。必须按自己的世界改 |
| `building.md` | 交给 Agent 的**通用**大型建造规范 |
| `logs/mcp-audit.jsonl` | **服务端审计日志**：每次工具调用的入参与真实返回 |
| `logs/build-audit.jsonl` | **建造审计日志**：每条 `/fill` / `/setblock` 的入参与服务端回执 |
| `logs/ingame-session.txt` | 游戏内对话的 DSH 会话号（决定了有没有记忆） |
| `logs/daemon.log` | 常驻 daemon 日志（含每条私聊的入队与回复记录） |
| `minecraft-server-26.1/` | 服务器目录（world / server.properties / console.log / Windows 下另有 server.pid.json） |
| `~/.dsh/profiles/minecraft/cordis.patch.yml` | 一次性任务：stdio MCP（不改 DSH 源码、不动 web profile） |
| `~/.dsh/profiles/minecraft-ingame/cordis.patch.yml` | 游戏内交互：streamable-http MCP → 常驻 daemon（:8790） |
| `PLAN.md` / `recon.md` / `RESULTS.md` | 计划 / 环境事实快照 / 测试结果报告 |

---

## 配置要点

先把两个 profile 建出来。**注意 DSH 的机制**（0.1.5-rc.3 实测，`dsh --help`）：

- profile 不是"复制 headless 目录"来的，而是 **`dsh --from-default-profile <模板>` 首次使用时自动创建**；
  内置模板有 `acp` / `web` / `headless` / `sdk` / `sdk-minimal`。
- 每个 profile 的 `package.json` 里 `dsh.profile.bundles` 决定**装载哪几个 bundle**；
  `cordis.patch.yml` 是用户层，用来 `insert` 插件行。
- `@deepseek-ai/dsh-mcp-client` **不是 bundle**，它是普通插件，必须通过 `insert` 行引入。

Windows：

```powershell
# 1) 用 headless 模板建 profile（会自动生成 package.json / cordis.yml / cordis.patch.yml / pnpm-workspace.yaml）
#    只想建不跑任务的话，随便给它一个 task 再 Ctrl+C 也行；或者直接建目录后手抄下面的文件
dsh --profile minecraft --from-default-profile headless "warm up"

# 2) 编辑 ~\.dsh\profiles\minecraft\cordis.patch.yml，写入 MCP 接入
notepad "$env:USERPROFILE\.dsh\profiles\minecraft\cordis.patch.yml"
```

`~/.dsh/profiles/minecraft/cordis.patch.yml`（一次性任务，stdio）：

```yaml
- insert:
    - id: minecraft-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: minecraft
        transport: stdio
        command: 'C:\Program Files\nodejs\node.exe'   # node 绝对路径
        args:
          - 'D:\HI\CODE\DSH\MC\ORI\bot\mcp-server.js'
        cwd: 'D:\HI\CODE\DSH\MC\ORI\bot'
        toolCallTimeoutMs: 180000   # 必须 > mc_collect 的 45s，否则长任务被传输层掐断
        failOnStartupError: true
```

`~/.dsh/profiles/minecraft-ingame/cordis.patch.yml`（游戏内交互，差别只有 transport）：

```yaml
- insert:
    - id: minecraft-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: minecraft
        transport: streamable-http
        url: http://127.0.0.1:8790/mcp
        toolCallTimeoutMs: 180000
        failOnStartupError: false
```

`web` profile 里也写入了 stdio 版（`failOnStartupError: false`），这样你在本 GUI 会话里
也能直接调用 `mcp__minecraft__mc_*`。原文件已备份为 `cordis.patch.yml.bak-before-minecraft-<时间戳>`，
删掉那一段即可完全回退。`web` 的 `patchReload` 是 `live`，改完通常**无需重启**；
若工具没出现，再重启 `dsh web`。

### 三个必须注意的坑（都实测过）

**1. 顶层用 block 序列，不要用 `[ ... ]`**

YAML 的 flow 序列（`[` 开头）里 **`#` 不是注释**。中文注释写在条目之间会把解析搞崩：

```
Error: dsh: failed to parse overlay .../cordis.patch.yml:
  YAMLException: missed comma between flow collection entries
```

**2. Windows 路径要加引号**

路径里含空格（`C:\Program Files\...`）必须用单引号包住；或者用正斜杠。
**不要用双引号**——`"C:\tools\node\node.exe"` 里的 `\n`、`\t` 会被当转义字符。

**3. 验证而不启动**

```powershell
dsh --profile minecraft --dump-config     # 组合校验：能看到 minecraft-mcp 行 = 配置生效
```

权限预设：`headless` 模板本身不含文件写工具，Minecraft 工具也不需要文件写权限，
所以这两个 profile **不会**让 Agent 碰你的文件系统；`web` profile 保持你原来的设置不变。

---

## 与旧版 DSH 的差异（重要）

本项目最初是在 **DSH 源码 checkout（0.1.6-alpha.2）** 上开发的，那里的 headless 支持
`--json`（NDJSON 事件流）与 `--session-id`（续接会话）。**`npm i -g @deepseek-ai/dsh`
装出来的 0.1.5-rc.3 两者都没有**：

```
$ dsh --profile minecraft --help
Usage: dsh --profile headless [options] [task...]
Options:
  -h, --help  show this help
```

| 能力 | 源码 checkout 0.1.6-alpha.2 | npm 全局 0.1.5-rc.3 |
|---|---|---|
| 一次性任务 | ✅ | ✅ |
| `--json` NDJSON 事件流 | ✅ | ❌ `unknown option '--json'` |
| `--session-id` 续接会话 | ✅ | ❌ `unknown option '--session-id'` |
| `--resume` | — | ❌（`dsh --help` 的示例里有，但实际不支持） |
| MCP 接入 | ✅ | ✅ |

**结论**：
- **一次性任务（`run-agent`）在两种版本上都能用** —— 最终回答直接走 stdout。
- **游戏内 `/msg` 私聊目前只能在源码 checkout 上实现"对话记忆"**：`bot/ingame.js` 依赖
  `--json` + `--session-id`。在 0.1.5-rc.3 上这两个参数会让 harness 立刻以
  `unknown option` 退出，所以 daemon 的每个 turn 都会失败。
  这是**已知限制**，不是配置错误。详见 [PLAN.md](PLAN.md) §9.5。

---

## 环境变量一览

两套脚本读同一组变量，名字完全一致。

| 变量 | 默认 | 说明 |
|---|---|---|
| `MC_JAVA` | 自动探测 | Java 25 的 `java.exe` / `java` 绝对路径 |
| `MC_MEM` | `2G` | 服务端最大堆（`-Xmx`） |
| `MC_PORT` | `25565` | bot 连接的服务器端口（也是 `server.properties` 的 `server-port`） |
| `MC_HOST` | `127.0.0.1` | bot 连接的地址 |
| `MC_USER` | `DeepSeekBot` | 机器人用户名 |
| `MC_VERSION` | `26.1` | 协议版本 |
| `MC_MCP_PORT` | `8790` | daemon 的 MCP HTTP 端口 |
| `MC_PROFILE` | `minecraft` | `run-agent` 用的 DSH profile（daemon 内部用 `minecraft-ingame`） |
| `MC_SITE_FILE` | `build/site.json` | 施工区定义文件 |
| `MC_BUILD_AUDIT` | `logs/build-audit.jsonl` | 建造审计日志路径 |
| `MC_AUDIT_LOG` | `logs/mcp-audit.jsonl` | MCP 工具调用审计日志路径 |
| `DSH_REPO` | `~/deepseek-harness` | DSH 仓库位置；Windows 上请显式设成你的实际路径 |

---

## 排错

| 症状 | 原因 / 处理 |
|---|---|
| 私聊没反应 | 先 `run-daemon status` 看机器人是否在线；daemon 没跑就收不到私聊 |
| `EADDRINUSE ... 8790` | 端口被别的程序占了（本机 8766 被 `claude-sc*` 占用），用 `MC_MCP_PORT=xxxx` 换端口，并同步改 `minecraft-ingame` profile 里的 `url` |
| Windows：`无法加载文件 ... 因为在此系统上禁止运行脚本` | 执行策略拦截。见上文「PowerShell 执行策略」 |
| Windows：`找不到满足要求的 Java` | 装 JDK 25，或跑 `tools\install-java-win.ps1`。本机只有 JDK 24 / JRE 8 时**跑不起来 26.1** |
| Windows：服务端起来了但 `cmd` 没反应 | 确认 `start` 时没有报错、`server.pid.json` 存在；`restart` 会重建控制台通道 |
| Windows：`Get-NetTCPConnection` 说 25565 被占 | `Get-Process -Id (Get-NetTCPConnection -LocalPort 25565).OwningProcess` 看是谁 |
| 私聊回复很慢 | 一个 turn 要跑完整的 agent 循环（多次工具调用）。看 `logs/daemon.log` 的 `[ingame]` 行确认进度 |
| 私聊回复太长被截断 | 调大 `MC_INGAME_REPLY_CHARS`（默认 900） |
| 想限制谁能用 | `MC_INGAME_ALLOW=Steve,Alex run-daemon start` |
| daemon 跑着时 `run-agent` 机器人被踢 | 同名 `DeepSeekBot` 冲突。先 `run-daemon stop` |
| `does not provide an export named 'FiberState'` | `tsx` 丢失 tsconfig 路径映射。必须用 `run-agent`（它设了 `TSX_TSCONFIG_PATH`） |
| `MCP error -32001: Request timed out` | MCP client 超时太短。调大 profile 里的 `toolCallTimeoutMs` |
| 所有 `mc_goto` 突然报 `PathStopped` | 代码里有人调了 `bot.pathfinder.stop()` —— **它会把 pathfinder 永久打坏**，只能用 `setGoal(null)`。见 `bot/probe-pathfinder.js` |
| `mc_collect` 报 `nothing picked up` | 拾取半径只有约 1 格。本仓库已修（靠近到 1 格 + 主动捡）；仍复现请把审计日志里的 `failures` 拿出来 |
| `mc_fill` 报 `方块不在白名单` | 该方块不在默认清单里。加进 `build/site.json` 的 `extraAllowedBlocks` |
| `mc_fill` 报 `超出施工区` / `落在保护圈内` | 坐标不在 `build/site.json` 的 `regions.work` 内，或碰到了 `protected[]`。改坐标或改 site.json |
| `mc_fill` 报 `体积 > 32768` | 按层或按分区切块，用 `mc_batch_place` 一次提交多条 |
| 机器人卡在树上/掉落物拿不到 | `pickBlock` 已改为优先砍最近树里最低那一段 |
| 刚连上 `mc_scan` 返回 0 个方块 | 区块未加载完，已加 `waitForWorld` + 重试 |
| `Invalid itemType` | 混用了物品定义（`.id`）与背包物品（`.type`），本仓库已修 |
| 世界想回到干净状态 | `run-server reset-world`（已固定种子，地形可复现） |

---

## 安全边界

- 服务器 `server-ip=127.0.0.1`，**仅本机可达**，不暴露到局域网/外网。
- `online-mode=false`（机器人免微软账号加入），因此**绝不要**把 `server-ip` 改成 `0.0.0.0`。
- 服务器控制台走**本机进程 stdin**（macOS/Linux 为命名管道 `server.in`，Windows 为后台作业持有的 stdin），**未开启 RCON**，没有任何网络管理端口。
- daemon 的 MCP HTTP 服务与运维端点（`/health` `/say` `/whisper`）**只绑 127.0.0.1**。
- 批量建造只走 `mc_fill` / `mc_batch_place`，全部经过施工区、保护圈、材料白名单与体积校验，**不是**给 Agent 开放任意 `/command`。
- 游戏内私聊的文本会直接作为任务交给 Agent。本机单人服风险很低；多人服请用 `MC_INGAME_ALLOW` 限定玩家。
- 全程只操作 `./minecraft-server-26.1/world`，**不读写**你的个人存档（Windows 为 `%APPDATA%\.minecraft\saves`）。
- 已接受 Mojang EULA（`eula.txt`，服务端启动必需）。
- Agent 侧权限预设为 `read-only`，它无法改你的文件系统。

---

## 关于本仓库（开源说明）

本仓库以 [MIT License](LICENSE) 开源。**只收录自研源码与文档**——开源整理时已排除 Mojang 专有二进制、运行态密钥、世界存档、日志与依赖，详见 [NOTICE.md](NOTICE.md)。

### 你没有拿到、需要自己准备的东西

| 缺少的路径 | 怎么补 |
|---|---|
| `minecraft-server-26.1/server.jar` | 从 Mojang 官方 `piston-data.mojang.com` 下载 26.1 服务端（SHA1 见 [recon.md](recon.md)） |
| `minecraft-server-26.1/server.properties` | `cp server.properties.example minecraft-server-26.1/server.properties`（Windows：`Copy-Item`） |
| `bot/node_modules/` | `cd bot && npm install`（`package-lock.json` 已锁定版本） |
| JDK 25（Windows 无自带 runtime） | `.\tools\install-java-win.ps1` |
| `logs/`、`build/snapshots/`、`.runtime/` | 运行脚本时自动生成 |
| `~/.dsh/profiles/minecraft*/cordis.patch.yml` | 按下方 README「配置要点」自建 |

### 路径占位符

开源整理时，文档里出现的本机绝对路径已统一替换：

- 原工作目录 → `/path/to/dsh-minecraft-agent`
- 原用户主目录 → `~`

请按你自己的实际路径替换后再执行命令。

### 文档中引用的日志文件

README 会引用 `logs/mcp-audit.jsonl`、`logs/build-audit.jsonl` 等审计日志作为测试证据。这些日志**未随仓库分发**（属运行产物），在你本地跑完测试后会自行出现。

### 非官方声明

本项目**不是** DeepSeek 官方项目，也**未获** DeepSeek 或 Mojang/Microsoft 的赞助或背书。"DeepSeek"、"Minecraft" 均为其各自权利人的商标，此处仅在描述性意义上使用。详见 [NOTICE.md](NOTICE.md)。
