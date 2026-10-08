param(
    [ValidateSet('Start','Stop','Service')][string]$Mode = 'Start',
    [ValidateSet('emulators','dev')][string]$Service = 'dev',
    [string]$RunId,
    [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$helper = Join-Path $PSScriptRoot 'dev-environment.ps1'
$stateDirectory = Join-Path $project '.firebase\dev-launcher'
$exportDirectory = Join-Path $project '.firebase\emulator-data\saved'
Set-Location -LiteralPath $project

function Find-Java21 {
    $candidates = @()
    if ($env:JAVA_HOME) { $candidates += Join-Path $env:JAVA_HOME 'bin\java.exe' }
    $current = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($current) { $candidates += $current.Source }
    # Previously used local Java 21; no download/install and no global PATH change.
    $candidates += Join-Path $env:USERPROFILE 'curseforge\minecraft\Install\java\Jre_21\bin\java.exe'
    foreach ($path in ($candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
        $settings = New-Object Diagnostics.ProcessStartInfo
        $settings.FileName = $path; $settings.Arguments = '-version'
        $settings.UseShellExecute = $false; $settings.CreateNoWindow = $true
        $settings.RedirectStandardError = $true; $settings.RedirectStandardOutput = $true
        $process = [Diagnostics.Process]::Start($settings)
        $version = $process.StandardError.ReadToEnd() + $process.StandardOutput.ReadToEnd()
        $process.WaitForExit(); $process.Dispose()
        if ($version -match 'version\s+"(?<major>\d+)\.') {
            if ([int]$Matches.major -ge 21) { return $path }
        }
    }
    throw 'Java 21 veya ustu bulunamadi. JAVA_HOME veya PATH ile Java 21+ secin; Firebase baslatilmadi.'
}
function Listening([int]$Port) {
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -gt 0
}
function Read-State {
    $records = @()
    foreach ($file in @(Get-ChildItem -LiteralPath $stateDirectory -Filter '*.json' -ErrorAction SilentlyContinue)) {
        $records += Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
    }
    return $records
}
function Owned-Process($record) {
    if ($record.project -ne $project -or $record.runId -notmatch '^[a-f0-9]{32}$') { return $null }
    $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$record.processId)
    if ($process -and $process.Name -eq 'powershell.exe' -and
        $process.CreationDate.ToUniversalTime().Ticks.ToString() -eq $record.createdTicks -and
        $process.CommandLine.Contains($helper) -and $process.CommandLine.Contains($record.runId)) { return $process }
    return $null
}
function Launch-Service([string]$Name) {
    $token = [Guid]::NewGuid().ToString('N')
    $arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $helper + '" -Mode Service -Service ' + $Name + ' -RunId ' + $token
    # Visible windows are intentional: user requested separate live service logs.
    $process = Start-Process powershell.exe -ArgumentList $arguments -WorkingDirectory $project -WindowStyle Normal -PassThru
    $details = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $process.Id)
    if (-not $details) { throw ('Servis penceresi baslatilamadi: ' + $Name) }
    @{project=$project;service=$Name;runId=$token;processId=$process.Id;createdTicks=$details.CreationDate.ToUniversalTime().Ticks.ToString()} |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDirectory ($Name + '.json')) -Encoding UTF8
}
function Wait-Ready([int[]]$Ports,[int]$Seconds) {
    $until = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $missing = @($Ports | Where-Object { -not (Listening $_) })
        if (-not $missing.Count) { return }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $until)
    throw ('Servis hazir olmadi. Log penceresini kontrol edin. Eksik portlar: ' + ($missing -join ', '))
}
function Check-Export {
    $metadataFile = Join-Path $exportDirectory 'firebase-export-metadata.json'
    if (-not (Test-Path -LiteralPath $metadataFile)) { throw 'Auth/Firestore export metadata eksik; emulator kapatilmadi.' }
    $metadata = Get-Content -LiteralPath $metadataFile -Raw | ConvertFrom-Json
    if ($metadata.auth.path -ne 'auth_export' -or $metadata.firestore.path -ne 'firestore_export' -or
        -not (Test-Path -LiteralPath (Join-Path $exportDirectory 'auth_export\accounts.json')) -or
        -not (Test-Path -LiteralPath (Join-Path $exportDirectory 'auth_export\config.json')) -or
        -not (Test-Path -LiteralPath (Join-Path $exportDirectory 'firestore_export\firestore_export.overall_export_metadata'))) {
        throw 'Auth/Firestore export tamamlanmamis; emulator kapatilmadi.'
    }
}
function Save-EmulatorData {
    $matching = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'firebase.*emulators:start.*--project\s+demo-test-arena' })
    if (-not $matching.Count -or -not (Listening 8080) -or -not (Listening 9099)) { throw 'Calisan local demo emulator dogrulanamadi; export alinmadan emulator kapatilmadi.' }
    & (Join-Path $project 'node_modules\.bin\firebase.cmd') emulators:export $exportDirectory --only auth,firestore --project demo-test-arena --non-interactive --force
    if ($LASTEXITCODE -ne 0) { throw 'Export basarisiz. Emulator acik birakildi; loglari kontrol edin.' }
    Check-Export
    Write-Host ('Auth + Firestore kaydedildi: ' + $exportDirectory)
}

$lock = $null
$lockAcquired = $false
try {
    if ($Mode -eq 'Service') {
        if ($RunId -notmatch '^[a-f0-9]{32}$') { throw 'Gecersiz servis kimligi.' }
        $Host.UI.RawUI.WindowTitle = 'TEST ARENA - ' + $Service
        Start-Transcript -LiteralPath (Join-Path $stateDirectory ($Service + '.log')) -Append | Out-Null
        $env:GCLOUD_PROJECT = 'demo-test-arena'
        $env:FIREBASE_EMULATORS_PATH = Join-Path $project '.firebase\emulators'
        $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
        $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
        # Local exports contain emulator data only, never AI keys or Functions env.
        Remove-Item Env:GEMINI_API_KEY,Env:GOOGLE_API_KEY -ErrorAction SilentlyContinue
        Write-Host ('Proje: ' + $project)
        if ($Service -eq 'emulators') {
            if (Test-Path -LiteralPath $exportDirectory) {
                Check-Export
                & npm.cmd run emulators -- --import $exportDirectory --export-on-exit $exportDirectory
            } else { & npm.cmd run emulators -- --export-on-exit $exportDirectory }
        } else { & npm.cmd run dev }
        Write-Host ('Servis durdu. Exit code: ' + $LASTEXITCODE)
        Stop-Transcript | Out-Null
        Read-Host 'Pencereyi kapatmak icin Enter'
        exit
    }
    if ($Mode -eq 'Start') {
        $java = Find-Java21
        $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if (-not $npm) { throw 'npm.cmd bulunamadi. Node.js/npm kurulumunu kontrol edin.' }
        if (-not (Test-Path -LiteralPath (Join-Path $project 'node_modules\.bin\firebase.cmd'))) { throw 'Proje bagimliliklari eksik: once npm.cmd install calistirin.' }
        $package = Get-Content -LiteralPath (Join-Path $project 'package.json') -Raw | ConvertFrom-Json
        if ($package.scripts.emulators -ne 'firebase emulators:start --project demo-test-arena --only auth,firestore' -or
            $package.scripts.dev -ne 'vite --host 127.0.0.1') { throw 'Proje dev/emulators scriptleri degisti. Launcher kontrol edilmeli; servis baslatilmadi.' }
        Write-Host ('Java 21+ hazir: ' + $java)
        if ($ValidateOnly) { Write-Host 'Kontroller gecti; servis veya tarayici baslatilmadi.'; exit 0 }
        $env:JAVA_HOME = Split-Path (Split-Path $java -Parent) -Parent
        $env:PATH = (Split-Path $java -Parent) + ';' + $env:PATH
    }
    if ($Mode -eq 'Stop' -and -not (Test-Path -LiteralPath $stateDirectory)) { Write-Host 'Launcher tarafindan baslatilmis servis yok.'; exit 0 }
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    # OS mutex avoids locking a project file that Vite's watcher would try to open.
    $hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($project))).Replace('-', '')
    $lock = [Threading.Mutex]::new($false, ('Local\TestArenaDev_' + $hash))
    try { $lockAcquired = $lock.WaitOne(0) } catch [Threading.AbandonedMutexException] { $lockAcquired = $true }
    if (-not $lockAcquired) { throw 'Baska bir start/stop islemi devam ediyor. Biraz sonra tekrar deneyin.' }
    if ($Mode -eq 'Stop') {
        $records = @(Read-State)
        # Release Vite's Windows file watchers before exporting. Firebase stays live.
        foreach ($record in @($records | Where-Object { $_.service -eq 'dev' })) {
            $owned = Owned-Process $record
            if ($owned) {
                & taskkill.exe /PID ([int]$owned.ProcessId) /T /F | Out-Host
                if ($LASTEXITCODE -ne 0) { throw 'Vite kapatilamadi; emulator acik birakildi.' }
            }
        }
        if ((Listening 8080) -or (Listening 9099)) { Save-EmulatorData }
        foreach ($record in @($records | Where-Object { $_.service -ne 'dev' })) {
            $owned = Owned-Process $record
            if ($owned) {
                & taskkill.exe /PID ([int]$owned.ProcessId) /T /F | Out-Host
                if ($LASTEXITCODE -ne 0) { throw ('Servis kapatilamadi: ' + $record.service) }
            } else { Write-Host ('Aktif sahiplik kaydi yok; baska sureclere dokunulmadi: ' + $record.service) }
        }
        Write-Host 'Yalniz bu launcher tarafindan baslatilan surecler kapatildi. Onceden acik servisler korunur.'
        exit 0
    }
    $ports = @(8080,9099)
    $busy = @($ports | Where-Object { Listening $_ })
    if ($busy.Count -gt 0 -and $busy.Count -lt $ports.Count) { throw ('Emulator portlarinin bir kismi kullanimda: ' + ($busy -join ', ') + '. Yeni instance baslatilmadi; mevcut terminali kontrol edin.') }
    $reuseFirebase = $busy.Count -eq $ports.Count
    if ($reuseFirebase) {
        $matching = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'firebase.*emulators:start.*--project\s+demo-test-arena' })
        if (-not $matching.Count) { throw 'Emulator portlari kullanimda ama demo-test-arena dogrulanamadi. Yeni servis baslatilmadi.' }
        Write-Host 'Mevcut demo-test-arena Emulator Suite kullaniliyor; ikinci instance baslatilmadi.'
    }
    $reuseVite = Listening 5173
    if ($reuseVite) {
        $response = Invoke-WebRequest 'http://127.0.0.1:5173/@vite/client' -UseBasicParsing -TimeoutSec 5
        $index = Invoke-WebRequest 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -ne 200 -or $index.Content -notmatch 'TEST ARENA|Test Arena') { throw '5173 portunda Test Arena Vite dogrulanamadi. Yeni instance baslatilmadi.' }
        Write-Host 'Mevcut Test Arena Vite kullaniliyor; ikinci instance baslatilmadi.'
    }
    foreach ($name in @('emulators','dev')) {
        if (($name -eq 'emulators' -and $reuseFirebase) -or ($name -eq 'dev' -and $reuseVite)) { continue }
        $record = @(Read-State | Where-Object { $_.service -eq $name }) | Select-Object -First 1
        if ($record -and (Owned-Process $record)) { Write-Host ('Mevcut launcher penceresinin hazir olmasi bekleniyor: ' + $name) }
        else { Launch-Service $name }
    }
    Wait-Ready @(8080,9099,5173) 120
    # Load navigation, then import only prepared banks placed in data/questions.
    $env:GCLOUD_PROJECT = 'demo-test-arena'
    $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
    $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
    & npm.cmd run seed:curriculum -- --navigation-only
    if ($LASTEXITCODE -ne 0) { throw 'Mevcut mufredat yuklenemedi. seed:curriculum logunu kontrol edin.' }
    & node.exe (Join-Path $project 'scripts\import-question-folder.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Local soru importer baslatilamadi; logu kontrol edin.' }
    & node.exe (Join-Path $project 'scripts\migrate-spark-local.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Spark local hesap gecisi tamamlanamadi; veri yedegi korunuyor.' }
    $page = Invoke-WebRequest 'http://127.0.0.1:5173/ogrenci-giris' -UseBasicParsing -TimeoutSec 5
    if ($page.StatusCode -ne 200) { throw 'Vite ogrenci sayfasi hazir degil.' }
    Write-Host 'Hazir: http://127.0.0.1:5173/ogrenci-giris'
    Start-Process 'http://127.0.0.1:5173/ogrenci-giris'
    Write-Host 'Bitirmek icin stop-dev.bat dosyasini acin. Servis log pencerelerini test boyunca acik tutun.'
} catch {
    Write-Host ('HATA: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Baslatilan servis varsa stop-dev.bat ile kapatabilirsiniz.'
    exit 1
} finally { if ($lock) { if ($lockAcquired) { $lock.ReleaseMutex() }; $lock.Dispose() } }
