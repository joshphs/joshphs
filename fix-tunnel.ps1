# Repairs the Cloudflare Tunnel that serves email.happypuppyportal.com.
#
# Run on the PC that hosts the intake portal, in PowerShell opened as Administrator:
#   irm https://raw.githubusercontent.com/joshphs/joshphs/ccr-ceca5b43-mrj99g/fix-tunnel.ps1 | iex
#
# What it does:
#   1. Finds cloudflared and reports the current service state and recent log lines.
#   2. Asks for a fresh tunnel token from the Cloudflare dashboard (input is hidden).
#   3. Test-runs the connector with that token, first over QUIC, then over HTTP/2,
#      to learn which one can reach Cloudflare from this network.
#   4. Reinstalls the Windows service with the fresh token and the protocol that worked.
#   5. Sets the service to start automatically and restart on failure, and stops the
#      PC from sleeping or hibernating while plugged in.
#   6. Loads the public URL and reports whether the portal is back.

function Repair-Tunnel {
    $Hostname = 'email.happypuppyportal.com'

    function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
    function Ok($m)   { Write-Host $m -ForegroundColor Green }
    function Bad($m)  { Write-Host $m -ForegroundColor Red }

    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) { Bad 'Open PowerShell with "Run as administrator" and run this again.'; return }

    Step 'Locating cloudflared'
    $svc = Get-CimInstance Win32_Service -Filter "Name='cloudflared'"
    $exe = $null
    if ($svc -and $svc.PathName -match '^\s*"?([^"]+?cloudflared\.exe)') { $exe = $Matches[1] }
    if (-not $exe -or -not (Test-Path $exe)) { $exe = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source }
    if (-not $exe) {
        foreach ($p in "$env:ProgramFiles\cloudflared\cloudflared.exe", "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe") {
            if (Test-Path $p) { $exe = $p; break }
        }
    }
    if (-not $exe) {
        Write-Host 'cloudflared is not installed. Installing it with winget.'
        winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements | Out-Host
        foreach ($p in "$env:ProgramFiles\cloudflared\cloudflared.exe", "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe") {
            if (Test-Path $p) { $exe = $p; break }
        }
        if (-not $exe) { Bad 'Could not install cloudflared. Download it from https://github.com/cloudflare/cloudflared/releases and rerun.'; return }
    }
    Write-Host "Using $exe"
    & $exe --version | Out-Host

    Step 'Current service state'
    if ($svc) {
        Write-Host "State: $($svc.State)   Startup: $($svc.StartMode)"
        Write-Host ('Command: ' + ($svc.PathName -replace 'eyJ\S+', '<token hidden>'))
    } else {
        Write-Host 'No cloudflared service is installed.'
    }
    $events = Get-WinEvent -ProviderName cloudflared -MaxEvents 10 -ErrorAction SilentlyContinue
    if ($events) {
        Write-Host 'Recent log lines:'
        $events | ForEach-Object { Write-Host "  $($_.TimeCreated)  $($_.Message)" }
    }

    Step 'Fresh tunnel token'
    Write-Host 'In a browser: dash.cloudflare.com > Networking > Tunnels > your tunnel > Configure (or Edit).'
    Write-Host 'Choose Windows and copy the install command. You can paste the whole command or just the eyJ... token.'
    $sec = Read-Host 'Paste here and press Enter (input stays hidden)' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $Token = ($Token.Trim() -replace '^.*?(eyJ\S+).*$', '$1')
    if ($Token -notmatch '^eyJ\S+$') { Bad 'That does not look like a tunnel token. It should start with eyJ.'; return }

    Step 'Stopping the current service'
    if ($svc) { Stop-Service cloudflared -Force -ErrorAction SilentlyContinue }
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    function Test-Connector([string]$Protocol) {
        $log = Join-Path $env:TEMP "cloudflared-test-$Protocol.log"
        Remove-Item $log -ErrorAction SilentlyContinue
        $argList = @('tunnel', '--no-autoupdate', '--logfile', "`"$log`"", '--protocol', $Protocol, 'run', '--token', $Token)
        $p = Start-Process -FilePath $exe -ArgumentList $argList -PassThru -WindowStyle Hidden
        $ok = $false
        for ($i = 0; $i -lt 30 -and -not $ok -and -not $p.HasExited; $i++) {
            Start-Sleep -Seconds 1
            if (Test-Path $log) { $ok = [bool](Select-String -Path $log -Pattern 'Registered tunnel connection' -Quiet) }
        }
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        if (-not $ok -and (Test-Path $log)) {
            Write-Host "Last log lines over ${Protocol}:"
            Get-Content $log -Tail 12 | ForEach-Object { Write-Host "  $_" }
        }
        return $ok
    }

    Step 'Test-connecting to Cloudflare'
    $protocol = $null
    foreach ($candidate in 'quic', 'http2') {
        Write-Host "Trying $candidate ..."
        if (Test-Connector $candidate) { $protocol = $candidate; Ok "Connected over $candidate."; break }
        Bad "No connection over $candidate."
    }
    if (-not $protocol) {
        Bad 'cloudflared could not connect with this token over either protocol.'
        Write-Host 'If the log lines above say Unauthorized or tunnel not found, the token is for a deleted tunnel: copy it again from the dashboard.'
        Write-Host 'If they say timeout or failed to dial, something on this network blocks outbound port 7844: allow cloudflared.exe in your antivirus and firewall.'
        Write-Host 'Your old service was stopped. To restart it unchanged, run: Start-Service cloudflared'
        return
    }

    Step 'Reinstalling the cloudflared service'
    if ($svc) { & $exe service uninstall | Out-Host; Start-Sleep -Seconds 3 }
    & $exe service install $Token | Out-Host
    Start-Sleep -Seconds 3
    $key = 'HKLM:\SYSTEM\CurrentControlSet\Services\cloudflared'
    if (-not (Test-Path $key)) { Bad 'The service did not install. Scroll up for the error.'; return }
    $image = (Get-ItemProperty $key).ImagePath
    if ($protocol -eq 'http2' -and $image -notmatch '--protocol') {
        $image = $image -replace '\btunnel\b', 'tunnel --protocol http2'
        Set-ItemProperty $key -Name ImagePath -Value $image
    }
    Set-Service cloudflared -StartupType Automatic
    sc.exe failure cloudflared reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
    Restart-Service cloudflared -Force
    Ok 'Service reinstalled, set to Automatic, and set to restart on failure.'

    Step 'Keeping this PC awake while plugged in'
    powercfg /change standby-timeout-ac 0
    powercfg /change hibernate-timeout-ac 0
    Ok 'Sleep and hibernate are off on AC power.'

    Step "Checking https://$Hostname"
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $code = $null
    for ($i = 0; $i -lt 12; $i++) {
        Start-Sleep -Seconds 5
        try {
            $code = (Invoke-WebRequest "https://$Hostname/" -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop).StatusCode
        } catch {
            if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode } else { $code = 0 }
        }
        if ($code -ne 530 -and $code -ne 0) { break }
    }
    switch ($code) {
        { $_ -in 200, 301, 302, 303, 307, 308, 401, 403 } { Ok "FIXED. $Hostname answers with HTTP $code."; break }
        502 { Bad 'The tunnel is up, but the intake app on this PC is not running (HTTP 502). Start the app, then reload.'; break }
        530 {
            Bad "Still error 1033. This tunnel is connected, but $Hostname is routed to a different tunnel."
            Write-Host 'Fix: dash.cloudflare.com > Networking > Tunnels > this tunnel > Public Hostname > add email.happypuppyportal.com.'
            Write-Host 'If it says the record already exists, delete the old "email" CNAME under DNS first, then add it again.'
            break
        }
        default { Write-Host "The site answered with HTTP $code. Open it in a browser to confirm." }
    }
}

Repair-Tunnel
