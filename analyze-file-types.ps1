#!/usr/bin/env pwsh
<#
.SYNOPSIS
Analyzes file types in the repository to identify patterns and potential gitignore candidates.
#>

param(
    [string]$RepositoryPath = (Get-Location),
    [int]$TopCount = 30
)

Write-Host "Analyzing file types in repository: $RepositoryPath" -ForegroundColor Cyan
Write-Host ""

$files = @(git -C $RepositoryPath ls-files)
Write-Host "Total tracked files: $($files.Count)" -ForegroundColor Green

# Analyze by extension
$extensionStats = @{}
$noExtensionCount = 0

foreach ($file in $files) {
    if ([System.IO.Path]::HasExtension($file)) {
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
    } else {
        $ext = "(no extension)"
        $noExtensionCount++
    }
    
    if ($extensionStats.ContainsKey($ext)) {
        $extensionStats[$ext]++
    } else {
        $extensionStats[$ext] = 1
    }
}

Write-Host "`n=== FILE TYPES BY COUNT (Top $TopCount) ===" -ForegroundColor Cyan
$sorted = $extensionStats.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First $TopCount

foreach ($item in $sorted) {
    $pct = [math]::Round(($item.Value / $files.Count) * 100, 2)
    Write-Host "$($item.Key.PadRight(20)) : $($item.Value.ToString().PadLeft(6)) files ($($pct.ToString().PadLeft(5))%)"
}

# Analyze by directory patterns
Write-Host "`n=== TOP DIRECTORIES BY FILE COUNT ===" -ForegroundColor Cyan
$dirStats = @{}

foreach ($file in $files) {
    $dir = Split-Path -Path $file -Parent
    if (-not $dir) { $dir = "(root)" }
    
    if ($dirStats.ContainsKey($dir)) {
        $dirStats[$dir]++
    } else {
        $dirStats[$dir] = 1
    }
}

$sortedDirs = $dirStats.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 20

foreach ($item in $sortedDirs) {
    $pct = [math]::Round(($item.Value / $files.Count) * 100, 2)
    Write-Host "$($item.Key.PadRight(50)) : $($item.Value.ToString().PadLeft(6)) files ($($pct.ToString().PadLeft(5))%)"
}

# Identify potential build artifacts and cache patterns
Write-Host "`n=== POTENTIAL BUILD ARTIFACTS & CACHE FILES ===" -ForegroundColor Yellow

$artifacts = @{
    "bin/" = 0
    "obj/" = 0
    ".vs/" = 0
    "node_modules/" = 0
    ".dist/" = 0
    ".build/" = 0
    ".cache/" = 0
    "*.dll" = 0
    "*.pdb" = 0
    "*.exe" = 0
    "*.o" = 0
    ".git/objects/" = 0
}

foreach ($file in $files) {
    if ($file -like "*bin/*") { $artifacts["bin/"]++ }
    if ($file -like "*obj/*") { $artifacts["obj/"]++ }
    if ($file -like "*.vs/*") { $artifacts[".vs/"]++ }
    if ($file -like "*node_modules/*") { $artifacts["node_modules/"]++ }
    if ($file -like "*dist/*") { $artifacts[".dist/"]++ }
    if ($file -like "*build/*") { $artifacts[".build/"]++ }
    if ($file -like "*cache/*") { $artifacts[".cache/"]++ }
    if ($file -like "*.dll") { $artifacts["*.dll"]++ }
    if ($file -like "*.pdb") { $artifacts["*.pdb"]++ }
    if ($file -like "*.exe") { $artifacts["*.exe"]++ }
    if ($file -like "*.o") { $artifacts["*.o"]++ }
}

$foundArtifacts = $artifacts.GetEnumerator() | Where-Object { $_.Value -gt 0 } | Sort-Object -Property Value -Descending

if ($foundArtifacts) {
    foreach ($item in $foundArtifacts) {
        Write-Host "$($item.Key.PadRight(30)) : $($item.Value.ToString().PadLeft(6)) files"
    }
} else {
    Write-Host "No obvious build artifacts found in tracked files" -ForegroundColor Green
}

# Summary statistics
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total tracked files: $($files.Count)"
Write-Host "Total unique extensions: $($extensionStats.Count)"
Write-Host "Files with no extension: $noExtensionCount"

$largestExtension = $sorted[0]
Write-Host "Most common type: $($largestExtension.Key) ($($largestExtension.Value) files, $([math]::Round(($largestExtension.Value / $files.Count) * 100, 2))%)"
