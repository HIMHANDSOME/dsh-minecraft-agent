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

function Write-Err2 { param([string]$m) Write-Host $m -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 组装要传给 harness 的参数
# ---------------------------------------------------------------------------
$agentArgs = New-Object System.Collections.Generic.List[string]
$agentArgs.Add('--profile'); $agentArgs.Add($ProfileName)
if ($Json) { $agentArgs.Add('--json') }
if ($SessionId) { $agentArgs.Add('--session-id'); $agentArgs.Add($SessionId) }
if ($Task -and $Task.Count -gt 0) {
    # 任务描述可能含空格，但它是单个 argv 元素；PowerShell 的 & 调用运算符会正确传参
    $agentArgs.Add(($Task -join ' '))
}

# ---------------------------------------------------------------------------
# 决定怎么启动
# ---------------------------------------------------------------------------
# 1) 用户显式指定
if ($env:MC_AGENT_CMD) {
    $exe = $env:MC_AGENT_CMD
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue) -and -not (Test-Path -LiteralPath $exe)) {
        throw "MC_AGENT_CMD 指向的命令不存在: $exe"
    }
    Set-Location $RepoRoot
    & $exe @agentArgs
    exit $LASTEXITCODE
}

# 2) 源码 checkout：显式指定 tsx 的 tsconfig，避免 FiberState 假故障
$binTs = Join-Path $DshRepo 'apps\cli\src\bin.ts'
if (Test-Path -LiteralPath $binTs) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw '找不到 node，请先安装 Node.js 并把 node 加进 PATH' }

    $tsconfig = Join-Path $DshRepo 'tsconfig.json'
    if (-not (Test-Path -LiteralPath $tsconfig)) {
        throw "找不到 $tsconfig（DSH 源码 checkout 不完整？）"
    }
    if (-not $env:TSX_TSCONFIG_PATH) { $env:TSX_TSCONFIG_PATH = $tsconfig }

    # tsx 的解析必须相对 DSH 仓库（它是仓库的依赖，不在本项目里）。
    # 用一个临时 .js 文件而不是 node -e：避免 PowerShell 5.1 对内联引号的转义差异，
    # 也避免 native stderr 污染 $tsx 的取值。
    $resolver = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-tsx-resolve-{0}.js" -f $PID)
    $resolverBody = @"
const { createRequire } = require('node:module')
const req = createRequire(process.argv[2] + '/package.json')
process.stdout.write(req.resolve('tsx/esm'))
"@
    Set-Content -LiteralPath $resolver -Value $resolverBody -Encoding ASCII
    try {
        $tsx = (& $node.Source $resolver $DshRepo 2>$null | Out-String).Trim()
    } finally {
        Remove-Item -LiteralPath $resolver -Force -ErrorAction SilentlyContinue
    }
    if (-not $tsx -or -not (Test-Path -LiteralPath $tsx)) {
        throw "在 $DshRepo 里解析不到 tsx/esm（得到：'$tsx'）。先在 DSH 仓库执行一次 pnpm install。"
    }

    Set-Location $RepoRoot
    & $node.Source --import $tsx $binTs @agentArgs
    exit $LASTEXITCODE
}

# 3) npm 全局安装的 dsh
$dsh = Get-Command dsh -ErrorAction SilentlyContinue
if ($dsh) {
    Set-Location $RepoRoot
    & $dsh.Source @agentArgs
    exit $LASTEXITCODE
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
