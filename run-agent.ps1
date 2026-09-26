<#
.SYNOPSIS
    在 Minecraft 项目目录里启动 DSH 的 minecraft profile（headless 单次任务）—— Windows 版。

.DESCRIPTION
    与 run-agent.sh 功能对等。

    为什么需要这个脚本：headless 会话的**工作目录 = 进程 cwd**，而 DSH 需要在它自己的
    安装位置里找依赖与 tsconfig。bash 版的做法是显式用仓库里的 tsx 加载器、但把 cwd 留在
    本项目目录。Windows 上分两种情况，脚本自动判断：

      * **源码 checkout**（$env:DSH_REPO 指向含 apps\cli\src\bin.ts 的 DSH 仓库）
        → 用该仓库的 tsx 加载器启动，并设 TSX_TSCONFIG_PATH（否则 tsx 按 cwd 找 tsconfig，
          会丢掉 @deepseek-ai/* 路径映射，报 `does not provide an export named 'FiberState'`）。

      * **npm 全局安装**（PATH 上有 dsh，例如 %APPDATA%\npm\dsh.ps1）
        → 直接用 dsh，不需要 tsx。

    用法：
      .\run-agent.ps1 "在 Minecraft 里采集 1 个原木，然后报告你的坐标和背包"
      .\run-agent.ps1 -Json "采集 4 个原木，做一个工作台并合成一把木镐"
      $env:MC_PROFILE='minecraft-ingame'; .\run-agent.ps1 -Json "..."   # 走常驻 HTTP MCP

    参数（harness 自己的选项原样透传）：
      -Json            输出 NDJSON 事件流，便于程序解析（等价 --json）
      -SessionId <id>  续接已有会话
      -Profile <name>  覆盖 MC_PROFILE

.NOTES
    环境变量：
      DSH_REPO    DSH 源码仓库路径（默认 $HOME\deepseek-harness）
      MC_PROFILE  profile 名（默认 minecraft）
      MC_AGENT_CMD 显式指定要执行的命令（最高优先级；bot\ingame.js 也认这个变量）
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$Task,

    [switch]$Json,
    [string]$SessionId,
    [string]$Profile
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'tools\_common.ps1')
Initialize-Utf8Console

$RepoRoot = Get-RepoRoot
$DshRepoDefault = Join-Path $HOME 'deepseek-harness'
$DshRepo = if ($env:DSH_REPO) { $env:DSH_REPO } else { $DshRepoDefault }
$ProfileName = if ($Profile) { $Profile } elseif ($env:MC_PROFILE) { $env:MC_PROFILE } else { 'minecraft' }

# 开关也能从环境变量来。这不是冗余：**PowerShell 5.1 用 `-File` 启动脚本时，
# `--json` 这类以 `--` 开头的参数收不到**（实测 `powershell -File run-agent.ps1
# --json <task>` 里 harness 只收到任务文本，没有 --json，于是输出纯文本而不是
# NDJSON）。而 bot/ingame.js 正是用 `-File` 拉起本脚本的，所以它一直拿不到
# `session`/`final` 事件，表现为"退出码 0 但没有回答"。
# 走环境变量就完全绕开命令行解析。命令行参数仍然优先，保持兼容。
$JsonRequested = $Json -or ($env:MC_AGENT_JSON -eq '1')
$SessionIdValue = if ($SessionId) { $SessionId } else { $env:MC_AGENT_SESSION_ID }

function Write-Err2 { param([string]$m) Write-Host $m -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 组装要传给 harness 的参数
#
# 必须用**普通数组**（@() + +=），不能用 List[string] + .ToArray()：
# 想把它 splat 成多个 argv 时，`@($list.ToArray())` 会被 PowerShell 当成
# 「一个元素是数组」的嵌套数组，于是参数被塞成一个字符串传给 node，
# harness 收到的任务文本是错的 —— 表现为**退出码 0 但没有任何回答**
# （本机实测：直接 dsh 能答，走本脚本就哑了）。普通数组 @() 没有这个坑。
# ---------------------------------------------------------------------------
$agentArgs = @()
$agentArgs += @('--profile', $ProfileName)
if ($JsonRequested) { $agentArgs += '--json' }
if ($SessionIdValue) { $agentArgs += @('--session-id', $SessionIdValue) }
if ($Task -and $Task.Count -gt 0) {
    # 任务描述可能含空格，但它必须是**单个** argv 元素
    $agentArgs += ($Task -join ' ')
}

# ---------------------------------------------------------------------------
# 决定怎么启动
# ---------------------------------------------------------------------------
# 两个必须踩过才知道的坑：
#
# 1) stderr：harness 与它的 MCP 子进程都往 **stderr** 写日志（MCP 协议要求
#    stdout 只走 JSON-RPC，日志必须走 stderr）。在 $ErrorActionPreference='Stop'
#    下，原生命令写 stderr 会被当成 NativeCommandError 终止错误，脚本会在任务
#    真正开始前就退出（实测只打印了 `[mc-mcp] MCP server ready` 然后 exit 1）。
#    → 调用 harness 期间临时切回 Continue。
#
# 2) stdout：原生命令的 stdout 会被 PowerShell 收进**函数返回值**。如果直接
#    `exit (Invoke-Harness ...)`，返回的就成了 @(<回答文本>, <退出码>) 这样一个
#    集合，`exit` 只吃最后一个元素当退出码，**回答文本被丢弃** —— 表现为
#    "退出码 0 但 stdout 一个字节都没有"（实测：函数内明明拿到了回答，
#    文件里记录了 `INVOKE returned=机器人位于…`，控制台却什么都没有）。
#    → 用 `| Out-Host` 把子进程 stdout 写回控制台，让函数只返回退出码。
function Invoke-Harness {
    param([string]$Exe, [object[]]$Arguments, [string[]]$PreArgs = @())
    $savedEap = $ErrorActionPreference
    $savedNative = $null
    try {
        $ErrorActionPreference = 'Continue'
        if ($PSVersionTable.PSVersion.Major -ge 7) {
            $savedNative = $PSNativeCommandUseErrorActionPreference
            $PSNativeCommandUseErrorActionPreference = $false
        }
        Set-Location $RepoRoot
        if ($PreArgs.Count -gt 0) {
            & $Exe @PreArgs @Arguments | Out-Host
        } else {
            & $Exe @Arguments | Out-Host
        }
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedEap
        if ($null -ne $savedNative) { $PSNativeCommandUseErrorActionPreference = $savedNative }
    }
}

# 1) 用户显式指定
if ($env:MC_AGENT_CMD) {
    $exe = $env:MC_AGENT_CMD
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue) -and -not (Test-Path -LiteralPath $exe)) {
        throw "MC_AGENT_CMD 指向的命令不存在: $exe"
    }
    exit (Invoke-Harness -Exe $exe -Arguments $agentArgs)
}

# 2) 源码 checkout：显式指定 tsx 的 tsconfig，避免 FiberState 假故障
$binTs = Join-Path $DshRepo 'apps\cli\src\bin.ts'
if (Test-Path -LiteralPath $binTs) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw '找不到 node，请先安装 Node.js 并把 node 加进 PATH' }

    if (-not $env:TSX_TSCONFIG_PATH) {
        # 优先用 tsconfig.base.json：根 tsconfig.json 只是 solution 文件
        # （files: [] + references），而 paths 真正在 base 里。tsx 用根文件时
        # 在本机实测会丢 @deepseek-ai/* 映射，报 52 个插件 "failed to import"。
        $baseCfg = Join-Path $DshRepo 'tsconfig.base.json'
        $tsconfig = if (Test-Path -LiteralPath $baseCfg) { $baseCfg } else { Join-Path $DshRepo 'tsconfig.json' }
        if (-not (Test-Path -LiteralPath $tsconfig)) {
            throw "找不到 tsconfig（DSH 源码 checkout 不完整？试过 tsconfig.base.json / tsconfig.json）"
        }
        $env:TSX_TSCONFIG_PATH = $tsconfig
    }

    # tsx 的解析必须相对 DSH 仓库（它是仓库的依赖，不在本项目里）。
    # 用一个临时 .js 文件而不是 node -e：避免 PowerShell 5.1 对内联引号的转义差异，
    # 也避免 native stderr 污染 $tsx 的取值。
    $resolver = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-tsx-resolve-{0}.js" -f $PID)
    $resolverBody = @"
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const req = createRequire(process.argv[2] + '/package.json')
// 必须输出 file:// URL：node --import 在 Windows 上不接受裸盘符路径
// （ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'd:'）。
process.stdout.write(pathToFileURL(req.resolve('tsx/esm')).href)
"@
    Set-Content -LiteralPath $resolver -Value $resolverBody -Encoding ASCII
    try {
        $savedEap = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try { $tsx = (& $node.Source $resolver $DshRepo 2>$null | Out-String).Trim() }
        finally { $ErrorActionPreference = $savedEap }
    } finally {
        Remove-Item -LiteralPath $resolver -Force -ErrorAction SilentlyContinue
    }
    if (-not $tsx -or $tsx -notlike 'file:*') {
        throw "在 $DshRepo 里解析不到 tsx/esm（得到：'$tsx'）。先在 DSH 仓库执行一次 pnpm install。"
    }

    exit (Invoke-Harness -Exe $node.Source -PreArgs @('--import', $tsx) -Arguments (@($binTs) + $agentArgs))
}

# 3) npm 全局安装的 dsh
$dsh = Get-Command dsh -ErrorAction SilentlyContinue
if ($dsh) {
    exit (Invoke-Harness -Exe $dsh.Source -Arguments $agentArgs)
}

# 4) 都没有：给出可操作的提示
Write-Err2 '找不到 DeepSeek Harness。'
Write-Err2 ''
Write-Err2 '已尝试：'
Write-Err2 "  1. 源码 checkout：$binTs（不存在）"
Write-Err2 '  2. PATH 上的 dsh 命令（不存在）'
Write-Err2 ''
Write-Err2 '补法（任选其一）：'
Write-Err2 '  全局安装：  npm i -g @deepseek-ai/dsh'
Write-Err2 "  指向源码：  `$env:DSH_REPO = 'D:\path\to\deepseek-harness'"
Write-Err2 "  直接指定：  `$env:MC_AGENT_CMD = 'C:\path\to\dsh.cmd'"
Write-Err2 ''
Write-Err2 '提示：本项目还需要在 DSH 里配置 minecraft profile 的 MCP 接入，见 README「配置要点」。'
exit 1
