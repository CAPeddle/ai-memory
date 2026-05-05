using System;
using System.IO;
using FluentAssertions;
using GovernanceAssetValidator;
using Xunit;

namespace GovernanceAssetValidator.Tests;

public sealed class CatalogValidationTests
{
    [Fact]
    public void Validate_MissingRequiredMetadataField_ReturnsInvalid()
    {
        var repoRoot = CreateRepoRoot();
        WriteSourceMetadata(repoRoot);

        WriteAssetFile(repoRoot, ".github/instructions/missing-summary.instructions.md", """
---
name: "Missing Summary"
asset_type: "instruction"
status: "active"
owners:
  - "ai-memory-maintainers"
source_path: ".github/instructions/missing-summary.instructions.md"
---

# Placeholder
""");

        var engine = new CatalogValidationEngine();
        var result = engine.Validate(repoRoot);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_DuplicateAssetId_ReturnsInvalid()
    {
        var repoRoot = CreateRepoRoot();
        WriteSourceMetadata(repoRoot);

        WriteAssetFile(repoRoot, ".github/prompts/duplicate-a.prompt.md", """
---
name: "Duplicate A"
summary: "First duplicate"
asset_type: "prompt"
status: "active"
asset_id: "dup-asset"
owners:
  - "ai-memory-maintainers"
source_path: ".github/prompts/duplicate-a.prompt.md"
---

# Prompt A
""");

        WriteAssetFile(repoRoot, ".github/prompts/duplicate-b.prompt.md", """
---
name: "Duplicate B"
summary: "Second duplicate"
asset_type: "prompt"
status: "active"
asset_id: "dup-asset"
owners:
  - "ai-memory-maintainers"
source_path: ".github/prompts/duplicate-b.prompt.md"
---

# Prompt B
""");

        var engine = new CatalogValidationEngine();
        var result = engine.Validate(repoRoot);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_DriftBetweenMarkdownAndJson_ReturnsInvalid()
    {
        var repoRoot = CreateRepoRoot();
        WriteSourceMetadata(repoRoot);

        WriteAssetFile(repoRoot, ".github/skills/example/SKILL.md", """
---
name: "Example Skill"
summary: "Example skill"
asset_type: "skill"
status: "active"
owners:
  - "ai-memory-maintainers"
source_path: ".github/skills/example/SKILL.md"
---

# Skill
""");

        Directory.CreateDirectory(Path.Combine(repoRoot, ".github/planning/assets"));
        File.WriteAllText(Path.Combine(repoRoot, ".github/planning/assets/asset-catalog.json"), "{}");
        File.WriteAllText(Path.Combine(repoRoot, ".github/planning/assets/asset-catalog.md"), "# drifted");

        var engine = new CatalogValidationEngine();
        var result = engine.Validate(repoRoot);

        result.IsValid.Should().BeFalse();
    }

    private static string CreateRepoRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "gov-validator-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }

    private static void WriteSourceMetadata(string repoRoot)
    {
        var sourcePath = Path.Combine(repoRoot, ".github/planning/assets");
        Directory.CreateDirectory(sourcePath);
        File.WriteAllText(Path.Combine(sourcePath, "asset-catalog-source.json"), """
{
  "schema_version": "1.0.0",
  "source_version": "1.0.0",
  "generated_by": "governance-asset-validator",
  "in_scope_asset_types": ["prompt", "instruction", "skill"],
  "reserved_future_categories": ["agent", "hook", "workflow", "plugin"],
  "generation": {
    "json_output_path": ".github/planning/assets/asset-catalog.json",
    "markdown_output_path": ".github/planning/assets/asset-catalog.md"
  }
}
""");
    }

    private static void WriteAssetFile(string repoRoot, string relativePath, string content)
    {
        var fullPath = Path.Combine(repoRoot, relativePath.Replace('/', Path.DirectorySeparatorChar));
        var parent = Path.GetDirectoryName(fullPath)!;
        Directory.CreateDirectory(parent);
        File.WriteAllText(fullPath, content);
    }
}
