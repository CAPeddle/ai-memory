
# repair-landing-pages.ps1 — Repair landing pages after double-run issue
# Removes bad fragments, rebuilds Fragment Map from correct fragment files
# Run from: c:\projects\ai-memory

Set-Location c:\projects\ai-memory

$DA_NOTE = @"

## Design Authority Note

This is a **Tier 2 Reference** document. Consult it for context and rationale behind approved decisions.
Binding requirements and architecture decisions live in the Tier 1 documents:
- [SRS v1.1](../../requirements/SRS.md)
- [ADRs](../../design/adr/)
- [SystemDesign.md](../../design/SystemDesign.md)
- [delivery-plan.md](../../planning/delivery-plan.md)
"@

$BAD_SLUGS = @("read-this-when", "fragment-map", "design-authority-note")

$readWhen = @{
    "awesome-copilot-applicability-review"    = "Reviewing repo governance and AI-customization asset patterns; deciding which awesome-copilot practices to adopt for prompts, instructions, and validation."
    "context-engineering-principles"          = "Designing prompts, context delivery strategies, or agent workflows; deciding what to include in agent context windows and how to avoid context bloat."
    "interface-design-mcp-rest"               = "Implementing or reviewing REST API or MCP server design; checking endpoint contracts, transport configuration, or service layer interfaces."
    "language-stack-recommendation"           = "Reviewing why C#/.NET 8 was chosen; evaluating SDK maturity, language trade-offs, or migration paths."
    "memory-architecture-design"              = "Implementing memory schemas, retrieval strategies, consolidation pipelines, or recall tracking. The primary technical design reference for the memory service."
    "memsearch-applicability-review"          = "Evaluating memsearch as an alternative or reference architecture; reviewing provider flexibility or progressive-disclosure recall UX patterns."
    "openbrain-pivot-evaluation"              = "Reviewing the Open Brain evaluation and rationale for adopting OB1 patterns; checking scoring matrix and impact assessment on backlog stories."
    "openclaw-memory-architecture-analysis"   = "Learning from openclaw's C#/SQLite implementation; reviewing retrieval strategies, schema patterns, and lessons applicable to ai-memory."
    "openclaw-official-docs-review"           = "Getting an overview of openclaw's official memory model; onboarding to memory lifecycle concepts or reviewing dreaming/consolidation design."
    "plan-openBrainPivotEvaluation.prompt"    = "Historical reference only — the planning prompt used for the OB1 pivot evaluation spike. Not an active governance file."
    "se-best-practices"                       = "Applying software engineering best practices; reviewing SOLID, DRY, design patterns, static analysis, and coverage guidance for C# code."
    "sqlite-vs-postgresql"                    = "Reviewing the database selection rationale; evaluating FTS5, vector search, concurrency, and operational trade-offs between SQLite and PostgreSQL."
    "ST-021-findings"                         = "Reviewing the Docker/AGE spike outcomes; understanding BM25+RRF validation, openCypher traversal results, context scoping design, and downstream story inputs."
    "workflow-and-prompt-design"              = "Designing workflow prompts, ExecPlan templates, board structure, or session resilience patterns. The primary planning governance reference."
}

$topLevel = Get-ChildItem docs\investigations -File -Filter "*.md" | Where-Object { $_.Name -notlike "_*" -and $_.Name -notlike "split-*" } | Sort-Object Name

foreach ($file in $topLevel) {
    $base = $file.BaseName
    $folder = "docs\investigations\$base"

    if (-not (Test-Path $folder)) {
        Write-Warning "Fragment folder missing for: $base"
        continue
    }

    # Step 1: Delete bad fragments created by second run
    foreach ($badSlug in $BAD_SLUGS) {
        Get-ChildItem $folder -Filter "*-$badSlug.md" | Remove-Item -Force
    }

    # Step 2: Get remaining correct fragment files in sorted order
    $fragments = Get-ChildItem $folder -Filter "*.md" | Where-Object { $_.Name -notlike "_*" } | Sort-Object Name

    if ($fragments.Count -eq 0) {
        Write-Warning "No fragments found for: $base"
        continue
    }

    # Step 3: Read heading from first line of each fragment
    $fragmentLinks = @()
    foreach ($frag in $fragments) {
        $firstLine = Get-Content $frag.FullName -TotalCount 1
        $heading = $firstLine -replace "^#+\s+", ""
        $fragmentLinks += @{ FileName = $frag.Name; Heading = $heading }
    }

    # Step 4: Extract preamble from current landing page (content before "---\n## Read This When")
    $landingContent = Get-Content $file.FullName -Raw

    # Extract preamble: everything before "## Read This When"
    $preambleMatch = [regex]::Match($landingContent, "(?s)^(.*?)\n---\n\n## Read This When")
    if ($preambleMatch.Success) {
        $preamble = $preambleMatch.Groups[1].Value.TrimEnd()
    } else {
        # Fallback: take first section up to first ---
        $preamble = ($landingContent -split "`n---`n")[0].TrimEnd()
    }

    # Step 5: Build new landing page
    $rwDesc = if ($readWhen.ContainsKey($base)) { $readWhen[$base] } else { "See fragment map below." }

    $newContent = [System.Collections.Generic.List[string]]::new()
    $preamble.Split("`n") | ForEach-Object { $newContent.Add($_) }

    # Ensure exactly one ---
    while ($newContent.Count -gt 0 -and [string]::IsNullOrWhiteSpace($newContent[-1])) { $newContent.RemoveAt($newContent.Count - 1) }
    if ($newContent.Count -eq 0 -or $newContent[-1] -ne "---") { $newContent.Add("---") }

    $newContent.Add("")
    $newContent.Add("## Read This When")
    $newContent.Add("")
    $newContent.Add($rwDesc)
    $newContent.Add("")
    $newContent.Add("---")
    $newContent.Add("")
    $newContent.Add("## Fragment Map")
    $newContent.Add("")
    $newContent.Add("| # | Section | Fragment |")
    $newContent.Add("|---|---|---|")
    $idx = 1
    foreach ($fl in $fragmentLinks) {
        $newContent.Add("| $idx | $($fl.Heading) | [$($fl.Heading)](./$($fl.FileName)) |")
        $idx++
    }
    $newContent.Add("")
    $newContent.Add($DA_NOTE)

    $newContent | Set-Content $file.FullName -Encoding UTF8
    Write-Host "Repaired: $($file.Name) -> $($fragmentLinks.Count) fragment links"
}

Write-Host ""
Write-Host "=== Repair Complete ==="
