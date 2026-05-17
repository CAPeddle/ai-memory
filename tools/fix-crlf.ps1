
# fix-crlf.ps1 — Remove double blank lines from investigation landing pages
Set-Location c:\projects\ai-memory

$topLevel = Get-ChildItem docs\investigations -File -Filter "*.md" | Where-Object {
    $_.Name -notlike "_*" -and $_.Name -notlike "split-*"
}

foreach ($file in $topLevel) {
    $lines = Get-Content $file.FullName
    $clean = [System.Collections.Generic.List[string]]::new()
    $prevBlank = $false
    foreach ($line in $lines) {
        $trimmed = $line.TrimEnd()
        $isBlank = [string]::IsNullOrWhiteSpace($trimmed)
        if (-not ($isBlank -and $prevBlank)) {
            $clean.Add($trimmed)
        }
        $prevBlank = $isBlank
    }
    # Remove trailing blank lines
    while ($clean.Count -gt 0 -and [string]::IsNullOrWhiteSpace($clean[$clean.Count - 1])) {
        $clean.RemoveAt($clean.Count - 1)
    }
    $clean | Set-Content $file.FullName -Encoding UTF8
    Write-Host "Cleaned: $($file.Name) ($($lines.Count) -> $($clean.Count) lines)"
}

Write-Host "Done"
