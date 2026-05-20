
# normalize-nested-trees.ps1 — Task 4.3: Normalize nested investigation trees
# Processes Discussions/ and Youtube/ subdirectories
# Run from: c:\projects\ai-memory

Set-Location c:\projects\ai-memory

$DA_NOTE = @"

## Design Authority Note

This is a **Tier 2 Reference** document. Consult it for context and rationale.
Binding decisions live in [SRS](../../../requirements/SRS.md), [ADRs](../../../design/adr/), and [SystemDesign.md](../../../design/SystemDesign.md).
"@

function ConvertTo-Slug ([string]$heading) {
    $clean = $heading -replace "^#+\s+", ""
    $clean = $clean -replace "^[\d§R]+[-–—. ]+", ""
    $clean = $clean.ToLower() -replace "[^a-z0-9]+", "-" -replace "^-|-$", ""
    if ($clean.Length -gt 50) { $clean = $clean.Substring(0, 50).TrimEnd("-") }
    if (-not $clean) { $clean = "section" }
    return $clean
}

function Split-NestedDoc ([string]$srcPath) {
    $lines = Get-Content $srcPath
    $lineCount = $lines.Count
    $tripleHash = ($lines | Where-Object { $_ -match "^### " }).Count
    $sections = @()
    $preamble = [System.Collections.Generic.List[string]]::new()
    $curHeading = $null
    $curLines = [System.Collections.Generic.List[string]]::new()
    $inPreamble = $true

    # Check for ## headings
    $hasDoubleHash = ($lines | Where-Object { $_ -match "^## " }).Count -gt 0

    if (-not $hasDoubleHash) {
        # No ## headings: treat as single fragment
        return @{ Type = "single"; Lines = $lines; Preamble = @() }
    }

    foreach ($line in $lines) {
        if ($line -match "^## ") {
            if ($inPreamble) {
                $preamble.AddRange($curLines)
                $inPreamble = $false
            } else {
                if ($null -ne $curHeading) {
                    $sections += @{ Heading = $curHeading; Lines = $curLines.ToArray() }
                }
            }
            $curHeading = $line
            $curLines = [System.Collections.Generic.List[string]]::new()
            $curLines.Add($line)
        } else {
            $curLines.Add($line)
        }
    }
    if ($null -ne $curHeading) {
        $sections += @{ Heading = $curHeading; Lines = $curLines.ToArray() }
    }

    return @{ Type = "multi"; Preamble = $preamble.ToArray(); Sections = $sections }
}

# ==========================================
# Process Discussions/ subtree
# ==========================================

$discussionsDir = "docs\investigations\Discussions"
$discFiles = Get-ChildItem $discussionsDir -File -Filter "*.md" | Where-Object { $_.Name -notlike "_*" } | Sort-Object Name

$indexLinks = @()

foreach ($file in $discFiles) {
    $result = Split-NestedDoc $file.FullName
    $fileBase = $file.BaseName
    $fragLinks = @()

    if ($result.Type -eq "single") {
        # Create a sibling fragment with full content
        $fragFile = "$discussionsDir/$(ConvertTo-Slug $fileBase)-full.md"
        $result.Lines | Set-Content $fragFile -Encoding UTF8
        $fragLinks += @{ FileName = Split-Path $fragFile -Leaf; Heading = $fileBase }
        Write-Host "  No ## headings: $($file.Name) -> single fragment"
    } else {
        # Create sibling fragments per ## section
        $seenSlugs = @{}
        $idx = 1
        foreach ($sec in $result.Sections) {
            $slug = ConvertTo-Slug $sec.Heading
            if ($seenSlugs.ContainsKey($slug)) { $seenSlugs[$slug]++; $slug = "$slug-$($seenSlugs[$slug])" }
            else { $seenSlugs[$slug] = 1 }
            $fragFile = "$discussionsDir/$($idx.ToString("D2"))-$(ConvertTo-Slug $fileBase)-$slug.md"
            $sec.Lines | Set-Content $fragFile -Encoding UTF8
            $fragLinks += @{ FileName = Split-Path $fragFile -Leaf; Heading = ($sec.Heading -replace "^##\s+", "") }
            $idx++
        }
        Write-Host "  Split: $($file.Name) -> $($result.Sections.Count) fragments"
    }

    # Build landing page for this nested file
    $landing = [System.Collections.Generic.List[string]]::new()
    if ($result.Preamble -and $result.Preamble.Count -gt 0) {
        $result.Preamble | ForEach-Object { $landing.Add($_.TrimEnd()) }
    } else {
        $landing.Add("# $fileBase")
        $landing.Add("")
        $landing.Add("> Research discussion. Tier 2 reference only.")
    }
    while ($landing.Count -gt 0 -and [string]::IsNullOrWhiteSpace($landing[-1])) { $landing.RemoveAt($landing.Count - 1) }
    if ($landing.Count -eq 0 -or $landing[-1] -ne "---") { $landing.Add("---") }
    $landing.Add("")
    $landing.Add("## Read This When")
    $landing.Add("")
    $landing.Add("Reviewing the original discussion or research notes for context behind investigation findings.")
    $landing.Add("")
    $landing.Add("---")
    $landing.Add("")
    $landing.Add("## Fragment Map")
    $landing.Add("")
    $landing.Add("| # | Section | Fragment |")
    $landing.Add("|---|---|---|")
    $i = 1
    foreach ($fl in $fragLinks) {
        $landing.Add("| $i | $($fl.Heading) | [$($fl.Heading)](./$($fl.FileName)) |")
        $i++
    }
    $landing.Add("")
    $landing.Add($DA_NOTE)
    $landing | Set-Content $file.FullName -Encoding UTF8

    $indexLinks += @{ FileName = $file.Name; Title = $fileBase; FragCount = $fragLinks.Count }
}

# Create Discussions/_index.md
$discIndex = [System.Collections.Generic.List[string]]::new()
$discIndex.Add("# Discussions — Research Conversations")
$discIndex.Add("")
$discIndex.Add("| Field | Value |")
$discIndex.Add("|---|---|")
$discIndex.Add("| **Scope** | Supporting research conversations that informed investigation docs |")
$discIndex.Add("| **Tier** | Tier 2 Reference — consult for context only |")
$discIndex.Add("")
$discIndex.Add("---")
$discIndex.Add("")
$discIndex.Add("## Read This When")
$discIndex.Add("")
$discIndex.Add("Reviewing the original AI-memory research discussions for context behind investigation findings and architectural decisions.")
$discIndex.Add("")
$discIndex.Add("---")
$discIndex.Add("")
$discIndex.Add("## Document Index")
$discIndex.Add("")
$discIndex.Add("| Document | Description | Fragments |")
$discIndex.Add("|---|---|---|")
foreach ($il in $indexLinks) {
    $desc = switch ($il.FileName) {
        "Gemini Agile MD Storyboard.md"      { "Conversation about agent-driven agile storyboard design" }
        "MicrosoftCopilotProjectOverview.md" { "View-based hybrid memory system design overview" }
        "MicrosoftCopilotStorage.md"         { "Storage ADR discussion: options and decision" }
        "MicrosoftCopilotStorageBasedADR.md" { "Formal ADR: storage strategy with consequences" }
        default { "Research discussion" }
    }
    $discIndex.Add("| [$($il.FileName)](./$($il.FileName)) | $desc | $($il.FragCount) |")
}
$discIndex | Set-Content "$discussionsDir\_index.md" -Encoding UTF8
Write-Host "Created: Discussions/_index.md"

# ==========================================
# Process Youtube/ subtree
# ==========================================

$youtubeDir = "docs\investigations\Youtube"
$ytFiles = Get-ChildItem $youtubeDir -File -Filter "*.md" | Where-Object { $_.Name -notlike "_*" } | Sort-Object Name
$ytIndexLinks = @()

foreach ($file in $ytFiles) {
    $result = Split-NestedDoc $file.FullName
    $fileBase = $file.BaseName
    $fragLinks = @()

    if ($result.Type -eq "single") {
        # No headings - single-fragment with content note
        $slug = ConvertTo-Slug $fileBase
        $fragFile = "$youtubeDir/01-$slug-transcript.md"
        $result.Lines | Set-Content $fragFile -Encoding UTF8
        $fragLinks += @{ FileName = Split-Path $fragFile -Leaf; Heading = "Full Transcript / Notes" }
        Write-Host "  No ## headings: $($file.Name) -> single transcript fragment"
    } else {
        $seenSlugs = @{}
        $idx = 1
        foreach ($sec in $result.Sections) {
            $slug = ConvertTo-Slug $sec.Heading
            if ($seenSlugs.ContainsKey($slug)) { $seenSlugs[$slug]++; $slug = "$slug-$($seenSlugs[$slug])" }
            else { $seenSlugs[$slug] = 1 }
            $fragFile = "$youtubeDir/$($idx.ToString("D2"))-$(ConvertTo-Slug $fileBase)-$slug.md"
            $sec.Lines | Set-Content $fragFile -Encoding UTF8
            $fragLinks += @{ FileName = Split-Path $fragFile -Leaf; Heading = ($sec.Heading -replace "^##\s+", "") }
            $idx++
        }
        Write-Host "  Split: $($file.Name) -> $($result.Sections.Count) fragments"
    }

    # Build landing page
    $landing = [System.Collections.Generic.List[string]]::new()
    $landing.Add("# $fileBase")
    $landing.Add("")
    $landing.Add("> YouTube research notes and transcript. Tier 2 Reference only.")
    $landing.Add("")
    $landing.Add("---")
    $landing.Add("")
    $landing.Add("## Read This When")
    $landing.Add("")
    $landing.Add("Reviewing the original YouTube research notes for context behind investigation findings on AI memory systems.")
    $landing.Add("")
    $landing.Add("---")
    $landing.Add("")
    $landing.Add("## Fragment Map")
    $landing.Add("")
    $landing.Add("| # | Section | Fragment |")
    $landing.Add("|---|---|---|")
    $i = 1
    foreach ($fl in $fragLinks) {
        $landing.Add("| $i | $($fl.Heading) | [$($fl.Heading)](./$($fl.FileName)) |")
        $i++
    }
    $landing.Add("")
    $landing.Add($DA_NOTE)
    $landing | Set-Content $file.FullName -Encoding UTF8

    $ytIndexLinks += @{ FileName = $file.Name; Title = $fileBase; FragCount = $fragLinks.Count }
}

# Create Youtube/_index.md
$ytIndex = [System.Collections.Generic.List[string]]::new()
$ytIndex.Add("# YouTube — Research Video Notes")
$ytIndex.Add("")
$ytIndex.Add("| Field | Value |")
$ytIndex.Add("|---|---|")
$ytIndex.Add("| **Scope** | Research notes and transcripts from YouTube videos on AI memory systems |")
$ytIndex.Add("| **Tier** | Tier 2 Reference — consult for context only |")
$ytIndex.Add("")
$ytIndex.Add("---")
$ytIndex.Add("")
$ytIndex.Add("## Read This When")
$ytIndex.Add("")
$ytIndex.Add("Reviewing YouTube research that informed the investigation docs on AI memory architectures and Open Brain.")
$ytIndex.Add("")
$ytIndex.Add("---")
$ytIndex.Add("")
$ytIndex.Add("## Video Index")
$ytIndex.Add("")
$ytIndex.Add("| Document | Description | Fragments |")
$ytIndex.Add("|---|---|---|")
foreach ($il in $ytIndexLinks) {
    $desc = switch ($il.FileName) {
        "Nate B Jones on Open Brain vs LLM Wiki.md" { "Discussion: Open Brain vs LLM Wiki comparison" }
        "Simon Scrapes on AI Memory.md"              { "Notes/transcript: Simon Scrapes on AI memory systems" }
        default { "Research video notes" }
    }
    $ytIndex.Add("| [$($il.FileName)](./$($il.FileName)) | $desc | $($il.FragCount) |")
}
$ytIndex | Set-Content "$youtubeDir\_index.md" -Encoding UTF8
Write-Host "Created: Youtube/_index.md"

# Verification
Write-Host ""
Write-Host "=== Task 4.3 Verification ==="
Write-Host "Discussions/_index.md: $(Test-Path "$discussionsDir\_index.md")"
Write-Host "Youtube/_index.md: $(Test-Path "$youtubeDir\_index.md")"
Write-Host "Discussions files: $((Get-ChildItem $discussionsDir -Filter "*.md").Count)"
Write-Host "Youtube files: $((Get-ChildItem $youtubeDir -Filter "*.md").Count)"
