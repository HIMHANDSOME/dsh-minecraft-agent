# 把 DeepSeek Agent 接入 Minecraft（macOS）— 整体计划 v1（待审阅）

> 状态：**未执行**。审阅通过后按阶段执行；每阶段有验收门槛，遇到问题立即停下来问你。
> 工作目录：`/path/to/dsh-minecraft-agent`

---

## 0. 目标与验收标准

**目标**：让 DeepSeek Agent（运行在 DSH 里）能够通过工具调用，在一个本机 Minecraft Java 世界里真实地"感知 + 行动"。

**最终验收（烟雾测试全绿）**

| 编号 | 测试 | 通过标准 |
|---|---|---|
| S1 | 机器人连通性（无 LLM） | 脚本让机器人连上本机服务器，出生点坐标非零、能移动、能破坏/拾取方块 |
| S2 | MCP 协议层 | 用裸 MCP 客户端 `tools/list` 拿到工具表，`mc_status` 返回真实游戏状态 |
| S3 | 端到端（DeepSeek） | 一句自然语言指令（如"砍一棵树并报告背包"）→ Agent 自主调用工具 → 游戏内产生真实变化，输出可核对的证据 |
| S4 | （可选）Web GUI 同款工具 | 你在当前 GUI 会话里也能直接指挥机器人 |

---

## 1. 已核实的环境事实

| 项 | 值 |
|---|---|
| 系统 | macOS 26.6.2 (arm64)，Homebrew 6.0.9 |
| Node / npm / pnpm | v25.9.0 / 11.12.1 / 11.7.0 |
| Python / git | 3.13.13 / 2.54.0 |
| 系统 Java | **无**（`java` 不在 PATH） |
| Minecraft 自带 Java | **OpenJDK 25.0.1**（Microsoft build，位于 `~/Library/Application Support/minecraft/runtime/java-runtime-epsilon/mac-os-arm64/.../jre.bundle/Contents/Home/bin/java`） |
| Minecraft 已装版本 | **26.2**（完整）、26.3-snapshot-9/10、26.3-rc-2 |
| Mojang 最新正式版 | **26.3**（26.4-snapshot-1 为快照） |
| MC 26.x 所需 Java | majorVersion = **25**（自带 JRE 正好匹配） |
| DSH | `~/deepseek-harness`，v0.1.6-alpha.2，everything-is-a-plugin（Cordis） |
| DSH profiles | `~/.dsh/profiles/{web,headless}`，用户覆盖层 = `cordis.patch.yml` |
| 当前运行中 | `dsh web` 进程 PID 19987，GUI 在 `127.0.0.1:3080`（PID 13591 也占用 3080，需留意） |
| DSH MCP 能力 | 有原生插件 `@deepseek-ai/dsh-mcp-client`（stdio / streamable-http），工具公开名为 `mcp__<server>__<tool>` |

---

## 2. 关键技术结论（决定方案走向）

### 2.1 版本天花板 = 26.1（硬约束，已实测）

我实际安装了候选库并读取其支持列表，而不是只看文档：

- `mineflayer@4.39.0` + `minecraft-data@3.117.0` → 支持 72 个版本，最后一个正式版本是 **26.1**；`supportedVersions` 包含 26.2 判定为 **false**。
- `minecraft-data` 的 **git master 也只到 26.1**（无 26.2 数据）。
- Rust 生态的 `azalea`（azalea 是 `minecraft-mcp-rs` 的底层）最新版是 **0.16.0+mc26.1**，同样卡在 26.1。

**结论**：目前没有任何成熟 bot 库会说 26.2 / 26.3 的协议。你本机装的正式版是 26.2，最新正式版是 26.3 —— 因此"直接用现有客户端版本 + mineflayer"这条路**走不通**，必须做一次版本取舍。

### 2.2 五条技术路线对比

| # | 路线 | 原理 | 支持 26.2/26.3？ | 成熟度 | 工作量 | 评价 |
|---|---|---|---|---|---|---|
| A | **mineflayer + MCP** | Node 机器人库直连服务器，封装成 MCP 工具给 DSH | 否，最高 26.1 | 极高（PrismarineJS 生态、文档/示例最多） | 中 | **推荐**：最稳、最可审计、机器人能力最完整 |
| B | Fabric + Carpet 假人 + RCON | 服务端 mod 生成假玩家，Agent 用 RCON 发 `/execute` 指令 | 是 | 中（不需要协议库） | 中高 | 备选：能留在 26.2/26.3，但"感知"很弱（只能靠命令查询方块/实体），控制粒度粗 |
| C | 自研 Fabric mod + HTTP bridge | 写一个 mod 暴露 HTTP API | 是 | 低（要 Gradle + JDK25 + mod 开发） | 高 | 不推荐做烟雾测试起步 |
| D | 修补 minecraft-data 到 26.2 | 自己对齐协议差异 | 理论可以 | 很低（协议/数据生成未支持，漂移即崩） | 高 | 不推荐 |
| E | 纯独立脚本（DeepSeek API + mineflayer 工具循环） | 不经过 DSH | 否，同样受 26.1 限制 | 高 | 低 | 适合当"最小可跑"对照件，但不算"接入 DSH" |

> 已调研的现成/相关项目：[PrismarineJS/mineflayer](https://github.com/PrismarineJS/mineflayer)、[mineflayer#3893（26.1.2 支持 issue）](https://github.com/PrismarineJS/mineflayer/issues/3893)、[yuniko-software/minecraft-mcp-server](https://github.com/yuniko-software/minecraft-mcp-server)（`minecraft-mcp-server@1.2.0`，mineflayer 系）、`maicraft@1.10.6`（mineflayer 系）、`@fundamentallabs/minecraft-mcp@0.2.21`、`minecraft-mcp-rs@1.4.3`（azalea 系，有 darwin-arm64 预编译）、[dsh-mcp-mgr@0.2.0](https://github.com/yangfch3/dsh-mcp-mgr)（DSH 社区 MCP 管理器）。

### 2.3 推荐路线：A（26.1 专用服务器 + mineflayer + DSH 原生 MCP）

理由：
1. **唯一"全链路官方支持"的组合**：26.1 服务器 ↔ mineflayer 4.39.0 ↔ MCP ↔ DSH MCP client，每一层都不需要打补丁。
2. **DSH 接入方式是原生机制**：`@deepseek-ai/dsh-mcp-client` 就是为这个场景设计的，只需在 profile 的 `cordis.patch.yml` 里 `insert` 一条配置，**不需要改 DSH 源码**。
3. **不污染你正在用的环境**：新建一个 `minecraft` profile，`web` profile 一行都不动，你当前的 GUI 会话不受影响。
4. **烟雾测试可分层验证**：机器人层、协议层、LLM 层分别可单独判定，出问题能立刻定位是哪一层。

---

## 3. 目标架构

```
┌──────────────────────────────────────────────────────────────┐
│ 你（可选）: Minecraft Launcher 26.1 客户端 ──┐                │
└──────────────────────────────────────────────┼───────────────┘
                                               │ LAN 127.0.0.1:25565
┌──────────────────────────────────────────────▼───────────────┐
│ 本机专用服务器 minecraft-server-26.1/ (vanilla server.jar)    │
│ online-mode=false, server-ip=127.0.0.1, spawn-protection=0    │
└──────────────────────────────────────────────▲───────────────┘
                                               │ 协议 26.1
┌──────────────────────────────────────────────┴───────────────┐
│ bot/  Node 进程 = Minecraft MCP Server                        │
│  mineflayer 4.39.0 + mineflayer-pathfinder 2.4.5              │
│  工具: mc_status / mc_goto / mc_dig / mc_collect / mc_place … │
│  传输: stdio (MCP)                                            │
└──────────────────────────────────────────────▲───────────────┘
                                               │ stdio
┌──────────────────────────────────────────────┴───────────────┐
│ DSH profile "minecraft"                                       │
│  @deepseek-ai/dsh-mcp-client (insert 到 cordis.patch.yml)     │
│  → DeepSeek Agent 看到 mcp__minecraft__* 工具                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. 分阶段执行计划

### P0 — 预检与冻结（约 5 分钟，只读）
- 复核环境事实、确认 26.1 server.jar 的下载地址与 SHA1、确认自带 JRE 25 能启动服务端。
- 产出：`recon.md`（事实快照，便于回滚定位）。
- 门槛：所有事实与你批准的选择一致。

### P1 — 部署 26.1 专用服务器
- 新建 `minecraft-server-26.1/`，从 Mojang 官方 `piston-data` 下载 `server.jar`（60.4 MB），**校验 SHA1**。
- 生成 `eula.txt`（`eula=true`，**需你明确同意**）与 `server.properties`：
  - `online-mode=false`（机器人无需微软账号即可加入）
  - `server-ip=127.0.0.1`（**只监听本机，不对外网开放**）
  - `server-port=25565`、`spawn-protection=0`（否则出生点附近无法挖建）
  - `gamemode=survival`、`difficulty=normal`、`view-distance=8`、`max-players=5`
- 用自带 JRE 25 以 `-Xmx2G` 启动，等待日志出现 `Done (…)!`。
  - 回退方案：`brew install openjdk@25`（若 jlink 版 JRE 缺模块）。
- 门槛：服务器 `Done`，`mc=` 端口可连，控制台可执行 `list`。

### P2 — 机器人运行时（无 LLM）
- 新建 `bot/`：`npm i mineflayer@4.39.0 minecraft-data@3.117.0 mineflayer-pathfinder@2.4.5 @modelcontextprotocol/sdk@1.30.0`
- `connect.js`：offline 模式以 `DeepSeekBot` 加入，输出 spawn 事件、坐标、血量、维度。
- 门槛：S1 通过（出生 + 移动 + 挖一个方块 + 背包出现物品）。

### P3 — Minecraft MCP Server
- `mcp-server.js`：stdio 传输，工具集（最小可用、行为可预测）：

| 工具 | 作用 |
|---|---|
| `mc_status` | 坐标/血量/饥饿/维度/时间/背包/附近实体与玩家（只读） |
| `mc_chat` | 发言 / 读取最近聊天 |
| `mc_look_at` | 看向坐标或实体 |
| `mc_goto` | pathfinder 走到坐标（带超时与失败回报） |
| `mc_dig` | 破坏指定坐标或最近的某类方块 |
| `mc_collect` | 找最近的目标方块 → 走过去 → 挖 → 拾取 |
| `mc_place` | 放置方块 |
| `mc_inventory` | 列出/装备/丢弃物品 |
| `mc_wait` | 等待若干秒（让物理/世界状态收敛） |

- 工程约束：每个工具都有硬超时、连接断开时返回结构化错误而不是挂死、限制单次调用影响范围（不会误踢玩家/刷屏）。
- 门槛：S2 通过。

### P4 — 接入 DSH（新建独立 profile，不动 web）
- 复制 `~/.dsh/profiles/headless` → `~/.dsh/profiles/minecraft`。
- 在其 `cordis.patch.yml` 追加：
  ```yaml
  - insert:
      - id: minecraft-mcp
        name: '@deepseek-ai/dsh-mcp-client'
        config:
          serverName: minecraft
          transport: stdio
          command: <绝对路径 node>
          args: [<绝对路径>/bot/mcp-server.js]
          cwd: <绝对路径>/bot
          toolCallTimeoutMs: 60000
          failOnStartupError: true
  ```
- 验证：`pnpm dsh --profile minecraft --dump-config` 中能看到该条目；启动后工具名出现 `mcp__minecraft__mc_status`。
- 门槛：DSH 成功挂载 MCP，无启动报错。

### P5 — 烟雾测试
- S1（P2 已做）→ S2（P3 已做）→ **S3 端到端**：
  `pnpm dsh --profile minecraft "在 Minecraft 里收集 1 个原木，然后报告你的坐标和背包"`
  - 通过标准：Agent 自主调用工具 ≥2 次，游戏内世界真实改变，最终回答中的坐标/物品与服务器日志一致（我会用独立方式复核，不采信 Agent 自述）。
  - 成本控制：S3 只跑 1 个短目标，限制最大轮数，避免无意义烧 token。
- 门槛：S1/S2/S3 全绿；S4（web profile 同款）按你的选择决定做或不做。

### P6 — 交付与可复现
- `README.md`：一键启动/停止脚本（`run-server.sh`、`run-bot.sh`）、端口与安全说明、常见故障处理。
- 明确记录"26.2/26.3 支持后如何升级"的路径。

---

## 5. 风险与回退

| 风险 | 影响 | 缓解 / 回退 |
|---|---|---|
| 自带 JRE 是 jlink 裁剪镜像，跑服务端缺模块 | P1 启动失败 | 立刻回退 `brew install openjdk@25`（Temurin/OpenJDK 全量 JDK） |
| 26.1 在 minecraft-data 里较新，个别包字段可能有偏差 | 机器人异常/断连 | 回退到 1.21.11（生态验证最充分）只改服务器版本与客户端 profile |
| 你的正式版是 26.2，需装 26.1 客户端才能亲自进服 | 你无法旁观/同玩 | 在 Launcher 新建 26.1 安装（几步点击）；或本轮只跑机器人不联机 |
| DSH 是 alpha 预览版，profile 机制可能变 | P4 挂载失败 | 改用 `--patch` 单次覆盖层（不改任何 profile），或退到路线 E 独立脚本 |
| 机器人被赋予"行动自由" | 误破坏你的存档 | 用**全新独立服务器目录**，隔离你的 `saves/`；不碰现有世界 |
| LLM 多轮循环烧 token | 成本 | 只用 `headless` 短任务，设最大轮数与超时 |

**隔离保证**：全程在 `/path/to/dsh-minecraft-agent/` 新建独立服务器与全新世界，**绝不读写** `~/Library/Application Support/minecraft/saves` 里你已有的存档；不改 DSH 源码；`web` profile 不改（除非你选 S4）。

---

## 6. 需要你拍板的 4 个决策

1. **版本路线**：A（26.1 独立服务器 + mineflayer，推荐）／B（留在 26.2/26.3 走 Fabric+Carpet+RCON）／E（先只做最简脚本验证）。
2. **接入面**：新建 `minecraft` profile（推荐，零影响）／直接加进 `web` profile 并重启你的 GUI（当前会话会中断）／两者都做。
3. **MCP Server 来源**：自研薄封装（推荐，9 个工具、可审计）／直接用现成包 `minecraft-mcp-server@1.2.0`（快，但第三方、能力不可控）。
4. **合规与安全确认**：同意接受 Mojang EULA（服务端首次启动必须）、`online-mode=false`、仅绑定 `127.0.0.1`；以及你是否要装 26.1 客户端亲自进服。

---

## 7. 执行顺序与暂停点

```
P0 预检 ──▶ P1 服务器 ──▶ P2 机器人 ──▶ P3 MCP ──▶ P4 DSH 接入 ──▶ P5 烟雾测试 ──▶ P6 交付
   ▲            ▲              ▲            ▲             ▲
   └────────────┴──────────────┴────────────┴─────────────┘
              任一阶段失败、或需要新决策 → 立即停下来问你
```

---

# 增量 P7（追加需求）：游戏内 `/deepseek` 交互对话控制

**追加需求**：在游戏内用 `/deepseek ` 进行交互对话控制。

## 7.1 硬约束（先说清楚）

斜杠命令**必须由服务端注册**，原版服务端收到 `/deepseek` 只会回 `Unknown command`，客户端侧无法拦截。

实测可行的两条路：
- **Paper 26.1.2 build 74（STABLE）** + 自写插件 —— 自带 runtime 里**有完整 `javac`(JDK 25)**，可直接编译，无需 Gradle/Loom
- **Fabric 26.1**（Fabric API 0.155.3+26.1.2 在）—— 但 mod 需要 Gradle + Loom + 映射重写，明显更重

**你的选择：不换服务端**，改用 `/msg DeepSeekBot <内容>`。回复**只私发给发起者**。

## 7.2 架构

```
玩家 /msg DeepSeekBot 帮我砍树
   │
   ▼ mineflayer whisper 事件
run-daemon.sh → mcp-server.js --http 8790 --ingame   （常驻：机器人不掉线 + MCP HTTP + 私聊入口）
   │ ① 串行队列 ② 会话记忆 ③ 私聊回复
   ▼
run-agent.sh（MC_PROFILE=minecraft-ingame）──streamable-http──▶ 同一个常驻 MCP 服务
```

## 7.3 阶段与验收

| 阶段 | 内容 | 验收 |
|---|---|---|
| P7.1 | `mcp-server.js` 重构为 `buildServer()` 工厂 + `--http/--ingame` 常驻模式 | 原 stdio 路径回归 8/8（R1） |
| P7.2 | `http-transport.js`：streamable-http + `/health` `/say` `/whisper` | daemon `/health` 返回 `connected:true` |
| P7.3 | `ingame.js`：串行队列 + DSH 会话记忆 + 私聊分片回复 | S5 5/5 |
| P7.4 | 真控制 + 记忆验证 | S6 9/9（同 session id + 0 次工具调用复述上一轮） |
| P7.5 | 硬约束"不污染公共聊天" | `MC_NO_PUBLIC_CHAT=1`，`mc_chat` 发言返回结构化错误 |

## 7.4 已知边界

- daemon 与一次性 `run-agent.sh` 都用 `DeepSeekBot` 这个名字，**不能同时跑**（会被服务端踢）
- 玩家私聊文本会直接成为 agent 任务；多人服请用 `MC_INGAME_ALLOW` 限定
- 单条 turn 串行，队列上限 10

---

# 增量 P8（追加需求）：双角色协同（你一个角色，DeepSeek 一个角色）

**追加需求**：用户自己操控一名角色，DeepSeek 操控另一名角色进入同一个世界。

## 8.1 结论：架构已支持，唯一门槛是客户端版本

服务器 `online-mode=false` + 仅绑 `127.0.0.1`，任何客户端连 `localhost` 就是独立玩家。`mc_status` 本来就返回 `otherPlayers`。
**但服务器是 26.1，用户 launcher 里是 26.2，协议不兼容连不上** → 需要用户自己装一个 26.1 客户端安装（用户选择自己操作，不动其 launcher 目录）。

## 8.2 新增的 3 个协同工具

| 工具 | 说明 |
|---|---|
| `mc_follow` | `start`/`stop`/`status`。常驻后台跟随循环，`manager.busy` 机制保证它让路给其它工具调用 |
| `mc_goto_player` | 走到指定玩家身边（一次性） |
| `mc_give` | 贴到约 1 格 → **垂直丢下** → 用掉落物实体到玩家的真实距离校验 → 太远则捡回重试 |

`mc_status.otherPlayers` 增强为带 `visible/position/distance`，`mc_status.following` 暴露跟随状态。

## 8.3 验收

| 阶段 | 验收 |
|---|---|
| P8.1 三工具实现 | 工具数 16 → 19，HTTP/stdio 双通道都可见 |
| P8.2 交付可靠性 | 受控探针 `probe-give3.js`：`itemToPlayerDistance 0.9`、玩家背包 `[] → oak_log:3` |
| P8.3 端到端 | S7 双角色协同 **7/7**：互见 / 跟随 1.0 格 / 停止 / 过来 0.0 格 / 给东西成功 |
| P8.4 回归 | R2：S2 8/8、S5 5/5 未被破坏 |

---

# 增量 P9（追加需求）：去项目化 + Windows 原生支持

**追加需求**：把某一次具体建筑工程（山地哥特大教堂）的专属内容全部移除，只保留通用的 Agent + MCP 建造骨架；并新增原生 Windows（PowerShell + 本机 JDK 25）支持。

## 9.1 去项目化（把一次性工程还原成通用骨架）

| 处理 | 对象 |
|---|---|
| **删除** | `build/cathedral/**`（41 个阶段脚本 + 40 个断点 + `verify/layout/tower/vault/pier/eastend/survey/drive.sh`）、`build/CATHEDRAL-STATUS.md` |
| **改为通用模板** | `build/site.json`（原点 / 施工区 / 保护圈 / 追加白名单，全部改成占位模板） |
| **重写为通用规范** | `building.md`：保留「能力清点 → 坐标契约 → 分区 → 结构剖面 → 阶段路线 → 审计顺序 → 每轮报告模板 → 审计与回滚」，删除全部哥特形制（双塔 / 中殿 / 飞扶壁 / 玫瑰窗 / 地下墓室 / 管风琴…）与专属尺寸 |
| **泛化** | `bot/builder-core.js`：材料白名单从"哥特石材"扩到通用建造集（250 项，石材/木作/全色玻璃/楼梯台阶/家具/植被），新增 `extraAllowedBlocks` 追加机制与 `isAllowedBlock()`；默认端口 `11451 → 25565`，接 `MC_HOST/MC_PORT/MC_USER/MC_VERSION` |
| **改名** | 审计日志 `cathedral-audit.jsonl → build-audit.jsonl`，环境变量 `MC_CATHEDRAL_AUDIT → MC_BUILD_AUDIT` |
| **删除（客户端 LAN 遗留）** | `bot/port-proxy.js`、`bot/probe-lan.js`、`build/build-courtyard.js`、`build/courtyard-plan.json`（后两者是空的 `site.json` 下已不可运行的弃用记录） |
| **泛化** | `bot/test-p0-tools.js`：坐标全部从 `build/site.json` 推导，不再写死项目数值；新增"dryRun 前后直方图一致"与"`mc_batch_place` 逐条对账"两条用例 |
| **更新** | `README.md`（平台表 + Windows 章节 + 23 工具表 + 大批量建造 + 环境变量表 + 排错）、`RESULTS.md`（工具数演进说明 + R3）、`NOTICE.md`、`.gitignore` |

**验收**：全仓库 `grep` 无 `cathedral|哥特|大教堂|CATHEDRAL|11451` 残留（历史性文档 `recon.md`/`PLAN.md` 里的历史事实除外）。

## 9.2 Windows 原生支持

| 交付 | 说明 |
|---|---|
| `run-server.ps1` | 服务器 start / stop / restart / status / cmd / tail / reset-world / **java**。Java **必须主版本 ≥ 25**，7 级探测链（参数 → `MC_JAVA` → `JAVA_HOME` → `.runtime\` → PATH → 常见安装目录 → 注册表），不满足时给出可操作的补法 |
| `run-daemon.ps1` | 常驻机器人 daemon，MCP HTTP + 游戏内私聊；用 `logs\daemon.pid.json` 精确定位进程（不误杀别的 `node.exe`） |
| `run-agent.ps1` | 一次性任务，等价于 `run-agent.sh`（找 `tsx`、设 `TSX_TSCONFIG_PATH`、留在项目 cwd） |
| `tools/install-java-win.ps1` | 下载 Microsoft OpenJDK 25（zip，解压即用）到 `<仓库>\.runtime\`，**不改系统 PATH / 注册表 / Program Files**；`-UseSystem` 只做校验登记 |
| `bot/ingame.js` 跨平台 | 原来写死 `spawn('run-agent.sh')`，改为按 `process.platform` 选 `.ps1`（`pwsh`/`powershell`）或 `.sh`（`bash`），可用 `MC_AGENT_CMD` 覆盖 |
| 控制台通道 | Windows 无 `mkfifo`：改为后台作业持有服务端进程 stdin + 命令队列文件轮询；对使用者仍是同一个 `cmd` 命令 |

**验收（本次实测）**：PowerShell 语法解析全绿；Java 探测在"本机只有 JDK 24 + JRE 8"的环境下正确识别并拒绝；`tools\install-java-win.ps1` 下载（**可续传**，见下）并解压出 OpenJDK 25.0.4.1；`run-server.ps1 start` 真实启动 MC **26.1** 服务端到 `Done (0.217s)`；`status` / `cmd "list"`（命名管道回环，服务端真的回 `There are N of a max of 5 players online`）/ `stop`（**优雅停机**，`Saving worlds` → 干净退出）全部可用；`run-daemon.ps1 start` 让 `DeepSeekBot` 真实登入（服务端日志 `logged in with entity id 493`），`/health` 返回 `connected:true`，`stop` 后服务端记录 `DeepSeekBot left the game`；MCP server 在 Windows 上枚举出 **23** 个工具，S2 回归 **8/8**，`test-p0-tools.js` **14/14（1 项按设计跳过）**。

### 9.3 Windows 上踩到并修掉的 6 个坑（都写进了代码注释）

| # | 现象 | 真因 | 修法 |
|---|---|---|---|
| 1 | `.ps1` 里中文全变乱码、解析直接失败 | **PS 5.1 把无 BOM 的 `.ps1` 当 ANSI/GBK 读**（Node 里 UTF-8 无 BOM 反而正常） | 所有 `.ps1` 一律写 **UTF-8 with BOM** |
| 2 | Java 探测一律返回"主版本 未知" | `$ErrorActionPreference='Stop'` 把原生命令的 **stderr 当终止错误**；而 `java -version` 正好把版本写 stderr | `Invoke-JavaVersionRaw` 里临时切 `Continue` 并 try/finally 还原 |
| 3 | `console.log` 始终 0 字节（java 明明在跑） | 用了 `BeginOutputReadLine` + `OutputDataReceived`，回调要在线程池重入 runspace，而主机线程阻塞在 `WaitForConnection()` → **单线程 runspace 不可重入，回调永远排不上** | 输出泵改到**独立 runspace**（`PowerShell.Create()` + `BeginInvoke`） |
| 4 | `start` 等满 180s 说超时，日志里 `Done` 明明已存在 | `Select-String` 打开文件的方式不含 `Write` 共享，而宿主一直持有 `console.log` → **共享冲突 + `-ErrorAction SilentlyContinue` = 静默永远找不到** | 新增共享安全的 `Get-LogLines` / `Find-LogLine`（显式 `FileShare.ReadWrite`） |
| 5 | `daemon start` 直接报 `RedirectStandardOutput and RedirectStandardError are same` | `Start-Process` 不允许 stdout/stderr 指向同一文件 | 拆成 `daemon-node.out.log` / `daemon-node.err.log` |
| 6 | `status` 里"监听:"显示成 `management-server-port=0` | `-like '*server-port=*'` 会误命中 `management-server-port=` | `Find-LogLine` 支持 `^` 行首锚定（走正则） |

**另外**：这个 CDN 上 `HttpWebRequest`（约 700KB）、`HttpClient` 同步 Read（约 37MB）、`Start-BitsTransfer`（卡在 Connecting）**三种下载方式都会卡死**，所以 `install-java-win.ps1` 自己实现了 **异步读 + 60s stall 判定 + HTTP Range 续传**，实测 210.5 MB / 26s 拉完。

### 9.4 仍未验证（需要你先做一步配置）

`run-agent.ps1` 的**启动链路本身已实测**：它正确识别出本机没有 DSH 源码 checkout，回退到 PATH 上的全局 `dsh`，把 `--profile` / `--json` / `--session-id` / prompt 正确传过去，并如实透传 dsh 的报错。但你的 `~/.dsh/profiles` 下**目前只有 `web`**，没有 `minecraft`，所以真正的 headless 任务跑不通：

```
Error: dsh: profile "minecraft" does not exist; create it with 'dsh plugin --profile minecraft add <package>'
```

也就是说 **MCP 接入 profile 尚未配置**（README「配置要点」里那段）。配好之后 `run-agent.ps1` 与 daemon 的游戏内私聊才算全链路可用。

---

# 增量 P10：配置 DSH profile 接入（实机完成）

**追加需求**：把 DSH 的 `minecraft` / `minecraft-ingame` profile 真正建出来，让一次性任务能跑。

## 10.1 DSH 的 profile 机制与 README 旧说法不符

实测 `dsh 0.1.5-rc.3 --help` 与 `dsh-app-boot` 的 `PROFILE_TEMPLATES`：profile **不是**"复制 `headless` 目录再改 `cordis.patch.yml`"，
而是 **`dsh --from-default-profile <模板>` 首次使用时自动创建**，内置模板 `acp / web / headless / sdk / sdk-minimal`。
每个 profile 的 `package.json` 里 `dsh.profile.bundles` 决定装载哪几个 bundle（`dsh-base` + `dsh-headless`），
而 `@deepseek-ai/dsh-mcp-client` **不是 bundle**（它的 package.json 没有 `dsh.bundle`），必须用 `cordis.patch.yml` 的 `insert` 行引入。

## 10.2 实际写入的东西

| 路径 | 内容 |
|---|---|
| `~\.dsh\profiles\minecraft\` | `package.json`（bundles = dsh-base + dsh-headless）、`cordis.yml`、`cordis.patch.yml`（stdio MCP）、`pnpm-workspace.yaml` |
| `~\.dsh\profiles\minecraft-ingame\` | 同上，`cordis.patch.yml` 换成 streamable-http → `http://127.0.0.1:8790/mcp` |
| `~\.dsh\profiles\web\cordis.patch.yml` | 追加 stdio MCP（`failOnStartupError: false`）；**原文件已备份**为 `cordis.patch.yml.bak-before-minecraft-20260926-215800` |

## 10.3 验收

| 项 | 结果 |
|---|---|
| `dsh --profile minecraft --dump-config` | exit 0，组合里能看到 `minecraft-mcp` 行 ✅ |
| `dsh --profile minecraft-ingame --dump-config` | exit 0 ✅ |
| `dsh --profile web --dump-config` | exit 0，`minecraft-mcp` 行在 ✅ |
| `run-agent.ps1 "…mc_status…"` | agent 真实调用 `mcp__minecraft__mc_status`，stdout 返回 `机器人 DeepSeekBot 当前在主世界坐标 (6.5, 74, 7.5)，血量 20/20` ✅ |
| `run-daemon.ps1 start` | `DeepSeekBot` 已登入，`/health` → `connected:true` ✅ |

## 10.4 配置期间又踩的 3 个坑

| # | 现象 | 真因 | 修法 |
|---|---|---|---|
| 1 | `failed to parse overlay ... YAMLException: missed comma between flow collection entries` | YAML **flow 序列**（`[` 开头）里 `#` **不是注释**，我在条目之间写了中文注释 | 改成 block 序列（每项以 `- ` 开头），注释写在顶层 |
| 2 | `run-agent.ps1` 退出码 1，只打印 `[mc-mcp] MCP server ready` 就结束 | `$ErrorActionPreference='Stop'` 把 MCP 子进程写 stderr 的日志当 NativeCommandError 终止错误 | `Invoke-Harness` 里临时切 `Continue`（与 Java 版本探测同一类问题） |
| 3 | **`run-agent.ps1` 退出码 0 但 stdout 一个字节都没有**，而直接 `dsh` 同样的任务能答 | 原生命令的 stdout 会进**函数返回值**，`exit (Invoke-Harness ...)` 拿到的是 `@(<回答>, <退出码>)`，`exit` 只吃最后一个元素 → **回答被丢弃** | `& $Exe @Arguments \| Out-Host`，让函数只返回退出码 |

## 10.5 已知限制：游戏内私聊在本机 DSH 版本上不可用

本项目原是在 **DSH 源码 checkout 0.1.6-alpha.2** 上开发的，那里 headless 支持
`--json`（NDJSON 事件流）与 `--session-id`（续接会话）；而本机 `npm i -g` 装的是 **0.1.5-rc.3**，
`dsh --profile <x> --help` 只暴露一个 `-h/--help`。实测：

```
$ dsh --profile minecraft --json "…"        → error: unknown option '--json'   (exit 1)
$ dsh --profile minecraft --session-id x "…" → error: unknown option '--session-id'
$ dsh --profile minecraft --resume <sid> "…" → error: unknown option '--resume'   (--help 示例里有，实际没有)
```

而 `dsh-headless/lib/index.js` 的 `run()` 每次都 `sessionId: \`session-${randomUUID()}\``
**新建会话**，没有任何续接入口。因此：

- **一次性任务（`run-agent`）两种版本都能用** —— 最终回答直接走 stdout。
- **游戏内 `/msg` 私聊的"对话记忆"只在源码 checkout 上能实现**：`bot/ingame.js` 依赖
  `--json --session-id`，在 0.1.5-rc.3 上每个 turn 都会以 `unknown option` 立刻失败。
  这是**版本能力缺口，不是配置错误**。

解决方向（需另行决策）：① 改 `bot/ingame.js` 支持"无 `--json` / 无记忆"降级模式（回答仍可用，
但每轮都是全新会话）；② 装 DSH 源码 checkout 并让 `run-agent` 走 tsx 路径（`run-agent.ps1` 已支持，
只要 `DSH_REPO` 指向含 `apps\cli\src\bin.ts` 的仓库）。

---

# 增量 P11（决策：选 B）：装 DSH 源码 checkout，打通游戏内私聊全链路

**决策**：用户选 **B** —— 装源码 checkout，拿到 `--json` + `--session-id`，保留完整对话记忆。

## 11.1 做了什么

| 步骤 | 结果 |
|---|---|
| 浅克隆 `deepseek-ai/deepseek-harness`，钉 tag **`dsh-v0.1.6-alpha.2`**（正是本项目原本对齐的版本） | `D:\HI\CODE\DSH\deepseek-harness`，122 MB |
| `pnpm install --frozen-lockfile` | ✅（第一次因 npmjs 慢反复超时失败；放宽 `.npmrc` 抓取参数 + `CI=true` 后成功） |
| `pnpm run build:lib`（host + client） | ✅（`build:lib:host` 不够，见 11.3 #4） |
| 给 `minecraft` / `minecraft-ingame` profile 的 `node_modules` 建 **289 个 junction** 指向源码工作区包 | ✅ 运行时用源码的 0.1.6-alpha.2，而不是 npm 的 0.1.5-rc.3 |
| `run-agent.ps1` / `run-agent.sh` / `bot/ingame.js` 适配 | ✅ |

## 11.2 验收（全部实测）

| 测试 | 结果 |
|---|---|
| 源码版 `run-agent.ps1` 普通任务 | ✅ 回答 `OK` |
| 源码版 + MCP 工具 | ✅ `tool_result` 返回真实 `connected:true / position / inventory` |
| **`--json` NDJSON** | ✅ 事件与 `ingame.js` 解析**完全对得上**：`session.sessionId` / `tool_call` / `final.text` |
| **`--session-id` 续接会话** | ✅ 第 1 轮记住 `7391`，第 2 轮 **0 次工具调用**直接复述 `7391` |
| **S5 游戏内私聊** | ✅ **5/5**（连跑 3 次稳定） |
| **S6 真控制 + 对话记忆** | ✅ **9/9**（同一 sessionId 复用；T2 仅 1 次工具调用即复述上一轮"橡木 2 个"） |
| **S7 双角色协同** | ✅ **7/7** |

## 11.3 期间踩到并修掉的 8 个坑（每个都是实测定位，不是猜）

| # | 现象 | 真因 | 修法 |
|---|---|---|---|
| 1 | `ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'd:'` | Windows 上 `node --import` **必须是 `file://` URL**，不接受裸盘符路径 | `run-agent.ps1` 里改用 `pathToFileURL()` 生成 |
| 2 | 52 个插件 `failed to import` | `TSX_TSCONFIG_PATH` 指向根 `tsconfig.json`，而它只是 solution 文件（`files: []` + `references`），**paths 真在 `tsconfig.base.json`** | 优先用 `tsconfig.base.json` |
| 3 | `Cannot read properties of undefined (reading 'prepare')` | 源码 harness（0.1.6-alpha.2）与 profile 里 npm 的 0.1.5-rc.3 **混用**：`ctx.tools[TOOL_RUNTIME_SCHEDULER]` 的 symbol 来自源码，而 registry 由 npm 版构造 → `undefined` | 给两个 profile 建 junction 指向源码工作区包 |
| 4 | 同上，且 `typert-*` 三个插件 `failed to import` | `build:lib:host` 只构建 host 侧，**62 个包没有产出 `lib/*.js`** | 改跑 `pnpm run build:lib`（host + client） |
| 5 | `New-Item -ItemType SymbolicLink` 报 `Administrator privilege required` | Windows 默认不允许非管理员建符号链接（`AllowDevelopmentWithoutDevLicense=1` 也不够） | 改用 **junction**（`mklink /J`），不需要特权 |
| 6 | `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` | `--no-optional` 破坏了 modules 状态，pnpm 要清空重建但无 TTY 时拒绝 | `$env:CI='true'` |
| 7 | **`run-agent.ps1` 退出码 0 但 stdout 一个字节都没有** | 原生命令 stdout 会进**函数返回值**，`exit (Invoke-Harness ...)` 拿到 `@(<回答>, <退出码>)`，`exit` 只吃最后一个元素 → 回答被丢弃 | 加 `\| Out-Host`，让函数只返回退出码 |
| 8 | **`ingame.js` 拿不到 `final` 事件**（S5 卡在 4/5） | Windows 上子进程是 `powershell -File run-agent.ps1`，而 **PowerShell 5.1 的 `-File` 收不到以 `--` 开头的参数** → `--json` 丢失 → harness 输出纯文本 | 改用环境变量 `MC_AGENT_JSON` / `MC_AGENT_SESSION_ID` 传递，完全绕开命令行解析（`.ps1` 与 `.sh` 都支持） |

## 11.4 仍未完全稳定的一处（如实记录）

S5 在"源码版 + junction 对齐"刚打通时出现过两次 4/5：`mc_status`/`mc_inventory` 都真实执行了
（审计日志可证），但该轮 harness **没有发出 `final` 事件**（`exit=0`、stdout 无 `final`）。
改成环境变量传参后连跑 5 次 + 3 次全部 5/5，未再复现，因此归因于修好前的残留；
但**没有证据证明它绝不会再发生**。已加 `MC_INGAME_DEBUG=1` 开关，届时可打出每轮的事件统计
（`exit` / `stdoutBytes` / `events` / `textLen`）用于定位。
