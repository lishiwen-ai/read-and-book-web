# Git Auto Push Script - Dual Platform (GitHub + Gitee)
# Automatically detect file changes and push to both GitHub and Gitee
# Run this script from the project directory

$ErrorActionPreference = "Continue"

# Use current directory as project path
$ProjectPath = Get-Location
$LogPath = Join-Path $ProjectPath "git-auto-push.log"

# Remote names
$GitHubRemote = "origin"
$GiteeRemote = "gitee"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    try {
        Out-File -FilePath $LogPath -InputObject $logMessage -Append -Encoding utf8 -ErrorAction SilentlyContinue
    } catch {}
}

Write-Log "===== Start Auto Push Check (Dual Platform) ====="
Write-Log "Project path: $ProjectPath"

# Check if it's a git repository
if (-not (Test-Path ".git")) {
    Write-Log "ERROR: Not a Git repository"
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

# ========== Push to GitHub ==========
Write-Log "--- Pushing to GitHub ---"
$hasGitHubRemote = git remote | Where-Object { $_ -eq $GitHubRemote }
if ($hasGitHubRemote) {
    # Pull first
    Write-Log "Pulling latest from GitHub..."
    $pullResult = git pull --rebase $GitHubRemote main 2>&1
    $pullResult | ForEach-Object { Write-Log "git pull (GitHub): $_" }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Log "WARNING: GitHub pull may have conflicts (exit code: $LASTEXITCODE)"
    }
    
    # Push
    Write-Log "Pushing to GitHub..."
    $pushResult = git push $GitHubRemote main 2>&1
    $pushResult | ForEach-Object { Write-Log "git push (GitHub): $_" }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Log "SUCCESS: Pushed to GitHub!"
    } else {
        Write-Log "FAILED: GitHub push failed (exit code: $LASTEXITCODE)"
    }
} else {
    Write-Log "SKIP: GitHub remote '$GitHubRemote' not found"
}

# ========== Push to Gitee ==========
Write-Log "--- Pushing to Gitee ---"
$hasGiteeRemote = git remote | Where-Object { $_ -eq $GiteeRemote }
if ($hasGiteeRemote) {
    # Pull first
    Write-Log "Pulling latest from Gitee..."
    $pullResult = git pull --rebase $GiteeRemote main 2>&1
    $pullResult | ForEach-Object { Write-Log "git pull (Gitee): $_" }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Log "WARNING: Gitee pull may have conflicts (exit code: $LASTEXITCODE)"
    }
    
    # Push
    Write-Log "Pushing to Gitee..."
    $pushResult = git push $GiteeRemote main 2>&1
    $pushResult | ForEach-Object { Write-Log "git push (Gitee): $_" }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Log "SUCCESS: Pushed to Gitee!"
    } else {
        Write-Log "FAILED: Gitee push failed (exit code: $LASTEXITCODE)"
    }
} else {
    Write-Log "SKIP: Gitee remote '$GiteeRemote' not found"
}

Write-Log "===== Sync Complete ====="
