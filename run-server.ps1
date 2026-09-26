<#
.SYNOPSIS
    本机 Minecraft 26.1 沙箱专用服务器 —— 启动 / 停止 / 状态 / 控制台 / 重置世界（Windows 版）。

.DESCRIPTION
    与 run-server.sh 功能对等，参数语义完全一致。

    用法：
      .\run-server.ps1 start                 启动（后台，就绪后自动返回）
      .\run-server.ps1 stop                  停止
      .\run-server.ps1 restart               重启
      .\run-server.ps1 status                状态
      .\run-server.ps1 cmd "<指令>"          发一条服务器控制台指令（give / setblock / time set day ...）
      .\run-server.ps1 tail                  跟随日志
      .\run-server.ps1 reset-world           停服 → 删除沙箱世界 → 重启
      .\run-server.ps1 java                  只探测 Java 25 并打印结果（不动服务器）

    常用参数：
      -Java <path>   指定 java.exe（优先级最高）
      -Mem  <size>   最大堆，默认 2G（等价 MC_MEM）
      -Foreground    不后台化：把服务端跑在当前窗口（Ctrl+C 停止）
      -NoWait        启动后不等 "Done"，立刻返回

    安全说明：
      - 只监听 127.0.0.1，online-mode=false，仅本机 bot 沙箱使用。
      - 控制台走**本机命名管道**（\\.\pipe\mc-console-<hash>），不开启 RCON、
        不开放任何网络管理端口。
      - 不会碰你的个人存档（%APPDATA%\.minecraft\saves）。

.NOTES
    需要 Java 主版本 >= 25（Minecraft 26.1 的硬要求）。
    找不到时运行 .\tools\install-java-win.ps1 自动获取。
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'restart', 'status', 'cmd', 'tail', 'reset-world', 'java', 'help')]
    [string]$Action = 'status',

    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$CmdArgs,

    [string]$Java,
    [string]$Mem,
    [switch]$Foreground,
    [switch]$NoWait
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'tools\_common.ps1')
Initialize-Utf8Console

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------
$ServerDir = Get-ServerDir
$ConsoleLog = Join-Path $ServerDir 'console.log'
$HostLog = Join-Path $ServerDir 'console-host.log'
$JarPath = Join-Path $ServerDir 'server.jar'
$EulaPath = Join-Path $ServerDir 'eula.txt'
$PropsPath = Join-Path $ServerDir 'server.properties'
$PidName = 'server'
$PidPath = Get-PidRecordPath -Name $PidName
$MemSize = if ($Mem) { $Mem } elseif ($env:MC_MEM) { $env:MC_MEM } else { '2G' }

# 命名管道名字：带仓库目录哈希，避免同机多个 checkout 互相串台
$hashInput = (Get-RepoRoot).ToLowerInvariant()
$sha1 = [System.Security.Cryptography.SHA1]::Create()
$hash = [System.BitConverter]::ToString($sha1.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($hashInput))).Replace('-', '').Substring(0, 8)
$PipeName = "mc-console-$hash"

# 用于确认 PID 确实是我们的服务端，而不是被系统复用的陌生进程
$CmdMatch = 'server.jar'

function Write-Info { param([string]$m) Write-Host $m }
function Write-Warn2 { param([string]$m) Write-Host $m -ForegroundColor Yellow }
function Write-Err2 { param([string]$m) Write-Host $m -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 环境检查
# ---------------------------------------------------------------------------
function Assert-ServerReady {
    if (-not (Test-Path -LiteralPath $ServerDir)) {
        New-Item -ItemType Directory -Force -Path $ServerDir | Out-Null
    }
    if (-not (Test-Path -LiteralPath $JarPath)) {
        Write-Err2 "缺少 $JarPath"
        Write-Host ''
        Write-Host '请从 Mojang 官方下载 26.1 服务端（SHA1 见 recon.md）：'
        Write-Host '  https://piston-data.mojang.com/v1/objects/3872a7f07a1a595e651aef8b058dfc2bb3772f46/server.jar'
        Write-Host ''
        Write-Host "保存为：$JarPath"
        throw 'server.jar 不存在'
    }
    if (-not (Test-Path -LiteralPath $PropsPath)) {
        $example = Join-Path (Get-RepoRoot) 'server.properties.example'
        Write-Warn2 "缺少 $PropsPath，从 server.properties.example 复制一份"
        if (Test-Path -LiteralPath $example) {
            Copy-Item -LiteralPath $example -Destination $PropsPath
            Write-Info "  已复制：$PropsPath"
        } else {
            throw "找不到模板 $example"
        }
    }
    if (-not (Test-Path -LiteralPath $EulaPath)) {
        # 等价于 bash 版的 printf 'eula=true\n' > eula.txt
        Set-Content -LiteralPath $EulaPath -Value 'eula=true' -Encoding ASCII
        Write-Info '  已写入 eula.txt（eula=true，Minecraft 服务端首次启动必需）'
    }
}

function Get-RunningServer {
    $rec = Read-PidRecord -Name $PidName
    if (-not $rec) { return $null }
    if (Test-PidAlive -ProcessId ([int]$rec.pid) -Match $CmdMatch) { return $rec }
    Clear-PidRecord -Name $PidName
    return $null
}

# ---------------------------------------------------------------------------
# 控制台宿主：一个脱离的后台 PowerShell 进程，持有服务端 stdin 并监听命名管道
#
# 为什么需要它：Windows 没有 mkfifo，无法像 bash 版那样把命令写进 server.in。
# Start-Process 创建的进程不随父进程退出（已实测：Start-Job 的子进程会随父进程
# 一起死，所以不能用后台作业）。宿主持有 java 的 stdin，把命名管道上收到的每一条
# 指令转发进去，stdout/stderr 则重定向到 console.log。
#
# 参数全部通过环境变量传递（MC_HOST_*），彻底避开 Start-Process -ArgumentList
# 的引号与空格转义问题。
# ---------------------------------------------------------------------------
function Get-ConsoleHostScript {
    @'
$ErrorActionPreference = 'Continue'

$ServerDir = $env:MC_HOST_SERVER_DIR
$JavaExe   = $env:MC_HOST_JAVA
$MemSize   = $env:MC_HOST_MEM
$PipeName  = $env:MC_HOST_PIPE
$LogPath   = $env:MC_HOST_LOG
$PidName   = $env:MC_HOST_PID_NAME

$hostLog = Join-Path (Split-Path -Parent $LogPath) 'console-host.log'
function Host-Log { param($m) try { Add-Content -LiteralPath $hostLog -Value ("[{0}] {1}" -f (Get-Date).ToString('HH:mm:ss'), $m) -Encoding UTF8 } catch {} }

Host-Log "host starting (pid $PID); java=$JavaExe mem=$MemSize pipe=$PipeName"

function New-ConsolePipe {
    New-Object System.IO.Pipes.NamedPipeServerStream(
        $PipeName,
        [System.IO.Pipes.PipeDirection]::In,
        1,
        [System.IO.Pipes.PipeTransmissionMode]::Byte,
        [System.IO.Pipes.PipeOptions]::None)
}

# ---- 启动 java ----
# console.log 由下面的输出泵（独立 runspace）以 FileShare.ReadWrite 打开并写入，
# 这样 run-server.ps1 tail 能同时读它。
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $JavaExe
$psi.Arguments = "-Xms1G -Xmx$MemSize -jar server.jar nogui"
$psi.WorkingDirectory = $ServerDir
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi

if (-not $proc.Start()) { Host-Log 'FAILED to start java'; exit 1 }

# ---- 输出泵：必须在**独立 runspace** 里跑 ----
# 为什么不能用 BeginOutputReadLine + OutputDataReceived：那些回调要在线程池上
# 进入本 runspace 执行，而主机线程正阻塞在 $pipe.WaitForConnection() 上 ——
# 单线程 runspace 不可重入，回调永远排不上，console.log 会一直是空的。
# （第一版就是这么死的：java 起来了、日志 0 字节。）
$stdout = $proc.StandardOutput
$stderr = $proc.StandardError

# pump 在自己的 runspace 里创建 writer（避免跨 runspace 传对象）
$pumpScript = {
    param($Out, $Err, $LogPath)
    $enc = New-Object System.Text.UTF8Encoding $false
    $fs = New-Object System.IO.FileStream($LogPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
    $sw = New-Object System.IO.StreamWriter($fs, $enc)
    $sw.AutoFlush = $true
    $tOut = $Out.ReadLineAsync()
    $tErr = $Err.ReadLineAsync()
    while ($true) {
        # 两条流各等最多 200ms，避免偏向任意一条
        $null = [System.Threading.Tasks.Task]::WaitAny(@($tOut, $tErr), 200)
        if ($tOut.IsCompleted) {
            $l = $tOut.Result
            if ($null -eq $l) { break }
            $sw.WriteLine($l)
            $tOut = $Out.ReadLineAsync()
        }
        if ($tErr.IsCompleted) {
            $l = $tErr.Result
            if ($null -eq $l) { break }
            $sw.WriteLine($l)
            $tErr = $Err.ReadLineAsync()
        }
    }
    try { $sw.Flush(); $sw.Dispose(); $fs.Dispose() } catch { }
}

# 记录 PID，供 run-server.ps1 stop 精确定位
$pidPath = Join-Path $ServerDir "$PidName.pid.json"
$rec = [ordered]@{
    name      = $PidName
    pid       = $proc.Id
    hostPid   = $PID
    startedAt = (Get-Date).ToString('o')
    host      = $env:COMPUTERNAME
    java      = $JavaExe
    pipe      = $PipeName
}
try { $rec | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $pidPath -Encoding UTF8 } catch { Host-Log "pid record failed: $($_.Exception.Message)" }

Host-Log "java started pid=$($proc.Id); host pid=$PID"

# ---- stdin 写入器 ----
# StreamWriter 的内建 buffer 是 1KB。Java 的 System.in 读到一行就返回，所以只要
# buffer 被及时 flush，写入就不会阻塞到"管道满"。用一个独立 runspace 每 100ms
# Flush 一次，把主机线程要面对的 buffer 空间始终维持得住。
$stdin = $proc.StandardInput
$stdin.AutoFlush = $true

$drainScript = {
    param($writer)
    while ($true) {
        try { $writer.Flush() } catch { return }
        Start-Sleep -Milliseconds 100
    }
}

$pump = [PowerShell]::Create()
$null = $pump.AddScript($pumpScript.ToString())
$null = $pump.AddArgument($stdout)
$null = $pump.AddArgument($stderr)
$null = $pump.AddArgument($LogPath)
$pumpHandle = $pump.BeginInvoke()

$drain = [PowerShell]::Create()
$null = $drain.AddScript($drainScript.ToString())
$null = $drain.AddArgument($stdin)
$drainHandle = $drain.BeginInvoke()

Host-Log 'output pump + stdin drain started'

# ---- 命名管道：一条连接 = 一条指令 ----
$pipe = New-ConsolePipe
Host-Log 'console pipe listening'

while (-not $proc.HasExited) {
    try {
        $pipe.WaitForConnection()
    } catch {
        Host-Log "WaitForConnection failed: $($_.Exception.Message)"
        break
    }

    $line = $null
    try {
        $sr = New-Object System.IO.StreamReader($pipe, [System.Text.Encoding]::UTF8)
        $line = $sr.ReadLine()
    } catch {
        Host-Log "read failed: $($_.Exception.Message)"
    }

    if ($null -ne $line -and $line.Trim().Length -gt 0) {
        Host-Log "cmd: $line"
        $sent = $false
        foreach ($attempt in 1..40) {
            if ($proc.HasExited) { break }
            try {
                $stdin.WriteLine($line)
                $sent = $true
                break
            } catch {
                Start-Sleep -Milliseconds 250
            }
        }
        if (-not $sent) { Host-Log "cmd dropped (stdin unavailable): $line" }
    }

    try { $pipe.Disconnect() } catch { }
    try { $pipe.Dispose() } catch { }
    if ($proc.HasExited) { break }

    # NamedPipeServerStream 在 Disconnect 后必须重建才能再次等待连接
    $pipe = New-ConsolePipe
}

Host-Log 'java exited; host shutting down'
try { $proc.WaitForExit() } catch { }
try { $pipe.Dispose() } catch { }
# 让输出泵把 java 最后几行刷完，再收掉
try { $null = $pumpHandle.AsyncWaitHandle.WaitOne(4000) } catch { }
try { $pump.Stop(); $pump.Dispose() } catch { }
try { $drain.Stop(); $drain.Dispose() } catch { }
try { Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue } catch { }
exit 0
'@
}

function Send-ConsoleCommand {
    param([Parameter(Mandatory)][string]$Command)

    $client = New-Object System.IO.Pipes.NamedPipeClientStream('.', $PipeName, [System.IO.Pipes.PipeDirection]::Out)
    try {
        $connected = $false
        foreach ($attempt in 1..15) {
            try { $client.Connect(300); $connected = $true; break } catch { Start-Sleep -Milliseconds 200 }
        }
        if (-not $connected) {
            throw "无法连接控制台管道 $PipeName（服务器没在运行，或控制台宿主已退出；可试 restart）"
        }
        $sw = New-Object System.IO.StreamWriter($client, (New-Object System.Text.UTF8Encoding $false))
        $sw.AutoFlush = $true
        $sw.WriteLine($Command)
        $sw.Flush()
    } finally {
        try { $client.Dispose() } catch { }
    }
}

# ---------------------------------------------------------------------------
# start
# ---------------------------------------------------------------------------
function Start-Server {
    param([switch]$Blocking)

    $running = Get-RunningServer
    if ($running) {
        Write-Info "已在运行 (pid $($running.pid))"
        return
    }

    Assert-ServerReady
    $javaExe = Resolve-Java -Explicit $Java
    $major = Get-JavaMajorVersion -JavaExe $javaExe
    Write-Info "Java: $javaExe (主版本 $major)"

    if ($Blocking) {
        # 前台模式：直接在当前窗口跑，实时看输出。Ctrl+C 结束。
        # 注意：stdin 被管道占用，所以这个模式下没法在同一个窗口敲服务端指令；
        # 需要发指令就用后台模式，或用 .\run-server.ps1 cmd（另开一个窗口）。
        Write-Info "前台运行（Ctrl+C 停止）；日志同时写入 $ConsoleLog"
        Push-Location $ServerDir
        try {
            & $javaExe -Xms1G "-Xmx$MemSize" -jar server.jar nogui 2>&1 | Tee-Object -FilePath $ConsoleLog
        } finally {
            Pop-Location
        }
        return
    }

    Remove-Item -LiteralPath $ConsoleLog -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $HostLog -Force -ErrorAction SilentlyContinue
    Clear-PidRecord -Name $PidName

    $hostScript = Get-ConsoleHostScript
    # -EncodedCommand 走 Base64(UTF-16LE)，绕开所有引号与换行转义问题
    $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($hostScript))

    # 参数经环境变量传递：子进程默认继承父进程环境，无需传参、无引号风险
    $env:MC_HOST_SERVER_DIR = $ServerDir
    $env:MC_HOST_JAVA = $javaExe
    $env:MC_HOST_MEM = $MemSize
    $env:MC_HOST_PIPE = $PipeName
    $env:MC_HOST_LOG = $ConsoleLog
    $env:MC_HOST_PID_NAME = $PidName

    Write-Info "启动中 (mem=$MemSize, pipe=$PipeName) ..."
    $hostProc = Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded) `
        -WindowStyle Hidden -PassThru

    # 等宿主机写出 pid 记录
    $deadline = (Get-Date).AddSeconds(20)
    $rec = $null
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 300
        $rec = Read-PidRecord -Name $PidName
        if ($rec) { break }
        if ($hostProc.HasExited) { break }
    }
    if (-not $rec) {
        Write-Err2 '启动失败：控制台宿主没有写出 pid 记录。'
        if (Test-Path -LiteralPath $HostLog) {
            Write-Err2 '--- console-host.log ---'
            Get-Content -LiteralPath $HostLog -Tail 30 | ForEach-Object { Write-Err2 $_ }
        }
        throw '控制台宿主启动失败'
    }

    if ($NoWait) {
        Write-Info "已启动 (java pid $($rec.pid), host pid $($hostProc.Id))，未等待就绪"
        return
    }

    Write-Host -NoNewline '等待就绪'
    $deadline = (Get-Date).AddSeconds(180)
    $done = $false
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-PidAlive -ProcessId ([int]$rec.pid) -Match $CmdMatch)) { break }
        # 必须用共享安全的读取器：宿主一直开着 console.log，Select-String 会静默失败
        if (Find-LogLine -Path $ConsoleLog -Pattern 'Done (') { $done = $true; break }
        Write-Host -NoNewline '.'
        Start-Sleep -Seconds 1
    }
    Write-Host ''

    if ($done) {
        $line = Find-LogLine -Path $ConsoleLog -Pattern 'Done ('
        Write-Info " 就绪：$line"
        Write-Info ' 控制台：.\run-server.ps1 cmd "list"'
        return
    }

    if (-not (Test-PidAlive -ProcessId ([int]$rec.pid) -Match $CmdMatch)) {
        Write-Err2 '服务端进程已退出，启动失败。日志尾部：'
        foreach ($l in (Get-LogLines -Path $ConsoleLog -Tail 25)) { Write-Err2 $l }
        throw '服务端启动失败'
    }
    Write-Warn2 "等待超时（180s）。看看 $ConsoleLog"
}

# ---------------------------------------------------------------------------
# stop
# ---------------------------------------------------------------------------
function Stop-Server {
    $rec = Get-RunningServer
    if (-not $rec) {
        Write-Info '未在运行'
        Clear-PidRecord -Name $PidName
        return
    }

    $javaPid = [int]$rec.pid
    $hostPid = 0
    if ($rec.PSObject.Properties.Name -contains 'hostPid') { $hostPid = [int]$rec.hostPid }

    # 优雅停机：先走控制台发 stop，让服务端自己 flush 世界存档
    try {
        Write-Info '发送 stop 指令（优雅停机）…'
        Send-ConsoleCommand -Command 'stop'
    } catch {
        Write-Warn2 "无法通过控制台发送 stop：$($_.Exception.Message)"
    }

    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-PidAlive -ProcessId $javaPid -Match $CmdMatch)) { break }
        Start-Sleep -Milliseconds 500
    }

    if (Test-PidAlive -ProcessId $javaPid -Match $CmdMatch) {
        Write-Warn2 '优雅停机超时，强制结束进程'
        try { Stop-Process -Id $javaPid -Force -ErrorAction Stop } catch { }
        Start-Sleep -Milliseconds 800
    }

    if ($hostPid -gt 0 -and (Get-Process -Id $hostPid -ErrorAction SilentlyContinue)) {
        try { Stop-Process -Id $hostPid -Force -ErrorAction Stop } catch { }
    }

    Clear-PidRecord -Name $PidName
    Write-Info '已停止'
}

# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------
function Get-ServerStatus {
    $rec = Get-RunningServer
    if (-not $rec) {
        Write-Info '未运行'
        return
    }

    Write-Info "运行中 pid=$($rec.pid) (启动于 $($rec.startedAt))"
    $line = Find-LogLine -Path $ConsoleLog -Pattern 'Done ('
    if ($line) { Write-Info $line }

    if (Test-Path -LiteralPath $PropsPath) {
        $ip = Find-LogLine -Path $PropsPath -Pattern '^server-ip='
        $port = Find-LogLine -Path $PropsPath -Pattern '^server-port='
        Write-Info "监听: $ip / $port"
    }
    Write-Info '控制台通道: .\run-server.ps1 cmd "..."'

    $joins = Count-LogLine -Path $ConsoleLog -Pattern 'joined the game'
    Write-Info "加入记录: $joins 次"

    $owners = @(Get-PortOwner -Port 25565)
    if ($owners.Count -gt 0) {
        Write-Info "25565 端口占用 PID: $($owners -join ', ')"
    }
}

# ---------------------------------------------------------------------------
# reset-world
# ---------------------------------------------------------------------------
function Reset-World {
    Stop-Server
    foreach ($p in @((Join-Path $ServerDir 'world'), (Join-Path $ServerDir 'logs'))) {
        if (Test-Path -LiteralPath $p) {
            Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
            Write-Info "已删除 $p"
        }
    }
    Write-Info '沙箱世界已清空（玩家背包与地面掉落物一并重置）'
    Start-Server
}

# ---------------------------------------------------------------------------
# java 探测
# ---------------------------------------------------------------------------
function Show-JavaReport {
    Write-Info "仓库: $(Get-RepoRoot)"
    Write-Info "要求: Java 主版本 >= $script:RequiredJavaMajor（Minecraft 26.1）"
    Write-Info ''
    $cands = @(Get-JavaCandidates -Explicit $Java)
    if ($cands.Count -eq 0) {
        Write-Warn2 '没有找到任何 java.exe'
        Write-Host ''
        Write-Host (New-JavaHelpMessage -Reason '没有找到任何 java.exe' -Seen @())
        return
    }
    Write-Info "探测到 $($cands.Count) 个候选："
    $usable = $null
    foreach ($c in $cands) {
        $major = Get-JavaMajorVersion -JavaExe $c.Path
        $okMark = if ($null -ne $major -and $major -ge $script:RequiredJavaMajor) { '[OK]  ' } else { '[不足]' }
        $shown = if ($null -eq $major) { '未知' } else { $major }
        Write-Host ("  {0} 主版本 {1,-4} {2}" -f $okMark, $shown, $c.Path)
        Write-Host ("         来源: {0}" -f $c.Source) -ForegroundColor DarkGray
        if (-not $usable -and $null -ne $major -and $major -ge $script:RequiredJavaMajor) { $usable = $c.Path }
    }
    Write-Info ''
    if ($usable) {
        Write-Info "可用: $usable"
        $raw = (Get-JavaRawVersion -JavaExe $usable) -split "`r?`n" | Select-Object -First 1
        Write-Info "  $raw"
    } else {
        Write-Warn2 '没有满足要求的 Java。'
        Write-Host ''
        Write-Host (New-JavaHelpMessage -Reason '现有 Java 主版本都低于要求' -Seen @())
    }
}

# ---------------------------------------------------------------------------
# 分发
# ---------------------------------------------------------------------------
try {
    switch ($Action) {
        'start' { Start-Server -Blocking:$Foreground }
        'stop' { Stop-Server }
        'restart' { Stop-Server; Start-Server -Blocking:$Foreground }
        'status' { Get-ServerStatus }
        'cmd' {
            if (-not (Get-RunningServer)) {
                Write-Err2 '服务器未运行'
                exit 1
            }
            $cmdText = if ($CmdArgs -and $CmdArgs.Count -gt 0) { ($CmdArgs -join ' ') } else { 'list' }
            Send-ConsoleCommand -Command $cmdText
            Write-Info "已发送: $cmdText"
        }
        'tail' { Start-LogTail -Path $ConsoleLog }
        'reset-world' { Reset-World }
        'java' { Show-JavaReport }
        'help' { Get-Help $PSCommandPath -Detailed }
    }
} catch {
    Write-Err2 ''
    Write-Err2 "错误: $($_.Exception.Message)"
    exit 1
}
