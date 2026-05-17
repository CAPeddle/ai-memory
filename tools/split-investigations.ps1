
# split-investigations.ps1 — Task 4.2: Split top-level investigation docs
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

function ConvertTo-Slug ([string]$heading) {
    $clean = $heading -replace "^#+\s+", ""
    $clean = $clean -replace "^[\d§R]+[-–—. ]+", ""
    $clean = $clean.ToLower() -replace "[^a-z0-9]+", "-" -replace "^-|-$", ""
    if ($clean.Length -gt 50) { $clean = $clean.Substring(0, 50).TrimEnd("-") }
    if (-not $clean) { $clean = "section" }
    return $clean
}

function Split-InvestigationDoc ([string]$srcPath, [string]$fragmentFolder, [string]$rwKey) {
    $lines = Get-Content $srcPath
    $totalLines = $lines.Count

    # --- Parse preamble (before first ##) and sections ---
    $preamble     = [System.Collections.Generic.List[string]]::new()
    $sections     = [System.Collections.Generic.List[hashtable]]::new()
    $curHeading   = $null
    $curLines     = [System.Collections.Generic.List[string]]::new()
    $inPreamble   = $true

    foreach ($line in $lines) {
        if ($line -match "^## ") {
            if ($inPreamble) {
                $preamble.AddRange($curLines)
                $inPreamble = $false
            } else {
                if ($null -ne $curHeading) {
                    $sections.Add(@{ Heading = $curHeading; Lines = ($curLines.ToArray()) })
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
        $sections.Add(@{ Heading = $curHeading; Lines = ($curLines.ToArray()) })
    }
    if ($sections.Count -eq 0) {
        # No ## headings — treat entire file as single fragment
        $sections.Add(@{ Heading = "## Content"; Lines = $lines })
    }

    # --- Create fragment folder ---
    New-Item -ItemType Directory -Path $fragmentFolder -Force | Out-Null

    # --- Write fragment files and collect links ---
    $fragmentLinks = @()
    $seenSlugs     = @{}
    $idx = 1

    foreach ($sec in $sections) {
        $slug = ConvertTo-Slug $sec.Heading
        # Handle duplicate slugs
        if ($seenSlugs.ContainsKey($slug)) {
            $seenSlugs[$slug]++
            $slug = "$slug-$($seenSlugs[$slug])"
        } else {
            $seenSlugs[$slug] = 1
        }
        $fragFileName = $idx.ToString("D2") + "-$slug.md"
        $fragPath = "$fragmentFolder/$fragFileName"

        $sectionContent = $sec.Lines

        # Check if this section needs ### subsection splitting (250+ lines OR 4+ ### blocks)
        $sectionLineCount = $sectionContent.Count
        $tripleHashCount  = ($sectionContent | Where-Object { $_ -match "^### " }).Count

        if ($sectionLineCount -gt 250 -or $tripleHashCount -ge 4) {
            # Split further into ### fragments
            $subSections  = [System.Collections.Generic.List[hashtable]]::new()
            $subPre       = [System.Collections.Generic.List[string]]::new()
            $subHeading   = $null
            $subLines     = [System.Collections.Generic.List[string]]::new()
            $inSubPre     = $true

            foreach ($sl in $sectionContent) {
                if ($sl -match "^### ") {
                    if ($inSubPre) {
                        $subPre.AddRange($subLines)
                        $inSubPre = $false
                    } else {
                        if ($null -ne $subHeading) {
                            $subSections.Add(@{ Heading = $subHeading; Lines = ($subLines.ToArray()) })
                        }
                    }
                    $subHeading = $sl
                    $subLines = [System.Collections.Generic.List[string]]::new()
                    $subLines.Add($sl)
                } else {
                    $subLines.Add($sl)
                }
            }
            if ($null -ne $subHeading) {
                $subSections.Add(@{ Heading = $subHeading; Lines = ($subLines.ToArray()) })
            }

            if ($subSections.Count -le 1) {
                # Can't split further — write as single fragment
                $sectionContent | Set-Content $fragPath -Encoding UTF8
            } else {
                # Write supra-section landing + sub-fragments
                $secSlugForDir = ConvertTo-Slug $sec.Heading
                $subDir = "$fragmentFolder/$($idx.ToString("D2"))-$secSlugForDir"
                New-Item -ItemType Directory -Path $subDir -Force | Out-Null

                # Write preamble of the section as intro
                $titletxt = $sec.Heading -replace "^##\s+", ""
                $subLandingLines = @(
                    "# $titletxt",
                    "",
                    "> Part of: [$(Split-Path $fragmentFolder -Leaf)](../$(Split-Path $fragPath -Leaf -ErrorAction SilentlyContinue).md)",
                    ""
                )
                if ($subPre.Count -gt 0) {
                    $subLandingLines += $subPre.ToArray()
                    $subLandingLines += ""
                }
                $subLandingLines += "## Sub-sections"
                $subLandingLines += ""

                $subIdx = 1
                $seenSubSlugs = @{}
                foreach ($ss in $subSections) {
                    $subSlug = ConvertTo-Slug $ss.Heading
                    if ($seenSubSlugs.ContainsKey($subSlug)) {
                        $seenSubSlugs[$subSlug]++
                        $subSlug = "$subSlug-$($seenSubSlugs[$subSlug])"
                    } else {
                        $seenSubSlugs[$subSlug] = 1
                    }
                    $subFragFile = $subIdx.ToString("D2") + "-$subSlug.md"
                    $subFragPath = "$subDir/$subFragFile"
                    $ss.Lines | Set-Content $subFragPath -Encoding UTF8
                    $subLandingLines += "- [$($ss.Heading -replace '^###\s+', '')]($subFragFile)"
                    $subIdx++
                }

                $subLanding = "$subDir/_index.md"
                $subLandingLines | Set-Content $subLanding -Encoding UTF8

                # The top-level fragment file points into the sub-dir
                @(
                    "# $titletxt",
                    "",
                    "This section is split into focused sub-fragments.",
                    "",
                    "See the [section index](./$($idx.ToString("D2"))-$secSlugForDir/_index.md) for navigation.",
                    "",
                    (($sec.Lines | Select-Object -First 5) -join "`n")
                ) | Set-Content $fragPath -Encoding UTF8
            }
        } else {
            $sectionContent | Set-Content $fragPath -Encoding UTF8
        }

        $displayHeading = $sec.Heading -replace "^##\s+", ""
        $fragmentLinks += @{
            Index   = $idx
            Heading = $displayHeading
            RelPath = "./$fragFileName"
        }
        $idx++
    }

    # --- Build landing page ---
    $title = ($preamble | Where-Object { $_ -match "^# " } | Select-Object -First 1) -replace "^# ", ""
    if (-not $title) { $title = (Split-Path $srcPath -LeafBase) }

    $rwDesc = if ($readWhen.ContainsKey($rwKey)) { $readWhen[$rwKey] } else { "See fragment map below." }

    $landing = [System.Collections.Generic.List[string]]::new()

    # Preserve original preamble (title + metadata table)
    $preamble | ForEach-Object { $landing.Add($_) }
    # Strip trailing blanks; ensure exactly one --- separator before new sections
    while ($landing.Count -gt 0 -and [string]::IsNullOrWhiteSpace($landing[-1])) { $landing.RemoveAt($landing.Count - 1) }
    if ($landing.Count -eq 0 -or $landing[-1] -ne "---") { $landing.Add("---") }
    $landing.Add("")
    $landing.Add("## Read This When")
    $landing.Add("")
    $landing.Add($rwDesc)
    $landing.Add("")
    $landing.Add("---")
    $landing.Add("")
    $landing.Add("## Fragment Map")
    $landing.Add("")
    $landing.Add("| # | Section | Fragment |")
    $landing.Add("|---|---|---|")
    foreach ($fl in $fragmentLinks) {
        $landing.Add("| $($fl.Index) | $($fl.Heading) | [$($fl.Heading)]($($fl.RelPath)) |")
    }
    $landing.Add("")
    $landing.Add($DA_NOTE)

    $landing | Set-Content $srcPath -Encoding UTF8

    Write-Host "  Split: $(Split-Path $srcPath -Leaf) -> $($fragmentLinks.Count) fragments in $fragmentFolder"
    return $fragmentLinks.Count
}

# --- Process all top-level investigation files ---
$totalFragments = 0
$topLevel = Get-ChildItem docs\investigations -File -Filter "*.md" | Where-Object { $_.Name -notmatch "^_|split-" } | Sort-Object Name

foreach ($file in $topLevel) {
    $base = $file.BaseName
    $fragmentFolder = "docs/investigations/$base"
    $rwKey = $base
    $count = Split-InvestigationDoc -srcPath $file.FullName -fragmentFolder $fragmentFolder -rwKey $rwKey
    $totalFragments += $count
}

Write-Host ""
Write-Host "=== Task 4.2 Complete ==="
Write-Host "Total fragments created: $totalFragments"
Write-Host "Top-level files rewritten as landing pages: $($topLevel.Count)"
