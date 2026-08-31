# Git Auto Push Script
# Automatically detect file changes and push to GitHub
# Run this script from the project directory

$ErrorActionPreference = "Continue"

# Use current directory as project path
$ProjectPath = Get-Location
$LogPath = Join-Path $ProjectPath "git-auto-push.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    try {
        Out-File -FilePath $LogPath -InputObject $logMessage -Append -Encoding utf8 -ErrorAction SilentlyContinue
    } catch {}
}

Write-Log "===== Start Auto Push Check ====="
Write-Log "Project path: $ProjectPath"

# Check if it's a git repository
if (-not (Test-Path ".git")) {
    Write-Log "ERROR: Not a Git repository"
    exit 1
}

# Check if remote is configured
$remote = git remote -v 2>&1
if ([string]::IsNullOrWhiteSpace($remote)) {
    Write-Log "ERROR: No remote repository configured"
    exit 1
}

# Check for file changes
$status = git status --porcelain 2>&1
$untracked = git ls-files --others --exclude-standard 2>&1

if ([string]::IsNullOrWhiteSpace($status) -and [string]::IsNullOrWhiteSpace($untracked)) {
    Write-Log "No file changes detected, nothing to push"
    Write-Log "===== Check Complete ====="
    exit 0
}

Write-Log "File changes detected, starting sync..."

# List changed files
Write-Log "Changed files:"
if (-not [string]::IsNullOrWhiteSpace($status)) {
    $status | ForEach-Object { Write-Log "  $_" }
}
if (-not [string]::IsNullOrWhiteSpace($untracked)) {
    $untracked | ForEach-Object { Write-Log "  ?? $_" }
}

# Add all changes
git add . 2>&1 | ForEach-Object { Write-Log "git add: $_" }
Write-Log "All changes added to staging area"

# Generate commit message
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$commitMessage = "Auto sync - $timestamp"

# Commit changes
$commitResult = git commit -m $commitMessage 2>&1
$commitResult | ForEach-Object { Write-Log "git commit: $_" }

if ($LASTEXITCODE -ne 0) {
    Write-Log "WARNING: Commit may have failed (exit code: $LASTEXITCODE)"
}

# Pull latest from remote
Write-Log "Pulling latest from remote..."
$pullResult = git pull --rebase origin main 2>&1
$pullResult | ForEach-Object { Write-Log "git pull: $_" }

if ($LASTEXITCODE -ne 0) {
    Write-Log "WARNING: Pull may have conflicts (exit code: $LASTEXITCODE)"
}

# Push to remote
Write-Log "Pushing to GitHub..."
$pushResult = git push origin main 2>&1
$pushResult | ForEach-Object { Write-Log "git push: $_" }

if ($LASTEXITCODE -eq 0) {
    Write-Log "SUCCESS: Pushed to GitHub!"
} else {
    Write-Log "FAILED: Push failed (exit code: $LASTEXITCODE)"
    Write-Log "Please check network connection and GitHub authentication"
}

Write-Log "===== Sync Complete ====="
