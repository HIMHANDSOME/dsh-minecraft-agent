<#
.SYNOPSIS
    Windows 版公共函数库：Java 25 探测、进程记录、日志编码、自提权。

.DESCRIPTION
    被 run-server.ps1 / run-daemon.ps1 / run-agent.ps1 点源引用（. "$PSScriptRoot\_common.ps1"）。
    这里集中处理三端都必须一致的判断，避免每份脚本各写一套然后慢慢跑偏。

.NOTES
    目标平台：Windows PowerShell 5.1（系统自带）与 PowerShell 7+ 均可。
    不依赖任何第三方模块。
#>

Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
# 仓库路径
# ---------------------------------------------------------------------------
$script:RepoRoot = Split-Path -Parent $PSScriptRoot

function Get-RepoRoot { $script:RepoRoot }
function Get-ServerDir { Join-Path $script:RepoRoot 'minecraft-server-26.1' }
function Get-LogsDir { Join-Path $script:RepoRoot 'logs' }

# ---------------------------------------------------------------------------
# 控制台编码：脚本、日志、控制台统一 UTF-8
# ---------------------------------------------------------------------------
function Initialize-Utf8Console {
    try {
        [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
        $OutputEncoding = New-Object System.Text.UTF8Encoding $false
    } catch { }
    # 65001 = UTF-8。失败无所谓（非交互式宿主没有真控制台）
    try { & chcp.com 65001 > $null 2>&1 } catch { }
}

# ---------------------------------------------------------------------------
# Java 探测
# ---------------------------------------------------------------------------
# Minecraft 26.1 服务端的 javaVersion.majorVersion = 25（实测 versions\26.1\26.1.json）
$script:RequiredJavaMajor = 25

function Invoke-JavaVersionRaw {
    <#
      执行 `java -version` 并把 stdout+stderr 合并成文本。

      两个必须用 try/finally 兜住的点：
        * java 把版本号写在 **stderr**；在 $ErrorActionPreference='Stop' 下，
          PowerShell 会把原生命令的 stderr 当成 NativeCommandError 终止错误，
          于是"探测版本"反而把脚本炸掉。
        * PS 5.1 在把原生命令的 stderr 包进 ErrorRecord 时会产出乱码（GBK 误解码），
          所以这里临时把编码也固定成 UTF-8。
    #>
    param([Parameter(Mandatory)][string]$JavaExe)

    $savedEap = $ErrorActionPreference
    $savedOut = $null
    $savedNative = $null
    try {
        $ErrorActionPreference = 'Continue'
        $savedOut = [Console]::OutputEncoding
        [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
        $v = $PSVersionTable.PSVersion.Major
        if ($v -ge 7) { $savedNative = $PSNativeCommandUseErrorActionPreference }
        if ($v -ge 7) { $PSNativeCommandUseErrorActionPreference = $false }
        return (& $JavaExe -version 2>&1 | Out-String)
    } catch {
        return ''
    } finally {
        $ErrorActionPreference = $savedEap
        if ($savedOut) { try { [Console]::OutputEncoding = $savedOut } catch { } }
        if ($null -ne $savedNative) { $PSNativeCommandUseErrorActionPreference = $savedNative }
    }
}

function Get-JavaMajorVersion {
    <#
      返回 java.exe 的主版本号（int），识别不出来返回 $null。
    #>
    param([Parameter(Mandatory)][string]$JavaExe)
    $raw = Invoke-JavaVersionRaw -JavaExe $JavaExe
    if (-not $raw) { return $null }
    # 形如：openjdk version "25.0.1" 2025-10-21  /  java version "1.8.0_491"  /  java version "24.0.1"
    $m = [regex]::Match($raw, 'version\s+"(?<v>[^"]+)"')
    if (-not $m.Success) { return $null }
    $v = $m.Groups['v'].Value
    if ($v -like '1.*') {
        # 1.8.0_491 -> 8（老式版本号）
        $parts = $v.Split('.')
        if ($parts.Length -ge 2) { return [int]$parts[1] }
        return $null
    }
    $head = ($v -split '[.\-+]')[0]
    $n = 0
    if ([int]::TryParse($head, [ref]$n)) { return $n }
    return $null
}

function Get-JavaRawVersion {
    param([Parameter(Mandatory)][string]$JavaExe)
    $raw = Invoke-JavaVersionRaw -JavaExe $JavaExe
    if (-not $raw) { return '(无法执行)' }
    return $raw.Trim()
}

function Get-JavaCandidates {
    <#
      按优先级汇总候选 java.exe。顺序：
        1. -Java 参数 / MC_JAVA 环境变量
        2. 仓库 .runtime\java-path.txt（tools\install-java-win.ps1 写入）
        3. .runtime\ 下的 jdk-*\bin\java.exe（解压即用的目录）
        4. JAVA_HOME
        5. PATH 上的 java.exe
        6. 常见安装目录（JavaSoft / Adoptium / Microsoft / Zulu / Corretto / Semeru / Liberica）
        7. 注册表 HKLM:\SOFTWARE\JavaSoft\JDK*（含 32 位 WOW6432Node）
      输出：[pscustomobject]@{ Path=...; Source=... }
    #>
    param([string]$Explicit)

    $seen = New-Object System.Collections.Generic.HashSet[string]
    $add = {
        param($p, $src)
        if (-not $p) { return }
        try { $full = [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($p)) } catch { return }
        if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { return }
        if ($seen.Add($full.ToLowerInvariant())) {
            [pscustomobject]@{ Path = $full; Source = $src }
        }
    }

    # 1) 显式参数 / MC_JAVA
    if ($Explicit) { & $add $Explicit '-Java 参数' }
    if ($env:MC_JAVA) { & $add $env:MC_JAVA 'MC_JAVA' }

    $runtime = Join-Path $script:RepoRoot '.runtime'

    # 2) .runtime\java-path.txt
    $ptr = Join-Path $runtime 'java-path.txt'
    if (Test-Path -LiteralPath $ptr) {
        $line = (Get-Content -LiteralPath $ptr -TotalCount 1 -ErrorAction SilentlyContinue)
        if ($line) { & $add $line.Trim() '.runtime\java-path.txt' }
    }

    # 3) .runtime\jdk-*\bin\java.exe
    if (Test-Path -LiteralPath $runtime) {
        Get-ChildItem -LiteralPath $runtime -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like 'jdk*' -or $_.Name -like 'jre*' } |
            ForEach-Object { & $add (Join-Path $_.FullName 'bin\java.exe') ".runtime\$($_.Name)" }
    }

    # 4) JAVA_HOME
    if ($env:JAVA_HOME) { & $add (Join-Path $env:JAVA_HOME 'bin\java.exe') 'JAVA_HOME' }

    # 5) PATH
    $cmd = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($cmd) { & $add $cmd.Source 'PATH' }

    # 6) 常见安装目录
    $roots = @(
        "$env:ProgramFiles\Java",
        "$env:ProgramFiles\Eclipse Adoptium",
        "$env:ProgramFiles\Microsoft\jdk",
        "$env:ProgramFiles\Zulu",
        "$env:ProgramFiles\Amazon Corretto",
        "$env:ProgramFiles\IBM\Semeru",
        "$env:ProgramFiles\BellSoft",
        "$env:ProgramFiles\BellSoft\LibericaJDK",
        "$env:ProgramFiles\RedHat",
        "${env:ProgramFiles(x86)}\Java",
        "$env:LOCALAPPDATA\Programs\Eclipse Adoptium",
        "$env:LOCALAPPDATA\Programs\Microsoft\jdk",
        'C:\Java'
    )
    foreach ($r in $roots) {
        if (-not $r) { continue }
        if (-not (Test-Path -LiteralPath $r)) { continue }
        Get-ChildItem -LiteralPath $r -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            & $add (Join-Path $_.FullName 'bin\java.exe') "安装目录 $r"
        }
        & $add (Join-Path $r 'bin\java.exe') "安装目录 $r"
    }

    # 7) 注册表
    foreach ($key in @('HKLM:\SOFTWARE\JavaSoft\JDK', 'HKLM:\SOFTWARE\JavaSoft\JDK-64', 'HKLM:\SOFTWARE\JavaSoft\JRE', 'HKLM:\SOFTWARE\WOW6432Node\JavaSoft\JDK', 'HKLM:\SOFTWARE\WOW6432Node\JavaSoft\JDK-64')) {
        if (-not (Test-Path $key)) { continue }
        Get-ChildItem $key -ErrorAction SilentlyContinue | ForEach-Object {
            $home_ = (Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue).JavaHome
            if ($home_) { & $add (Join-Path $home_ 'bin\java.exe') "注册表 $($_.PSChildName)" }
        }
    }
}

function Resolve-Java {
    <#
      返回满足 Minecraft 26.1 要求的 java.exe 完整路径；找不到就抛出带可操作指引的错误。
      参数 -RequiredMajor 默认 25；-MinimumMajor 可放松到"至少 N"（用于只做提示的场景）。
    #>
    param(
        [string]$Explicit,
        [int]$RequiredMajor = $script:RequiredJavaMajor,
        [switch]$AllowLower
    )

    $cands = @(Get-JavaCandidates -Explicit $Explicit)
    if ($cands.Count -eq 0) {
        throw (New-JavaHelpMessage -Reason '在这台机器上没有找到任何 java.exe' -Seen @())
    }

    $seen = New-Object System.Collections.Generic.List[string]
    $best = $null
    foreach ($c in $cands) {
        $major = Get-JavaMajorVersion -JavaExe $c.Path
        $shown = if ($null -eq $major) { '未知' } else { $major }
        $seen.Add(("  - {0}  [主版本 {1}]  ({2})" -f $c.Path, $shown, $c.Source))
        if ($null -ne $major -and $major -ge $RequiredMajor) {
            return $c.Path
        }
        if ($AllowLower -and $null -ne $major -and ($null -eq $best -or $major -gt (Get-JavaMajorVersion -JavaExe $best.Path))) {
            $best = $c.Path
        }
    }

    if ($AllowLower -and $best) { return $best }

    throw (New-JavaHelpMessage -Reason "找不到满足要求的 Java（需要主版本 >= $RequiredMajor）" -Seen $seen)
}

function New-JavaHelpMessage {
    param([string]$Reason, $Seen)
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add($Reason + '。')
    if ($Seen -and @($Seen).Count -gt 0) {
        $lines.Add('已探测到：')
        foreach ($s in $Seen) { $lines.Add($s) }
    }
    $lines.Add('')
    $lines.Add('补法（任选其一）：')
    $lines.Add('  .\tools\install-java-win.ps1                     # 下载 OpenJDK 25 到 <仓库>\.runtime\（不改系统）')
    $lines.Add('  .\tools\install-java-win.ps1 -UseSystem          # 用你已装好的 JDK 25，只做校验并登记')
    $lines.Add('  $env:MC_JAVA = ''C:\path\to\jdk-25\bin\java.exe''  # 手动指定')
    $lines.Add('')
    $lines.Add('手动下载地址（Microsoft Build of OpenJDK 25，zip 解压即用）：')
    $lines.Add('  https://aka.ms/download-jdk/microsoft-jdk-25-windows-x64.zip')
    return ($lines -join [Environment]::NewLine)
}

# ---------------------------------------------------------------------------
# 进程记录（服务器 / daemon）
# ---------------------------------------------------------------------------
function Get-PidRecordPath {
    param([Parameter(Mandatory)][string]$Name)
    Join-Path (Get-ServerDir) "$Name.pid.json"
}

function Save-PidRecord {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][int]$ProcessId,
        [hashtable]$Extra = @{}
    )
    $dir = Get-ServerDir
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $rec = [ordered]@{
        name      = $Name
        pid       = $ProcessId
        startedAt = (Get-Date).ToString('o')
        host      = $env:COMPUTERNAME
    }
    foreach ($k in $Extra.Keys) { $rec[$k] = $Extra[$k] }
    $rec | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Get-PidRecordPath -Name $Name) -Encoding UTF8
}

function Read-PidRecord {
    param([Parameter(Mandatory)][string]$Name)
    $p = Get-PidRecordPath -Name $Name
    if (-not (Test-Path -LiteralPath $p)) { return $null }
    try { return (Get-Content -LiteralPath $p -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}

function Clear-PidRecord {
    param([Parameter(Mandatory)][string]$Name)
    Remove-Item -LiteralPath (Get-PidRecordPath -Name $Name) -Force -ErrorAction SilentlyContinue
}

function Test-PidAlive {
    <#
      判断 PID 是否还活着，并且（可选）命令行匹配 -Match。
      PowerShell 的 Get-Process 不暴露命令行，所以用 CIM 查 CommandLine —— 这样
      即使 PID 被系统复用，也不会误判成"我们的进程还在"。
    #>
    param(
        [Parameter(Mandatory)][int]$ProcessId,
        [string]$Match
    )
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if (-not $Match) { return $true }
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (-not $cim -or -not $cim.CommandLine) { return $true }   # 拿不到命令行就别否定它
    return ($cim.CommandLine -like "*$Match*")
}

function Get-PortOwner {
    param([Parameter(Mandatory)][int]$Port)
    try {
        return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique)
    } catch {
        return @()
    }
}

# ---------------------------------------------------------------------------
# 日志
# ---------------------------------------------------------------------------
function Get-Utf8NoBomEncoding {
    New-Object System.Text.UTF8Encoding $false
}

function Add-RunLog {
    <#
      daemon 日志：UTF-8 无 BOM 追加。Node 侧和 PowerShell 侧都往里写，编码必须一致。
    #>
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Message
    )
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $enc = Get-Utf8NoBomEncoding
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $fs = $null
    try {
        $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
        $sw = New-Object System.IO.StreamWriter($fs, $enc)
        $sw.WriteLine("[$stamp] $Message")
        $sw.Flush()
        $sw.Dispose()
    } catch {
        Write-Warning "写日志失败 $Path : $($_.Exception.Message)"
    } finally {
        if ($fs) { $fs.Dispose() }
    }
}

function Get-LogLines {
    <#
      以 FileShare.ReadWrite 读取日志文件，返回字符串数组。

      为什么不用 Get-Content / Select-String：服务端运行时，控制台宿主以
      FileShare.ReadWrite 一直持有 console.log；Select-String 的打开方式不含
      Write 共享，会因共享冲突**静默失败**（配合 -ErrorAction SilentlyContinue
      就变成"永远找不到 Done (…)"，本机实测踩过）。这里显式指定共享模式。
    #>
    param(
        [Parameter(Mandatory)][string]$Path,
        [int]$Tail = 0
    )
    if (-not (Test-Path -LiteralPath $Path)) { return @() }
    $fs = $null
    $sr = $null
    try {
        $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $sr = New-Object System.IO.StreamReader($fs, (Get-Utf8NoBomEncoding))
        $lines = New-Object System.Collections.Generic.List[string]
        while ($null -ne ($line = $sr.ReadLine())) { $lines.Add($line) }
        if ($Tail -gt 0 -and $lines.Count -gt $Tail) {
            return @($lines.GetRange($lines.Count - $Tail, $Tail))
        }
        return @($lines)
    } catch {
        return @()
    } finally {
        if ($sr) { $sr.Dispose() }
        if ($fs) { $fs.Dispose() }
    }
}

function Find-LogLine {
    <#
      在日志里找第一条匹配的行；找不到返回 $null。共享安全（见 Get-LogLines）。

      Pattern 以 '^' 开头时按**行首锚定**匹配（正则），否则按包含匹配。
      为什么要区分：`-like '*server-port=*'` 会误命中 `management-server-port=0`。
    #>
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Pattern
    )
    $anchored = $Pattern.StartsWith('^')
    foreach ($l in (Get-LogLines -Path $Path)) {
        if ($anchored) {
            if ($l -match $Pattern) { return $l }
        } else {
            if ($l -like "*$Pattern*") { return $l }
        }
    }
    return $null
}

function Count-LogLine {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Pattern
    )
    $n = 0
    foreach ($l in (Get-LogLines -Path $Path)) {
        if ($l -like "*$Pattern*") { $n++ }
    }
    return $n
}

function Start-LogTail {
    <#
      -Wait 用 Get-Content -Wait（Ctrl+C 退出）。先保证文件存在，否则 Get-Content 直接报错。
    #>
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType File -Force -Path $Path | Out-Null
        Write-Host "（日志文件刚创建，等待输出…）" -ForegroundColor DarkGray
    }
    Get-Content -LiteralPath $Path -Wait -Encoding UTF8
}
