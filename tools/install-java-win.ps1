<#
.SYNOPSIS
    为 Minecraft 26.1 准备 Java 25 —— 下载 Microsoft Build of OpenJDK 25 到仓库内，或登记已有的 JDK 25。

.DESCRIPTION
    Minecraft 26.1 服务端要求 **Java 主版本 >= 25**（实测 versions\26.1\26.1.json 的
    javaVersion.majorVersion = 25）。Windows 上最常见的坑是 PATH 上只有一个
    Java 8 / Java 24（很可能是 Oracle 的 javapath），跑不起来 26.1。

    本脚本做的是**最小侵入**的准备：

      * 默认行为：把 Microsoft Build of OpenJDK 25 的 zip 下载到
        <仓库>\.runtime\，解压后把 java.exe 路径写进 <仓库>\.runtime\java-path.txt。
        **不改系统 PATH、不改注册表、不写 Program Files**，删掉 .runtime\ 即完全回退。
      * -UseSystem：不下载，只在机器上找一个已装好的 JDK >= 25，校验后登记到同一个
        java-path.txt。
      * -Java <path>：直接指定一个 java.exe，校验后登记。

    用法：
      .\tools\install-java-win.ps1                  # 下载 OpenJDK 25 到 .runtime\
      .\tools\install-java-win.ps1 -UseSystem       # 用机器上已装的 JDK 25
      .\tools\install-java-win.ps1 -Java 'C:\jdk-25\bin\java.exe'
      .\tools\install-java-win.ps1 -Force           # 重新下载（覆盖已有 .runtime\jdk-*）
      .\tools\install-java-win.ps1 -Arch aarch64    # ARM64 Windows

    下载地址走官方 302：
      https://aka.ms/download-jdk/microsoft-jdk-25-windows-x64.zip
    脚本会打印它最终重定向到的真实 URL（形如 download.visualstudio.microsoft.com/...），
    便于你自己核对来源。

.NOTES
    约 210 MB 下载量。不校验哈希：官方 aka.ms 短链本身即完整性入口，
    但脚本会打印真实 URL 与文件大小，你可自行比对。
#>
[CmdletBinding()]
param(
    [switch]$UseSystem,
    [string]$Java,
    [switch]$Force,
    [ValidateSet('x64', 'aarch64')]
    [string]$Arch = 'x64'
)

$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'tools\_common.ps1')
Initialize-Utf8Console

$RepoRoot = Get-RepoRoot
$RuntimeDir = Join-Path $RepoRoot '.runtime'
$PointerFile = Join-Path $RuntimeDir 'java-path.txt'

function Write-Step { param([string]$m) Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok { param([string]$m) Write-Host "    $m" -ForegroundColor Green }
function Write-Note { param([string]$m) Write-Host "    $m" -ForegroundColor DarkGray }

$Required = $script:RequiredJavaMajor

function Register-JavaPath {
    param([Parameter(Mandatory)][string]$JavaExe, [Parameter(Mandatory)][string]$How)
    if (-not (Test-Path -LiteralPath $JavaExe -PathType Leaf)) {
        throw "找不到 java.exe: $JavaExe"
    }
    $major = Get-JavaMajorVersion -JavaExe $JavaExe
    if ($null -eq $major) {
        $raw = Get-JavaRawVersion -JavaExe $JavaExe
        throw "无法识别 $JavaExe 的版本（原始输出：$raw）"
    }
    if ($major -lt $Required) {
        throw "$JavaExe 的主版本是 $major，但 Minecraft 26.1 需要 >= $Required（来自 $How）"
    }

    if (-not (Test-Path -LiteralPath $RuntimeDir)) {
        New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
    }
    Set-Content -LiteralPath $PointerFile -Value $JavaExe -Encoding UTF8
    Write-Ok "✅ 已登记 Java $major：$JavaExe"
    Write-Ok "   来源：$How"
    Write-Ok "   指针：$PointerFile"
    Write-Note '（run-server.ps1 会自动读取这个指针；也可随时用 MC_JAVA 覆盖）'
}

function Get-JdkFromArchive {
    param([Parameter(Mandatory)][string]$ZipPath, [Parameter(Mandatory)][string]$DestDir)

    if (Test-Path -LiteralPath $DestDir) {
        if ($Force) {
            Write-Note "删除旧的 $DestDir"
            Remove-Item -LiteralPath $DestDir -Recurse -Force
        } else {
            Write-Note "$DestDir 已存在，跳过解压（要重下加 -Force）"
        }
    }

    if (-not (Test-Path -LiteralPath $DestDir)) {
        Write-Step '解压（约 210 MB → 约 330 MB，请稍候）'
        $tmp = Join-Path $RuntimeDir '_extract-tmp'
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $tmp | Out-Null
        Expand-Archive -LiteralPath $ZipPath -DestinationPath $tmp -Force
        # zip 内顶层是一个 jdk-25.x.y.z 目录
        $inner = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
        if (-not $inner) { throw "解压后 $tmp 里没有目录，压缩包可能损坏" }
        Move-Item -LiteralPath $inner.FullName -Destination $DestDir
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
        Write-Ok "解压完成：$DestDir"
    }

    $exe = Join-Path $DestDir 'bin\java.exe'
    if (-not (Test-Path -LiteralPath $exe)) { throw "解压结果里没有 $exe" }
    return $exe
}

# ---------------------------------------------------------------------------
# 模式 1 / 2：显式指定 或 用系统已有
# ---------------------------------------------------------------------------
if ($Java) {
    Write-Step "校验指定的 Java（$Java）"
    $resolved = (Resolve-Path -LiteralPath $Java).Path
    Register-JavaPath -JavaExe $resolved -How '-Java 参数'
    exit 0
}

if ($UseSystem) {
    Write-Step '在机器上查找已装的 JDK >= 25'
    $cands = @(Get-JavaCandidates)
    if ($cands.Count -eq 0) {
        Write-Host ''
        Write-Host (New-JavaHelpMessage -Reason '这台机器上没有任何 java.exe' -Seen @())
        exit 1
    }
    $found = $null
    $seen = New-Object System.Collections.Generic.List[string]
    foreach ($c in $cands) {
        $major = Get-JavaMajorVersion -JavaExe $c.Path
        $shown = if ($null -eq $major) { '未知' } else { $major }
        $seen.Add(("  - {0}  [主版本 {1}]  ({2})" -f $c.Path, $shown, $c.Source))
        if ($null -ne $major -and $major -ge $Required) { $found = $c.Path; break }
    }
    if (-not $found) {
        Write-Host ''
        Write-Host (New-JavaHelpMessage -Reason "没有找到主版本 >= $Required 的 Java" -Seen $seen)
        exit 1
    }
    Register-JavaPath -JavaExe $found -How '系统已安装（-UseSystem）'
    exit 0
}

# ---------------------------------------------------------------------------
# 可续传下载（带 stall 检测）
#
# 实测教训（本机）：这个 CDN 上
#   * HttpWebRequest 读到约 700KB 后彻底 stall（不报错也不前进）
#   * HttpClient 读到约 37MB 后同样 stall，且同步 Read() 会无限阻塞
#   * Start-BitsTransfer 卡在 Connecting，读不到任何字节
# 所以必须自己实现：**异步读 + 超时判定 stall + Range 续传**。
# ---------------------------------------------------------------------------
function Invoke-ResumableDownload {
    param(
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][string]$Dest,
        [int]$MaxStalls = 40,
        [int]$ProgressIntervalSec = 2
    )

    Add-Type -AssemblyName System.Net.Http | Out-Null

    $dir = Split-Path -Parent $Dest
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $lastReport = 0.0
    $stall = 0
    $announced = $false
    [long]$total = 0

    while ($true) {
        if ($stall -ge $MaxStalls) {
            $have = 0
            if (Test-Path -LiteralPath $Dest) { $have = (Get-Item -LiteralPath $Dest).Length }
            throw "连续 $MaxStalls 次 stall，放弃。已下载 $([math]::Round($have / 1MB, 1)) MB。**可重跑本脚本，会从断点续传**。"
        }

        [long]$offset = 0
        if (Test-Path -LiteralPath $Dest) { $offset = (Get-Item -LiteralPath $Dest).Length }

        $hc = New-Object System.Net.Http.HttpClient
        $hc.Timeout = [TimeSpan]::FromMinutes(60)
        [void]$hc.DefaultRequestHeaders.Add('User-Agent', 'dsh-minecraft-agent-installer')
        $resp = $null
        $stream = $null
        $fs = $null
        [long]$got = 0

        try {
            if ($offset -gt 0) {
                $hc.DefaultRequestHeaders.Range = New-Object System.Net.Http.Headers.RangeHeaderValue($offset, $null)
            }
            $resp = $hc.GetAsync($Url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()

            $okStatus = ($resp.StatusCode -eq [System.Net.HttpStatusCode]::OK) -or ($resp.StatusCode -eq [System.Net.HttpStatusCode]::PartialContent)
            if (-not $okStatus) { throw "HTTP $([int]$resp.StatusCode) $($resp.ReasonPhrase)" }

            # 只有 206 才能接着写；200 表示服务端忽略了 Range，必须从头写
            $resumed = ($resp.StatusCode -eq [System.Net.HttpStatusCode]::PartialContent)
            if ($offset -gt 0 -and -not $resumed) {
                Write-Note '服务端不支持续传（返回 200），改为从头下载'
                $offset = 0
            }

            if ($resp.Content.Headers.ContentLength) { $total = [long]$resp.Content.Headers.ContentLength + $offset }
            if (-not $announced) {
                Write-Note "真实地址：$($resp.RequestMessage.RequestUri.AbsoluteUri)"
                if ($total -gt 0) { Write-Note "文件大小：$([math]::Round($total / 1MB, 1)) MB" }
                $announced = $true
            } elseif ($offset -gt 0) {
                Write-Note "续传自 $([math]::Round($offset / 1MB, 1)) MB"
            }

            $stream = $resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
            $mode = if ($offset -gt 0) { [System.IO.FileMode]::Append } else { [System.IO.FileMode]::Create }
            $fs = New-Object System.IO.FileStream($Dest, $mode, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)

            $buf = New-Object byte[] (512KB)
            while ($true) {
                $task = $stream.ReadAsync($buf, 0, $buf.Length)
                if (-not $task.Wait(60000)) { throw 'read stalled (60s 无数据)' }
                $n = $task.Result
                if ($n -le 0) { break }
                $fs.Write($buf, 0, $n)
                $got += $n

                $el = $sw.Elapsed.TotalSeconds
                if ($el - $lastReport -ge $ProgressIntervalSec) {
                    $lastReport = $el
                    $done = $offset + $got
                    $spd = if ($el -gt 0) { [math]::Round($done / 1MB / $el, 1) } else { 0 }
                    if ($total -gt 0) {
                        Write-Progress -Activity '下载 OpenJDK 25' `
                            -Status "$([math]::Round($done / 1MB, 1)) / $([math]::Round($total / 1MB, 1)) MB ($([int](100 * $done / $total))%)  $spd MB/s" `
                            -PercentComplete ([int](100 * $done / $total))
                    } else {
                        Write-Progress -Activity '下载 OpenJDK 25' -Status "$([math]::Round($done / 1MB, 1)) MB  $spd MB/s"
                    }
                }
            }

            $fs.Flush(); $fs.Dispose(); $fs = $null
            $stream.Dispose(); $stream = $null
            $resp.Dispose(); $resp = $null
            $hc.Dispose(); $hc = $null

            $finalSize = (Get-Item -LiteralPath $Dest).Length
            if ($total -gt 0 -and $finalSize -lt $total) {
                throw "连接提前结束（$([math]::Round($finalSize / 1MB, 1)) / $([math]::Round($total / 1MB, 1)) MB）"
            }
            try { Write-Progress -Activity '下载 OpenJDK 25' -Completed } catch { }
            return [pscustomobject]@{ Path = $Dest; Bytes = $finalSize; Seconds = [math]::Round($sw.Elapsed.TotalSeconds, 0) }
        } catch {
            $stall++
            try { if ($fs) { $fs.Flush(); $fs.Dispose() } } catch { }
            try { if ($stream) { $stream.Dispose() } } catch { }
            try { if ($resp) { $resp.Dispose() } } catch { }
            try { if ($hc) { $hc.Dispose() } } catch { }
            $have = 0
            if (Test-Path -LiteralPath $Dest) { $have = (Get-Item -LiteralPath $Dest).Length }
            Write-Warn2 "第 $stall 次中断：$($_.Exception.Message)；已有 $([math]::Round($have / 1MB, 1)) MB，1s 后续传"
            Start-Sleep -Seconds 1
        }
    }
}

# ---------------------------------------------------------------------------
# 模式 3（默认）：下载到 <仓库>\.runtime\
# ---------------------------------------------------------------------------
$url = "https://aka.ms/download-jdk/microsoft-jdk-25-windows-$Arch.zip"
Write-Step "准备 <仓库>\.runtime\ 下的 Microsoft OpenJDK 25"
Write-Note "仓库：$RepoRoot"
Write-Note "下载：$url"

$existing = $null
if (Test-Path -LiteralPath $RuntimeDir) {
    $jdkDirs = @(Get-ChildItem -LiteralPath $RuntimeDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'jdk-25*' })
    if ($jdkDirs.Count -gt 0) { $existing = $jdkDirs[0] }
}

if ($existing -and -not $Force) {
    $exe = Join-Path $existing.FullName 'bin\java.exe'
    if (Test-Path -LiteralPath $exe) {
        Write-Note "已存在 $($existing.Name)，校验后直接登记（要重下加 -Force）"
        Register-JavaPath -JavaExe $exe -How '已有 .runtime\ 解压目录'
        exit 0
    }
}

if (-not (Test-Path -LiteralPath $RuntimeDir)) {
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
}

$zipPath = Join-Path $RuntimeDir "microsoft-jdk-25-windows-$Arch.zip"

if ((Test-Path -LiteralPath $zipPath) -and -not $Force) {
    $len = (Get-Item -LiteralPath $zipPath).Length
    if ($len -gt 100MB) {
        Write-Note "复用已有压缩包 $zipPath（$([math]::Round($len / 1MB, 1)) MB）"
    } else {
        Write-Note "已有压缩包只有 $([math]::Round($len / 1MB, 1)) MB（不足 100MB，判定不完整），删除后重下"
        Remove-Item -LiteralPath $zipPath -Force
    }
}

if (-not (Test-Path -LiteralPath $zipPath)) {
    Write-Step '下载中（约 210 MB，可续传）'
    try {
        $result = Invoke-ResumableDownload -Url $url -Dest $zipPath
        Write-Ok "下载完成：$($result.Path)（$([math]::Round($result.Bytes / 1MB, 1)) MB，用时 $($result.Seconds)s）"
    } catch {
        Write-Host ''
        Write-Host "下载失败：$($_.Exception.Message)" -ForegroundColor Red
        Write-Host ''
        Write-Host '可手动下载后放到这里再重跑本脚本（脚本会跳过下载直接解压）：'
        Write-Host "  $url"
        Write-Host "  保存为：$zipPath"
        exit 1
    }
} else {
    Write-Note "复用已有压缩包（$([math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 1)) MB）"
}

$destDir = Join-Path $RuntimeDir 'jdk-25'
$exe = Get-JdkFromArchive -ZipPath $zipPath -DestDir $destDir

Write-Step '校验解压出来的 Java'
$raw = (Get-JavaRawVersion -JavaExe $exe) -split "`r?`n" | Select-Object -First 1
Write-Note $raw
Register-JavaPath -JavaExe $exe -How '本脚本下载的 Microsoft OpenJDK 25'

Write-Host ''
Write-Host '下一步：' -ForegroundColor Cyan
Write-Host '  .\run-server.ps1 start'
Write-Host ''
Write-Note '想清理：直接删掉 .runtime\ 即可（本脚本没有改动系统任何位置）。'
