# 烟雾测试结果报告

执行时间：本次会话 · 目标版本 Minecraft Java **26.1** · bot 库 mineflayer **4.39.0**

所有结论都基于**原始证据**，不是"看起来能用"。Agent 的自述一律与服务端审计日志交叉核对。

> **工具数量随版本演进**，请以 `tools/list` 的真实返回为准：
>
> | 阶段 | 工具数 | 新增 |
> |---|---|---|
> | S2 首测 | 16 | 感知 / 移动 / 采集 / 生存循环 |
> | P8 双角色协同 | 19 | `mc_follow` / `mc_goto_player` / `mc_give` |
> | P0 批量建造 | **23** | `mc_fill` / `mc_scan_region` / `mc_batch_place` / `mc_allowed_blocks` |
>
> 下面各条记录的是**当时**的实测输出，数字保留原样（16 / 19），不做回溯改写。

---

## 总览

| 编号 | 测试 | 结果 | 关键证据 |
|---|---|---|---|
| S1 | 机器人连通性（无 LLM） | ✅ PASS | 出生 `(-7,89,7)` → 移动 5.51 格 → 挖掉 `grass_block` |
| S2 | MCP 协议层 + 工具真实可用（无 LLM） | ✅ **8/8 PASS** | 首测 16 个工具；背包 `0 → 2` 真实改变世界 |
| S3 | 端到端·采集（DeepSeek agent） | ✅ PASS | 起始背包 `[]` → `collected: 3` → 最终 4 个 |
| S3b | 端到端·生存链（DeepSeek agent） | ✅ PASS | 9 次工具调用自主做出木镐，且**自行修正了一次失败** |
| S4 | 端到端·生存链路（无 LLM，19 项断言） | ✅ **19/19 PASS** | 采集→合成→放置→箱子→熔炉→战斗→进食（`food 16 → 20` 真吃到）全通 |
| S5 | **游戏内私聊交互**（无人工，5 项断言） | ✅ **5/5 PASS** | 玩家 `/msg DeepSeekBot ...` → agent 真调用 `mc_status`+`mc_inventory` → 私聊回复，服务端日志确认**零公共发言** |
| S6 | **游戏内真控制 + 对话记忆**（9 项断言） | ✅ **9/9 PASS** | 一句私聊真的砍下 `oak_log ×2`；追问复用同一 DSH session 并正确回忆"橡树 2 个" |
| S7 | **双角色协同**（7 项断言） | ✅ **7/7 PASS** | 两角色同世界互见；"跟着我"跟到 1.0 格；"别跟了"生效；"过来"从 15.1 → **0.0 格**；"给我 3 个原木"背包 `0 → 3` |
| S8 | Web GUI 同款工具 | ⏸ 配置已写入，等你重启 `dsh web` 后生效 | `--dump-config` 组合校验通过 |
| R1 | 重构回归：stdio 路径未被破坏 | ✅ **8/8 PASS**（S2 重跑） | `buildServer()` 工厂 + HTTP 传输改造后，原 stdio 工作流照旧 |
| R2 | 新增协同工具后的回归 | ✅ **S2 8/8 + S5 5/5** | 19 个工具、原有能力未受影响 |
| R3 | 批量建造工具边界（拒绝性用例，无 LLM） | ✅ `bot/test-p0-tools.js` | 白名单外 / 施工区外 / 保护圈内 / 体积超限 全部被拒；dryRun 前后方块直方图一致 |

---

## S1 · 连通性（`bot/connect.js`）

```
[s1] spawned as DeepSeekBot at (-7, 89, 7) dimension=overworld
[s1] moved 5.51 blocks -> (-3, 85, 7)
[s1] digging grass_block at (-3, 84, 7)
[s1] STATUS {"username":"DeepSeekBot","version":"26.1","dimension":"overworld",
             "health":20,"food":20,"nearbyEntities":75}
[s1] S1_PASS
```

## S2 · MCP 协议层（`bot/test-s2.js`，全新世界）

```
PASS  tools/list  count=16 -> mc_attack,mc_chat,mc_collect,mc_container,mc_craft,mc_dig,
                              mc_disconnect,mc_eat,mc_goto,mc_inventory,mc_look_at,
                              mc_place,mc_scan,mc_smelt,mc_status,mc_wait
PASS  mc_status connected      {"pos":{"x":9.5,"y":69,"z":-5.5},"hp":20,"ver":"26.1"}
PASS  mc_scan finds blocks     found=15
PASS  mc_wait                  connected=true
PASS  mc_scan 找到可用树木     nearest=birch_log
PASS  mc_collect changes world logs 0 -> 2; toolOk=true attempts=1
PASS  structured error path    error=unknown block name: not_a_real_block
PASS  final mc_status          inventory=[{"name":"birch_log","count":2}]
===== S2 SUMMARY: 8/8 passed =====
```

## S4 · 生存链路（`bot/test-survival.js`，19 项断言）

```
PASS  mc_collect 采 6 原木          collected=6 attempts=6
PASS  mc_craft 木板(免工作台)        gained={"oak_planks":24}
PASS  mc_craft 工作台                gained={"crafting_table":1}
PASS  mc_place 放置工作台            mode=coords
PASS  mc_craft 木棍(自动找工作台)     usesTable=true gained={"stick":4}
PASS  mc_craft 木镐(3x3 配方)        usesTable=true gained={"wooden_pickaxe":1}
PASS  mc_craft 箱子                  gained={"chest":1}
PASS  mc_place 放置箱子
PASS  mc_container list              chest contents=[]
PASS  mc_container deposit           moved=3 contents=[{"name":"oak_planks","count":3}]
PASS  mc_container withdraw          moved=2 contents=[{"name":"oak_planks","count":1}]
PASS  控制台夹具到货(圆石8/沙子2)
PASS  mc_craft 熔炉                  gained={"furnace":1}
PASS  mc_place 放置熔炉              at={"x":5,"y":71,"z":-14}
PASS  mc_smelt 沙子→玻璃             got={"name":"glass","count":1} fuel=oak_planks
PASS  mc_attack 击杀牛(自动换武器)    attacks=3 kills=1 whiffs=0 weapon=stone_sword
PASS  mc_eat 进食                    food 16 -> 20，吃了 cooked_beef

===== SURVIVAL SUMMARY: 19/19 passed =====
```

> 说明：圆石/沙子/牛/石剑由服务器控制台 `./run-server.sh cmd "..."` 造夹具（FIFO，未开 RCON）；其余全部真实采集与合成。

## S3b · 端到端·生存链（`./run-agent.sh`）

Agent 的最终回答（节选）：

> | 步骤 | 工具 | 结果 |
> |---|---|---|
> | 采集 ≥4 原木 | `mc_collect(oak_log, ×4)` | ✅ 采到 4 个（3 次尝试） |
> | 合成木板 | `mc_craft(oak_planks, ×3)` | ✅ 12 块 |
> | 合成工作台 | `mc_craft(crafting_table)` | ✅ 1 个 |
> | 放置工作台 | `mc_place` @ (-9, 76, -9) | ✅ 支撑面 `grass_block` |
> | 合成木棍 | `mc_craft(stick)` | ✅ 4 根（`usesTable: true`） |
> | 合成木镐 | `mc_craft(wooden_pickaxe)` | ✅ 1 把 |
>
> **过程小插曲**：第一次合成木镐失败，报"没有可用配方"——镐子需要 3 木板 + 2 木棍，而背包里还没有木棍。补合成木棍后即成功。

### 独立交叉核对（服务端审计日志 `logs/mcp-audit.jsonl`，9 次调用）

| # | 工具 | 耗时 | 真实返回 |
|---|---|---|---|
| 1 | `mc_status` | 4630ms | `inventory: []`（起始背包为空） |
| 2 | `mc_collect oak_log ×4` | 15416ms | `collected:4 attempts:3` |
| 3 | `mc_craft oak_planks ×3` | 267ms | `gained:{oak_planks:12}` |
| 4 | `mc_craft crafting_table` | 253ms | `gained:{crafting_table:1}` |
| 5 | `mc_place` @ (-9,76,-9) | 3247ms | `ok:true` |
| 6 | `mc_craft wooden_pickaxe` | 4ms | **`ok:false`：没有可用配方**（缺木棍） |
| 7 | `mc_craft stick` | 218ms | `usesTable:true gained:{stick:4}` |
| 8 | `mc_craft wooden_pickaxe` | 375ms | `usesTable:true gained:{wooden_pickaxe:1}` |
| 9 | `mc_status` | 0ms | 背包与报告一致 |

→ Agent 报告的每一步、材料账目（4 原木 → 12 木板，消耗 9 余 3）、甚至**那次失败**都与服务端记录完全一致。它没有掩饰失败，而是自己诊断出缺木棍并补上。

---

## S5 · 游戏内私聊交互（`bot/test-ingame.js`）

玩家（测试里由第二个机器人 `Tester` 扮演）在聊天框执行 `/msg DeepSeekBot 你现在在哪里？血量多少？看一下背包再回答我。`

```
← 私聊 from DeepSeekBot: 收到，正在处理：「你现在在哪里？血量多少？看一下背包再回答我。」
← 私聊 from DeepSeekBot: 已在游戏内实际执行 mc_status 和 mc_inventory 两次查询。
← 私聊 from DeepSeekBot: 结果：我当前在 overworld（主世界），坐标 x=-1.5, y=76, z=-9.5。
                          血量满 20/20，饥饿 20/20，状态健康。背包完全空…
← 私聊 from DeepSeekBot: 要点：坐标 (-1.5, 76, -9.5)、满血满饥饿、背包空… 需要我去砍树挖矿吗？

PASS  收到机器人私聊回复        4 条
PASS  回复来自目标机器人        from=DeepSeekBot
PASS  回复包含真实游戏数据      answer=…坐标 x=-1.5, y=76, z=-9.5…
PASS  回答只走私聊，未进公共聊天  服务端日志中 <DeepSeekBot> 公共发言 0 → 0
PASS  Agent 真实调用了 mc_* 工具  工具: mc_status,mc_inventory
===== INGAME SUMMARY: 5/5 passed =====
```

> "未污染公共聊天"用的是**独立证据源**：直接数服务端 `console.log` 里 `<DeepSeekBot>` 的出现次数（公开说话才会记录），而不是采信客户端侧的判断——之前用 mineflayer 的 `position === 'chat'` 会把私聊也误判成公共聊天。

## S6 · 游戏内真控制 + 对话记忆（`bot/test-ingame-memory.js`）

**T1 真控制**：私聊「帮我砍 2 个原木，然后用 mc_status 看一下背包」

```
PASS  T1 调用了 mc_collect           2 次
PASS  T1 世界里真的采到了原木         collected=2
PASS  T1 背包里确实有原木             背包原木=2 [{"name":"oak_log","count":2},{"name":"stick","count":2}]
PASS  T1 回答提到了采集结果           （回答里还诚实提到寻路时摔落受伤一次）
```

**T2 对话记忆**：紧接着追问「你上一轮砍的是什么树？砍了几个？」

```
PASS  T2 复用同一会话（真记忆）        session-b99f80db-… → session-b99f80db-…（同一个 id）
PASS  T2 回答引用了上一轮上下文        「上一轮砍的是橡树（oak tree）…砍了 2 个橡木原木」
PASS  T2 追问本轮工具调用很少          0 次（纯靠记忆作答）
PASS  全程未污染公共聊天               <DeepSeekBot> 公共发言 0 → 0
===== MEMORY SUMMARY: 9/9 passed =====
```

→ 记忆不是"感觉像记得"，而是**两轮复用同一个 DSH session id**，且第二轮 0 次工具调用就能准确复述上一轮结果。

---

## S7 · 双角色协同（`bot/test-coop.js`）

用第二个机器人 `Player1` 扮演"真人客户端"（在协议层等价），与常驻的 `DeepSeekBot` 同处一个世界，全程通过**游戏内私聊**指挥：

```
PASS  T1 机器人能看见我（同世界两角色）  它看到的 Player1: {"visible":true,"position":{...},"distance":16.6}
PASS  T1 机器人用户名独立                bot=DeepSeekBot me=Player1

→ 私聊：跟着我，保持 3 格以内。
PASS  T2 跟随已激活        {"active":true,"username":"Player1","distance":3,"moves":1,"lastDistance":1.46}
  （我走了约 18 格）
PASS  T2 机器人真的跟过来了  跟随时水平距离=1.0 格

→ 私聊：别跟了，停下来。
PASS  T3 跟随已停止        {"active":false}

→ 私聊：到我这儿来。
PASS  T4 "过来"后机器人走到我身边   距离 15.1 → 0.0 格（两角色同点）

→ 私聊：把 3 个原木给我。
PASS  T5 我真的收到了 3 个原木       我的背包 oak_log 0 → 3
===== COOP SUMMARY: 7/7 passed =====
```

服务端审计日志对 T5 的独立佐证：

```json
{"tool":"mc_give","args":{"player":"Player1","itemName":"oak_log","count":3},
 "result":{"ok":true,"gave":"oak_log","count":3,"attempts":1,"droppedItems":1,
           "itemToPlayerDistance":0.95,"distanceBotToPlayer":0.93,
           "withinPickupRange":true,"lookPitch":-1.57}}
```

→ `lookPitch=-1.57`（≈-90°，垂直丢下）、`itemToPlayerDistance=0.95`（在约 1.4 格的拾取半径内）、`withinPickupRange=true`，与"玩家背包真的多了 3 个原木"完全吻合。

### 真人加入的唯一门槛

客户端版本必须匹配 **26.1**（服务器是 26.1，协议不兼容 26.2）。按你的选择，由你自己在官方启动器里新建一个 26.1 安装；连接地址 `localhost`。服务端 `online-mode=false` + 仅绑 `127.0.0.1`，所以只有本机能连。

---

## 实测踩到的 20 个坑（都已修复）

| # | 现象 | 真因 | 修复 |
|---|---|---|---|
| 1 | `mc_collect` 挖到方块但 `nothing picked up` | `GoalNear(range=3)` 停在 3 格外，而**玩家拾取半径只有约 1 格** | 靠近距离收紧到 1，并新增 `chaseDrops()` 主动走过去捡 |
| 2 | 砍橡树 8 次全部拾取失败 | 取"最近方块"会把机器人**带上树顶**（最终位置 y=88 正是树冠），从树顶往下挖，掉落物落到 4 格以下且下不去 | 新增 `pickBlock()`：在最近方块簇里**优先取最低那一段**，站地面砍树干底部 |
| 3 | `mc_scan` 刚连上返回 0 个方块 | `spawn` 事件 ≠ 区块加载完成 | 新增 `waitForWorld()`，空结果重试一次（返回 `retriedForChunks`） |
| 4 | `mc_collect` 被 `MCP error -32001: Request timed out` 打断 | **MCP client 默认请求超时只有 60s** | profile 里 `toolCallTimeoutMs: 180000`；工具默认超时收紧到 45s |
| 5 | headless 从项目目录启动报 `does not provide an export named 'FiberState'` | `tsx` 按 **cwd** 找 tsconfig，丢失 `@deepseek-ai/*` 路径映射 | `run-agent.sh` 显式 `TSX_TSCONFIG_PATH=$REPO/tsconfig.json` |
| 6 | `mc_container deposit` / `mc_smelt` 报 `Invalid itemType` | 混用了 **物品定义**（`registry.itemsByName[x].id`）与**背包物品**（`item.type`） | 一律从 `bot.inventory.items()` / `win.containerItems()` 取物品对象 |
| 7 | `mc_attack` 报 `attacks=35 kills=0` | 不在攻击距离内也在挥击，**挥空不计伤害**，结果极具误导性 | 加距离判定（>3.2 格先靠近，仍够不着就记为 `whiffs` 而不是 `attacks`） |
| 8 | `mc_craft` 把"部分成功"报成整体失败 | 只有 5 个原木却请求合成 6 次，前 5 次已产出木板，第 6 次抛 `missing ingredient` | 先用配方 `delta` 估算最多可合成次数并收敛；仍失败则返回 `partial:true` + 实际产出 |
| 9 | **`mc_collect` 空转 1904 次 / 后续所有 `goto` 报 `PathStopped`** | ⚠️ **`bot.pathfinder.stop()` 会把 pathfinder 永久打坏**：调用过之后每一次 `goto` 都会立刻被 `path_stop` 事件拒绝 | 只调 `setGoal(null)`（同样能停下机器人）；超时放弃的 promise 挂空 catch 防 unhandledRejection。**已用 `bot/probe-pathfinder.js` 最小复现证实** |
| 10 | `mc_collect` 反复重试同一块够不着的方块，直到停滞保护才停 | 目标原木在 `(0,79,8)`，机器人在 `y=74`——**高 5 格**，超过 4.5 格交互距离；而代码每次都重新选中"最低的那块"（还是同一块） | 加 `skip` 拉黑集合：够不着或寻路失败的目标进黑名单，**换一棵树**再试 |
| 11 | `mc_eat` 报告"吃了"但饥饿值没变（`16 -> 16`） | `bot.consume()` 返回后服务端确认包还没到，立刻读 `bot.food` 是旧值 | 进食后轮询等待数值变化（最多 2.4s）。**修好后实测 `food 16 -> 20`** |
| 12 | daemon 起不来：`EADDRINUSE 127.0.0.1:8766` | 本机 8766 已被另一个程序（`claude-sc*`）监听，`/health` 返回的还是它的 Fastify 404 | 换到空闲端口 **8790**，`run-daemon.sh` 支持 `MC_MCP_PORT` 覆盖；profile 里的 `url` 需同步 |
| 13 | 测试把 T1 的回答错记到 T2 头上，误判"没有记忆" | daemon 先回一条"收到，正在处理"，此后 agent 干活期间**会静默几十秒**；测试用"静默 3s 即认为说完"提前收尾 | 改成两阶段等待：先等**第 2 条**（答案第一片）出现，再等尾部安静 6s。**这是测试缺陷，不是功能缺陷** —— 功能当时已正常工作 |
| 14 | 改名后 `./run-agent.sh --json` 报 `unknown option '--json'` | 我给启动脚本加的 `DSH_PROFILE` **与 harness 自己的环境变量撞名**（harness 里它等于 `web`），导致脚本静默去启动 web app 而不是 minecraft profile | 改名 `MC_PROFILE`。**教训：自定义变量别用 `DSH_` 前缀** |
| 15 | 明明要求"只私聊回复"，agent 却用 `mc_chat` 把结果**广播到了公共聊天** | `mc_chat` 是公共发言，但 agent 把它当成"私下汇报"手段自作主张地用了；提示词里的软约束不足以拦住 | 双保险：① 提示词明确"回答由系统自动私聊，禁止 mc_chat 发言"；② daemon 启动时设 `MC_NO_PUBLIC_CHAT=1`，`mc_chat` 带 message 时直接返回结构化错误（**硬约束**）。修后 S5 恢复 5/5 |
| 16 | `mc_give` 说"离玩家 1 格"，玩家却捡不到 | 报的距离是**机器人到玩家**，而 `bot.toss` 给了物品约 0.3 格/tick 的**前向速度**（朝向玩家 → 抛过头），物品实际落在 **2.94 格**外，超出约 1.4 格的拾取半径 | 改为**垂直丢下**（`pitch=-90°` 时 cos=0，前向速度归零）；指标改成**掉落物实体到玩家**的真实距离，并据此重试 |
| 17 | 改成垂直丢下后仍落在 2.58 格外（机器人只离 0.9 格） | `bot.look()` 只是把 rotation 包写出去，**服务端处理"丢弃"点击时还没收到**，仍按旧朝向投掷 | `look` 之后 `await sleep(400)` 再 `toss`；结果里回传 `lookPitch` 便于核对。修后 `itemToPlayerDistance 0.9`、玩家背包 `[] → oak_log:3` |
| 18 | 重试时抛 `Can't find oak_log in slots [9 - 45]`，物品像凭空消失 | 我在重试循环里**复用了过期的 `item` 引用**——第一次丢完背包已变，第二次仍拿旧对象去丢 | 每次重试都**重新查背包**；查不到就如实返回，不抛异常 |
| 19 | 协同测试每轮都把答案记到下一轮头上 | 自己发的 `/msg` 也会**回显成 whisper**（且文本为空），"等到 2 条"立刻满足 → 提前收尾 | 过滤空文本与自身回显；等待改成三阶段（等确认 → 等答案首片 → 等尾部安静 6s） |
| 20 | `mc_collect` 曾超出自身时限数分钟不返回（MCP 调用挂死） | 循环内某个 await 在异常环境下没能及时返回，而工具自身没有总时限兜底 | 给 `mc_collect` 加**硬性总时限** `withTimeout(body, timeoutMs + 10s)`，任何情况下都会返回结构化结果 |

### 架构层面的一处必要重构

MCP SDK 要求**一个 `McpServer` 实例只能连一个传输**，而 HTTP 模式下 DSH 每次运行都会新建会话，所以把工具注册包成了 `buildServer()` 工厂：每个会话一个 `McpServer`，但**共用同一个 `BotManager`**（也就是同一个 Minecraft 连接）。改造后 stdio 路径经回归测试确认未被破坏（R1 8/8）。

### 第 9 条的复现证据（`bot/probe-pathfinder.js`）

```
A goto#1: OK (419ms)
B goto#2: FAIL PathStopped     ← 在 setGoal(null) + stop() 之后
C goto#3: FAIL PathStopped     ← 仅 stop() 之后
E round1 goto: OK (1002ms)
E round2 goto: FAIL PathStopped   ← 每轮之间夹一次 stop() 就永久失效
E round3 goto: FAIL PathStopped
```

对照实验（`bot/probe-pathfinder2.js`）：只用 `setGoal(null)` 不会触发 `PathStopped`。

---

## 未通过 / 未覆盖

- **26.2 / 26.3 未验证**：mineflayer 与 azalea 均不支持，见 `recon.md`。本方案锁定 26.1。
- **未实现真正的 `/deepseek`**：斜杠命令必须由服务端注册，原版服务端无法拦截。已调研出可行路径（Paper 26.1.2 build 74 / Fabric 26.1 + 自带 JDK 25 可直接 `javac` 编译插件），但按你的选择**不换服务端**，改用 `/msg DeepSeekBot <内容>`。
- **未测试**：跨维度、多人协作、矿石开采链、长时间自主运行、死亡掉落恢复、附魔/酿造。
- **未做真人联机**：本轮没有安装 26.1 客户端，游戏内交互由第二个机器人扮演玩家完成端到端验证。
- **Web GUI（S7）未实测**：配置已写入并通过组合校验，但需要你重启 `dsh web` 才生效。
- **稳定性**：`mc_collect` 在"目标高差过大"的场景已能自愈（拉黑换目标），但极端地形下仍可能采不足量并**如实报错**，而不是假装成功。
- **多人并发**：队列是串行的且已验证不会互相打断，但未做多人同时提问的压力测试。
- **批量建造只验证了"拒绝性边界"**：`bot/test-p0-tools.js`（R3）证明了白名单外、施工区外、保护圈内、体积超限都被拒绝，且 `dryRun` 不写世界；但**没有**在真实世界里跑过一次完整的大规模建造（`build/site.json` 是模板，需要你先填自己的项目坐标）。
- **Windows 版脚本**（`run-server.ps1` / `run-daemon.ps1` / `run-agent.ps1`）：语法与 Java 探测已在本机校验，并做过真实 26.1 服务端启动与 MCP 工具枚举；但未在 Windows 上跑完整的 S4/S5/S6/S7 长链测试。
