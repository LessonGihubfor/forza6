# ============================================================
#  FORZA GALLERY - Setup Daily Sync Reminder
#  Run this script once (as Administrator) to create a daily
#  Windows Task Scheduler job that opens forza.net and copies
#  the sync script to your clipboard at your preferred time.
# ============================================================

$taskName = "ForzaGallerySync"
$scriptPath = Join-Path $PSScriptRoot "auto-sync.bat"

# Check if task already exists
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "`n  Task '$taskName' already exists. Removing old one..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Write-Host "`n  ========================================"
Write-Host "   FORZA GALLERY DAILY SYNC SETUP"
Write-Host "  ========================================`n"

$time = Read-Host "  What time should the reminder run? (e.g. 8:00PM)"

try {
    $action = New-ScheduledTaskAction -Execute $scriptPath
    $trigger = New-ScheduledTaskTrigger -Daily -At $time
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Opens forza.net and copies sync script to clipboard for daily photo sync"

    Write-Host "`n  [SUCCESS] Daily sync scheduled at $time!" -ForegroundColor Green
    Write-Host "  Task name: $taskName"
    Write-Host "  To remove: Unregister-ScheduledTask -TaskName '$taskName'"
    Write-Host ""
} catch {
    Write-Host "`n  [ERROR] Failed to create task. Try running as Administrator." -ForegroundColor Red
    Write-Host "  Error: $_"
}

Read-Host "`n  Press Enter to close"
