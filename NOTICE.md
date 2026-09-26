# NOTICE · 版权、商标与再分发说明

本仓库**只包含自研源码与文档**。以下内容在开源前已被有意排除，请勿认为它们随本仓库授权。

---

## 1. 本项目自身的许可

除 `NOTICE.md` 第 2–5 节列出的内容外，本仓库的**源码与文档**以 [MIT License](LICENSE) 授权，版权归 HIMHANDSOME 所有。

---

## 2. 非官方项目声明（无背书关系）

- 本项目**不是** DeepSeek 官方项目，也**未获得** DeepSeek 的赞助、认可或背书。
- 本项目**不是** Mojang Studios 或 Microsoft 的官方项目。
- "DeepSeek"、"Minecraft" 及相关名称、徽标均为其各自权利人的商标。本项目仅在**描述性、指示性**意义上使用这些名称（说明本软件与哪个平台配合工作），不主张任何商标权。

---

## 3. Mojang 资产：已全部排除，不予分发

以下内容受 Minecraft 最终用户许可协议（EULA）与 Mojang 商业条款约束，**不得再分发**，因此本仓库**不包含**它们：

| 已排除内容 | 说明 |
|---|---|
| `minecraft-server-26.1/server.jar` | Mojang 官方服务端二进制（约 60 MB） |
| `minecraft-server-26.1/libraries/` | Mojang 依赖库（约 41 MB） |
| `minecraft-server-26.1/versions/` | Mojang 版本清单与 jar（约 23 MB） |
| `minecraft-server-26.1/world/` | 本机沙箱世界存档，且含玩家 UUID 数据 |
| Minecraft 原版纹理 / 音效 / 任何游戏素材 | 本项目自带资源包仅含自制纹理 |

**使用本项目前，请自行从 Mojang 官方渠道获取服务端**（`piston-data.mojang.com`），并自行确认你已阅读并同意 [Minecraft EULA](https://www.minecraft.net/eula)。

`recon.md` 中记录的 26.1 服务端下载地址与 SHA1 校验值仅作**事实性引用**，不构成对 Mojang 二进制的再分发。

---

## 4. 已排除的运行态与隐私数据

| 已排除内容 | 排除原因 |
|---|---|
| `minecraft-server-26.1/server.properties` | 含 `management-server-secret` 等本机密钥；仓库改为提供 `server.properties.example`（密钥已置空） |
| `logs/`（含 `mcp-audit.jsonl`、`build-audit.jsonl`） | 运行日志；仅含机器人测试名，仍按最小化原则排除 |
| `build/snapshots/`、`build/verify-last.json` | 批量建造的调色板快照与校验结果，属生成产物 |
| `.runtime/` | `tools/install-java-win.ps1` 下载的 JDK（约 190 MB），应由脚本按需下载 |
| `bot/node_modules/` | 第三方依赖（约 493 MB），应由 `npm install` 获得 |
| `tmp/ref/*.webp` | 3 张来源不明的参考图，版权状态无法确认 |
| `skins/DeepSeek-whale-chan.zip`、`skins/pack-build/`、`skins/preview*.png` | 资源包产物与预览图；含 DeepSeek 鲸鱼 logo 的衍生美术，涉商标，随源码排除 |

### 关于 `skins/`

仓库保留了 `skins/make_skin.py` 与 `skins/build_resourcepack.py` **源码**，它们会生成一个以 DeepSeek 鲸鱼为灵感的玩家皮肤。

该形象的商标与版权属于 DeepSeek；**仓库未分发其美术产物**，且不以任何方式暗示 DeepSeek 的认可。若你要复用这些脚本产出的图像用于公开场合，请自行确认商标使用合规性。

---

## 5. 第三方依赖

`bot/package.json` 声明的直接依赖**均未随仓库分发**，请通过 `npm install` 获取。它们各自携带独立许可：

| 依赖 | 版本 | 许可 |
|---|---|---|
| [`mineflayer`](https://github.com/PrismarineJS/mineflayer) | 4.39.0 | MIT |
| [`minecraft-data`](https://github.com/PrismarineJS/minecraft-data) | 3.117.0 | MIT |
| [`mineflayer-pathfinder`](https://github.com/PrismarineJS/mineflayer-pathfinder) | 2.4.5 | MIT |
| [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) | 1.30.0 | MIT |
| [`zod`](https://github.com/colinhacks/zod) | 4.6.5 | MIT |
| [`vec3`](https://github.com/AndrewKelley/vec3) | 0.1.10 | BSD |

> `vec3` 采用 BSD 许可，再分发时需保留其版权声明。完整依赖树与其许可文本见 `bot/package-lock.json`，或执行 `npm install` 后在 `node_modules/<pkg>/LICENSE` 中查看。

本项目通过 DSH 的 **`@deepseek-ai/dsh-mcp-client` 插件**接入 Agent。该包**未随本仓库分发**，需由使用者在自己的 DSH 环境中安装。

---

## 6. 安全提示

- 本项目的沙箱服务器使用 `online-mode=false`，因此 `server-ip` **必须**保持 `127.0.0.1`，**绝不可**改为 `0.0.0.0`。
- `server.properties.example` 中的 `management-server-secret` 已置空。若你启用管理服务器，请自行生成新密钥，并**不要**提交到版本控制。
- 若你不小心提交过密钥，仅删除文件是不够的——密钥仍留在 Git 历史中，必须**吊销并重新生成**该密钥。
