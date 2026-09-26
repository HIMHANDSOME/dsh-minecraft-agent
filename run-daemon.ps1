<#
.SYNOPSIS
    常驻机器人 daemon（Windows 版）：持有 Minecraft 连接 + 提供 MCP(streamable-http) + 游戏内私聊交互。

.DESCRIPTION
    与 run-daemon.sh 功能对等，参数语义完全一致。

    为什么需要它：玩家用 `/msg DeepSeekBot <内容>` 时机器人必须**一直在线**才收得到私聊。
    一次性的 run-agent.ps1 是每次任务拉起一个进程、跑完就断开，不满足这个前提。

    用法：
      .\run-daemon.ps1 start      启动（等 MCP 就绪后返回）
      .\run-daemon.ps1 stop       停止
      .\run-daemon.ps1 restart
      .\run-daemon.ps1 status     状态（含机器人是否在线）
      .\run-daemon.ps1 logs       跟随日志

    环境变量：
      MC_MCP_PORT        MCP HTTP 端口（默认 8790）
      MC_INGAME_ALLOW    允许使用私聊控制的玩家名（逗号分隔；不设 = 所有人。本机服默认即可）
      MC_USER            机器人用户名（默认 DeepSeekBot）

.NOTES
    常驻模式会设 MC_NO_PUBLIC_CHAT=1：mc_chat 带 message 时直接返回结构化错误，
    从**服务端**堵死"Agent 把结果广播到公共聊天"这条路（软提示词约束不住）。
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'restart', 'status', 'logs', 'help')]
    [string]$Action = 'status',

    [int]$Port,
    [switch]$Foreground
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'tools\_common.ps1')
Initialize-Utf8Console

$Port = if ($Port) { $Port } elseif ($env:MC_MCP_PORT) { [int]$env:MC_MCP_PORT } else { 8790 }
$LogsDir = Get-LogsDir
$LogPath = Join-Path $LogsDir 'daemon.log'
$PidName = 'daemon'
$PidPath = Get-PidRecordPath -Name $PidName
$DaemonScript = Join-Path (Get-RepoRoot) 'bot\mcp-server.js'

function Write-Info { param([string]$m) Write-Host $m }
function Write-Warn2 { param([string]$m) Write-Host $m -ForegroundColor Yellow }
function Write-Err2 { param([string]$m) Write-Host $m -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 进程与健康检查
# ---------------------------------------------------------------------------
function Get-RunningDaemon {
    $rec = Read-PidRecord -Name $PidName
    if (-not $rec) { return $null }
    $proc = Get-Process -Id ([int]$rec.pid) -ErrorAction SilentlyContinue
    if (-not $proc) { Clear-PidRecord -Name $PidName; return $null }
    # PID 可能被复用：要求它还是 node 进程
    if ($proc.ProcessName -notlike 'node*') { Clear-PidRecord -Name $PidName; return $null }
    return $rec
}

function Get-Health {
    param([int]$TimeoutSec = 3)
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec $TimeoutSec -ErrorAction Stop
        return $r
    } catch {
        return $null
    }
}

function Get-DaemonNodeLogs {
    <# 返回 node 的 stdout/stderr 日志路径（新记录优先，回退到默认名）。 #>
    $rec = Read-PidRecord -Name $PidName
    if ($rec) {
        $names = $rec.PSObject.Properties.Name
        if (($names -contains 'nodeOut') -and $rec.nodeOut) {
            return @($rec.nodeOut, $rec.nodeErr)
        }
    }
    return @((Join-Path $LogsDir 'daemon-node.out.log'), (Join-Path $LogsDir 'daemon-node.err.log'))
}

function Wait-Health {
    param([int]$Seconds = 60)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        $h = Get-Health
        if ($h) { return $h }
        Start-Sleep -Seconds 1
    }
    return $null
}

# ---------------------------------------------------------------------------
# start
# ---------------------------------------------------------------------------
function Start-Daemon {
    $running = Get-RunningDaemon
    if ($running) {
        Write-Info "已在运行 (pid $($running.pid))"
        return
    }

    if (-not (Test-Path -LiteralPath $DaemonScript)) {
        throw "找不到 $DaemonScript"
    }
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw '找不到 node，请先安装 Node.js 并把 node 加进 PATH' }

    # 依赖检查：node_modules 不在就明确提醒，而不是让 node 抛 MODULE_NOT_FOUND
    if (-not (Test-Path -LiteralPath (Join-Path (Get-RepoRoot) 'bot\node_modules'))) {
        throw 'bot\node_modules 不存在。先执行：cd bot; npm install'
    }

    if (-not (Test-Path -LiteralPath $LogsDir)) {
        New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
    }

    # bash 版把 stdout/stderr 一起追加进 daemon.log；这里保留旧日志（append 语义）
    Add-RunLog -Path $LogPath -Message "===== run-daemon.ps1 start (port=$Port) ====="

    # 常驻模式必须禁止公共聊天（硬约束，见 ingame.js 的注释）
    $env:MC_NO_PUBLIC_CHAT = '1'

    $nodeArgs = @($DaemonScript, '--http', "$Port", '--ingame')
    Write-Info "启动中 pid 待定，等待机器人上线 (port=$Port) ..."

    if ($Foreground) {
        Write-Info '前台运行（Ctrl+C 停止）'
        Push-Location (Get-RepoRoot)
        try {
            & $node.Source @nodeArgs
        } finally {
            Pop-Location
        }
        return
    }

    # bash 版是 `nohup node ... >> "$LOG" 2>&1`。Windows 上 Start-Process 的重定向是
    # **覆盖**语义，且**不允许 stdout 与 stderr 指向同一个文件**（会直接报
    # "RedirectStandardOutput and RedirectStandardError are same"），所以分成两个文件；
    # `run-daemon.ps1 logs` 与 status 会同时看这两个。
    $nodeOut = Join-Path $LogsDir 'daemon-node.out.log'
    $nodeErr = Join-Path $LogsDir 'daemon-node.err.log'
    $nodeErrPath = $nodeErr
    Remove-Item -LiteralPath $nodeOut, $nodeErr -Force -ErrorAction SilentlyContinue

    $proc = Start-Process -FilePath $node.Source `
        -ArgumentList @($DaemonScript, '--http', "$Port", '--ingame') `
        -WorkingDirectory (Get-RepoRoot) `
        -RedirectStandardOutput $nodeOut `
        -RedirectStandardError $nodeErr `
        -WindowStyle Hidden -PassThru

    Save-PidRecord -Name $PidName -ProcessId $proc.Id -Extra @{
        port    = $Port
        script  = $DaemonScript
        log     = $LogPath
        nodeOut = $nodeOut
        nodeErr = $nodeErr
    }

    # 两阶段等待：先等 MCP HTTP 起来（/health 有响应），再等**机器人真的登入**
    # （health.connected === true）。只看 /health 会误报"就绪"——HTTP 服务几乎
    # 立刻可用，而 mineflayer 还要 5~15s 才 spawn 进世界。
    Write-Host -NoNewline "启动中 pid=$($proc.Id)，等待 MCP 就绪"
    $deadline = (Get-Date).AddSeconds(60)
    $health = $null
    while ((Get-Date) -lt $deadline) {
        if ($proc.HasExited) { break }
        $health = Get-Health
        if ($health) { break }
        Write-Host -NoNewline '.'
        Start-Sleep -Seconds 1
    }

    if ($health) {
        Write-Host -NoNewline ' 就绪；等机器人在线'
        $deadline = (Get-Date).AddSeconds(60)
        while ((Get-Date) -lt $deadline) {
            if ($proc.HasExited) { break }
            $h = Get-Health
            if ($h -and $h.connected) { $health = $h; break }
            Write-Host -NoNewline '.'
            Start-Sleep -Seconds 1
        }
    }
    Write-Host ''

    if ($health) {
        if ($health.connected) {
            Write-Info " 就绪：机器人 $($health.username) 已登入 $($health.version)"
            Write-Info "  $($health | ConvertTo-Json -Compress -Depth 4)"
            return
        }
        # HTTP 起来了但机器人还没进世界 —— 不算失败（服务器可能没开），如实报告
        Write-Warn2 ' MCP 已就绪，但机器人**尚未登入**（服务器没起？端口不对？）'
        Write-Warn2 "  $($health | ConvertTo-Json -Compress -Depth 4)"
        Write-Warn2 "  排查：服务器是否在跑（.\run-server.ps1 status）、MC_PORT/MC_HOST 是否正确"
        Write-Warn2 "  日志：$($nodeErrPath)"
        return
    }

    if ($proc.HasExited) {
        Write-Err2 "daemon 进程已退出（exit code $($proc.ExitCode)）。日志尾部："
        if (Test-Path -LiteralPath $LogPath) { Get-Content -LiteralPath $LogPath -Tail 30 | ForEach-Object { Write-Err2 $_ } }
        Clear-PidRecord -Name $PidName
        throw 'daemon 启动失败'
    }

    Write-Warn2 "等待超时（60s）。可能的端口冲突："
    $owners = @(Get-PortOwner -Port $Port)
    if ($owners.Count -gt 0) {
        Write-Warn2 "  端口 $Port 被 PID $($owners -join ', ') 占用。换端口：`$env:MC_MCP_PORT=8791; .\run-daemon.ps1 start"
    }
    Write-Warn2 "  看日志：$LogPath"
}

# ---------------------------------------------------------------------------
# stop
# ---------------------------------------------------------------------------
function Stop-Daemon {
    $rec = Get-RunningDaemon
    if (-not $rec) {
        Write-Info '未在运行'
        Clear-PidRecord -Name $PidName
        return
    }

    $daemonPid = [int]$rec.pid

    # 先收掉它拉起的子进程（每个 in-game turn 都是一个 dsh/node 子进程）
    try {
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $daemonPid" -ErrorAction SilentlyContinue)
        foreach ($c in $children) {
            Write-Info "  结束子进程 pid=$($c.ProcessId) $($c.Name)"
            try { Stop-Process -Id ([int]$c.ProcessId) -Force -ErrorAction Stop } catch { }
        }
    } catch { }

    try { Stop-Process -Id $daemonPid -ErrorAction Stop } catch { }

    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-Process -Id $daemonPid -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 500
    }
    if (Get-Process -Id $daemonPid -ErrorAction SilentlyContinue) {
        try { Stop-Process -Id $daemonPid -Force -ErrorAction Stop } catch { }
    }

    Clear-PidRecord -Name $PidName
    Remove-Item Env:\MC_NO_PUBLIC_CHAT -ErrorAction SilentlyContinue
    Write-Info '已停止'
}

# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------
function Get-DaemonStatus {
    $rec = Get-RunningDaemon
    if (-not $rec) {
        Write-Info '未运行'
        return
    }
    Write-Info "运行中 pid=$($rec.pid)"
    $h = Get-Health
    if ($h) {
        Write-Info "  health: $($h | ConvertTo-Json -Compress -Depth 4)"
    } else {
        Write-Warn2 "  health 无响应（http://127.0.0.1:$Port/health）"
    }
    Write-Info ''
    Write-Info '最近 ingame 记录:'
    $lines = @()
    foreach ($p in (@(Get-DaemonNodeLogs) + @($LogPath))) {
        foreach ($l in (Get-LogLines -Path $p)) {
            if ($l -like '*[ingame]*') { $lines += $l }
        }
    }
    if ($lines.Count -gt 0) {
        foreach ($l in ($lines | Select-Object -Last 5)) { Write-Info "  $l" }
    } else {
        Write-Info '  (暂无)'
    }
}

# ---------------------------------------------------------------------------
# logs：同时跟随 node 原始输出与 wrapper 通知
# ---------------------------------------------------------------------------
function Show-DaemonLogs {
    $logs = Get-DaemonNodeLogs
    $existing = @($logs | Where-Object { Test-Path -LiteralPath $_ })
    if ($existing.Count -eq 0) {
        if (Test-Path -LiteralPath $LogPath) {
            Write-Info "（node 日志尚未生成，改跟随 $LogPath）"
            Start-LogTail -Path $LogPath
            return
        }
        Write-Warn2 '还没有日志。先 .\run-daemon.ps1 start'
        return
    }
    Write-Info "node 输出：$($existing -join ' , ')"
    Write-Info "wrapper 通知：$LogPath"
    Start-LogTail -Path $existing[0]
}

# ---------------------------------------------------------------------------
# 分发
# ---------------------------------------------------------------------------
try {
    switch ($Action) {
        'start' { Start-Daemon }
        'stop' { Stop-Daemon }
        'restart' { Stop-Daemon; Start-Daemon }
        'status' { Get-DaemonStatus }
        'logs' { Show-DaemonLogs }
        'help' { Get-Help $PSCommandPath -Detailed }
    }
} catch {
    Write-Err2 ''
    Write-Err2 "错误: $($_.Exception.Message)"
    exit 1
}
