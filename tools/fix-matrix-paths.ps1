#!/usr/bin/env pwsh
# tools/fix-matrix-paths.ps1
# Fix stale destination paths in split-section-mapping-matrix.md
# Run from workspace root: c:\projects\ai-memory

Set-Location $PSScriptRoot/..

$matrixPath = "docs\investigations\split-section-mapping-matrix.md"
$content = Get-Content $matrixPath -Raw

# -----------------------------------------------------------------------
# Fix 1: workflow-and-prompt-design duplicate-slug rows (6 paths)
# Second occurrence of duplicate headings got -2 suffix in actual files
# -----------------------------------------------------------------------
$content = $content.Replace("docs/investigations/workflow-and-prompt-design/19-6b-surprises-discoveries.md", "docs/investigations/workflow-and-prompt-design/19-6b-surprises-discoveries-2.md")
$content = $content.Replace("docs/investigations/workflow-and-prompt-design/20-6c-decision-log.md", "docs/investigations/workflow-and-prompt-design/20-6c-decision-log-2.md")
$content = $content.Replace("docs/investigations/workflow-and-prompt-design/21-7b-outcomes-retrospective.md", "docs/investigations/workflow-and-prompt-design/21-7b-outcomes-retrospective-2.md")
$content = $content.Replace("docs/investigations/workflow-and-prompt-design/22-2b-definition-of-ready.md", "docs/investigations/workflow-and-prompt-design/22-2b-definition-of-ready-2.md")
$content = $content.Replace("docs/investigations/workflow-and-prompt-design/23-5b-recovery-ledger.md", "docs/investigations/workflow-and-prompt-design/23-5b-recovery-ledger-2.md")
$content = $content.Replace("docs/investigations/workflow-and-prompt-design/24-5c-approach-ledger.md", "docs/investigations/workflow-and-prompt-design/24-5c-approach-ledger-2.md")

# -----------------------------------------------------------------------
# Fix 2: Youtube sub-folder -> sibling fragments (3 paths)
# -----------------------------------------------------------------------
$content = $content.Replace("docs/investigations/Youtube/Nate B Jones on Open Brain vs LLM Wiki/01-content.md", "docs/investigations/Youtube/01-nate-b-jones-on-open-brain-vs-llm-wiki-transcript.md")
$content = $content.Replace("docs/investigations/Youtube/Simon Scrapes on AI Memory/01-links.md", "docs/investigations/Youtube/01-simon-scrapes-on-ai-memory-links.md")
$content = $content.Replace("docs/investigations/Youtube/Simon Scrapes on AI Memory/02-transcript.md", "docs/investigations/Youtube/02-simon-scrapes-on-ai-memory-transcript.md")

# -----------------------------------------------------------------------
# Fix 3: Discussions sub-folder -> sibling fragments
# For each source doc, collect actual sibling files and replace matrix placeholders.
# Actual: docs/investigations/Discussions/NN-<source-prefix>-<section-slug>.md
# Placeholder: docs/investigations/Discussions/<SourceName>/NN-<section-slug>.md
# -----------------------------------------------------------------------
function Repair-DiscussionsSource {
    param($content, $sourceName, $prefix)
    $actualFiles = Get-ChildItem "docs\investigations\Discussions" -Filter "*.md" |
        Where-Object { $_.Name -match ("^\d+-" + [regex]::Escape($prefix) + "-") }
    $count = 0
    foreach ($f in $actualFiles) {
        if ($f.Name -match ("^(\d+)-" + [regex]::Escape($prefix) + "-(.+)\.md$")) {
            $nn = $Matches[1]
            $slug = $Matches[2]
            $placeholder = "docs/investigations/Discussions/$sourceName/${nn}-${slug}.md"
            $actual = "docs/investigations/Discussions/$($f.Name)"
            if ($content.Contains($placeholder)) {
                $content = $content.Replace($placeholder, $actual)
                $count++
            }
        }
    }
    Write-Host "  $sourceName`: $count fixes"
    return $content
}

$content = Repair-DiscussionsSource $content "Gemini Agile MD Storyboard" "gemini-agile-md-storyboard"
$content = Repair-DiscussionsSource $content "MicrosoftCopilotProjectOverview" "microsoftcopilotprojectoverview"
$content = Repair-DiscussionsSource $content "MicrosoftCopilotStorage" "microsoftcopilotstorage"
$content = Repair-DiscussionsSource $content "MicrosoftCopilotStorageBasedADR" "microsoftcopilotstoragebasedadr"

Set-Content $matrixPath $content -Encoding UTF8 -NoNewline
Write-Host "Matrix repair complete."

# Verify - report any still-missing paths
$stillMissing = 0
$rows = (Get-Content $matrixPath) | Where-Object { $_ -match "^\| docs/" }
foreach ($row in $rows) {
    $parts = $row -split "\|"
    if ($parts.Count -ge 4) {
        $dest = $parts[3].Trim()
        if ($dest -ne "" -and $dest -ne "Destination path" -and !(Test-Path $dest)) {
            $stillMissing++
            Write-Host "  STILL MISSING: $dest"
        }
    }
}
if ($stillMissing -eq 0) { Write-Host "PASS: all destination paths exist." } else { Write-Host "FAIL: $stillMissing paths still missing." }
