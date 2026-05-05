using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace GovernanceAssetValidator;

public static class Program
{
    public static int Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.Error.WriteLine("Usage: GovernanceAssetValidator <build|validate> [repoRoot]");
            return 2;
        }

        var mode = args[0];
        var repoRoot = args.Length > 1 ? args[1] : Directory.GetCurrentDirectory();
        var engine = new CatalogValidationEngine();

        if (string.Equals(mode, "build", StringComparison.OrdinalIgnoreCase))
        {
            var buildResult = engine.Build(repoRoot);
            if (!buildResult.IsSuccess)
            {
                foreach (var error in buildResult.Errors)
                {
                    Console.Error.WriteLine(error);
                }

                return 1;
            }

            Console.WriteLine($"Wrote {buildResult.JsonOutputPath}");
            Console.WriteLine($"Wrote {buildResult.MarkdownOutputPath}");
            return 0;
        }

        if (string.Equals(mode, "validate", StringComparison.OrdinalIgnoreCase))
        {
            var validationResult = engine.Validate(repoRoot);
            if (validationResult.IsValid)
            {
                Console.WriteLine("Validation succeeded.");
                return 0;
            }

            foreach (var error in validationResult.Errors)
            {
                Console.Error.WriteLine(error);
            }

            return 1;
        }

        Console.Error.WriteLine($"Unknown mode: {mode}");
        return 2;
    }
}

public sealed class CatalogValidationEngine
{
    private const string DeterministicGeneratedAt = "deterministic";

    private static readonly string[] RequiredFields =
    [
        "name",
        "summary",
        "asset_type",
        "status",
        "owners",
        "source_path"
    ];

    public CatalogBuildResult Build(string repoRoot)
    {
        var generation = Generate(repoRoot);
        if (generation.Errors.Count > 0)
        {
            return new CatalogBuildResult(false, generation.Errors, generation.JsonOutputPath, generation.MarkdownOutputPath);
        }

        Directory.CreateDirectory(Path.GetDirectoryName(generation.JsonOutputPath)!);
        Directory.CreateDirectory(Path.GetDirectoryName(generation.MarkdownOutputPath)!);
        File.WriteAllText(generation.JsonOutputPath, generation.JsonCatalog, Encoding.UTF8);
        File.WriteAllText(generation.MarkdownOutputPath, generation.MarkdownCatalog, Encoding.UTF8);

        return new CatalogBuildResult(true, [], generation.JsonOutputPath, generation.MarkdownOutputPath);
    }

    public CatalogValidationResult Validate(string repoRoot)
    {
        var generation = Generate(repoRoot);
        if (generation.Errors.Count > 0)
        {
            return new CatalogValidationResult(false, generation.Errors);
        }

        if (!File.Exists(generation.JsonOutputPath))
        {
            return new CatalogValidationResult(false, [$"Missing generated JSON catalog: {generation.JsonOutputPath}"]);
        }

        if (!File.Exists(generation.MarkdownOutputPath))
        {
            return new CatalogValidationResult(false, [$"Missing generated Markdown catalog: {generation.MarkdownOutputPath}"]);
        }

        var existingJson = NormalizeNewLines(File.ReadAllText(generation.JsonOutputPath));
        var existingMarkdown = NormalizeNewLines(File.ReadAllText(generation.MarkdownOutputPath));
        var expectedJson = NormalizeNewLines(generation.JsonCatalog);
        var expectedMarkdown = NormalizeNewLines(generation.MarkdownCatalog);

        var errors = new List<string>();
        if (!string.Equals(existingJson, expectedJson, StringComparison.Ordinal))
        {
            errors.Add("Drift detected: JSON catalog does not match generated output.");
        }

        if (!string.Equals(existingMarkdown, expectedMarkdown, StringComparison.Ordinal))
        {
            errors.Add("Drift detected: Markdown catalog does not match generated output.");
        }

        return new CatalogValidationResult(errors.Count == 0, errors);
    }

    private static string NormalizeNewLines(string value)
    {
        var normalized = value.Replace("\r\n", "\n").TrimEnd('\n');
        return normalized + "\n";
    }

    private static CatalogGenerationResult Generate(string repoRoot)
    {
        var errors = new List<string>();
        var sourcePath = Path.Combine(repoRoot, ".github", "planning", "assets", "asset-catalog-source.json");
        if (!File.Exists(sourcePath))
        {
            return new CatalogGenerationResult(string.Empty, string.Empty, string.Empty, string.Empty, [$"Missing source metadata: {sourcePath}"]);
        }

        var source = JsonSerializer.Deserialize<CatalogSourceFile>(File.ReadAllText(sourcePath), JsonOptions());
        if (source is null || source.Generation is null)
        {
            return new CatalogGenerationResult(string.Empty, string.Empty, string.Empty, string.Empty, ["Source metadata could not be parsed."]);
        }

        var discoveredFiles = DiscoverGovernanceFiles(repoRoot);
        var assets = new List<AssetRecord>();

        foreach (var fullPath in discoveredFiles)
        {
            var relativePath = ToForwardSlashPath(Path.GetRelativePath(repoRoot, fullPath));
            var frontmatter = FrontmatterParser.Parse(File.ReadAllText(fullPath));
            if (frontmatter.Count == 0)
            {
                errors.Add($"Missing frontmatter: {relativePath}");
                continue;
            }

            var name = ReadString(frontmatter, "name");
            var summary = ReadString(frontmatter, "summary") ?? ReadString(frontmatter, "description");
            var assetType = ReadString(frontmatter, "asset_type") ?? InferAssetType(relativePath);
            var status = ReadString(frontmatter, "status") ?? "active";
            var owners = ReadStringList(frontmatter, "owners");
            var sourcePathFromMeta = ReadString(frontmatter, "source_path") ?? relativePath;
            var assetId = ReadString(frontmatter, "asset_id") ?? $"{assetType}:{sourcePathFromMeta}";

            var missing = new List<string>();
            if (string.IsNullOrWhiteSpace(name)) missing.Add("name");
            if (string.IsNullOrWhiteSpace(summary)) missing.Add("summary");
            if (string.IsNullOrWhiteSpace(assetType)) missing.Add("asset_type");
            if (string.IsNullOrWhiteSpace(status)) missing.Add("status");
            if (owners.Count == 0) missing.Add("owners");
            if (string.IsNullOrWhiteSpace(sourcePathFromMeta)) missing.Add("source_path");

            if (missing.Count > 0)
            {
                errors.Add($"Missing required metadata field(s) in {relativePath}: {string.Join(", ", missing)}");
                continue;
            }

            if (!source.InScopeAssetTypes.Contains(assetType!, StringComparer.OrdinalIgnoreCase))
            {
                errors.Add($"Unsupported asset_type in {relativePath}: {assetType}");
                continue;
            }

            assets.Add(new AssetRecord(
                assetId!,
                name!,
                summary!,
                assetType!,
                status!,
                owners,
                ToForwardSlashPath(sourcePathFromMeta!)));
        }

        var duplicateIds = assets
            .GroupBy(a => a.AssetId, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();

        foreach (var duplicateId in duplicateIds)
        {
            errors.Add($"Duplicate asset id: {duplicateId}");
        }

        var jsonOutputPath = Path.Combine(repoRoot, ToPlatformPath(source.Generation.JsonOutputPath));
        var markdownOutputPath = Path.Combine(repoRoot, ToPlatformPath(source.Generation.MarkdownOutputPath));

        if (errors.Count > 0)
        {
            return new CatalogGenerationResult(string.Empty, string.Empty, jsonOutputPath, markdownOutputPath, errors);
        }

        var orderedAssets = assets
            .OrderBy(a => a.AssetType, StringComparer.OrdinalIgnoreCase)
            .ThenBy(a => a.SourcePath, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var catalogDocument = new
        {
            metadata = new
            {
                schema_version = source.SchemaVersion,
                generated_at_utc = DeterministicGeneratedAt,
                generated_by = source.GeneratedBy,
                in_scope_asset_types = source.InScopeAssetTypes,
                reserved_future_categories = source.ReservedFutureCategories,
                required_fields = RequiredFields
            },
            assets = orderedAssets.Select(a => new
            {
                asset_id = a.AssetId,
                name = a.Name,
                summary = a.Summary,
                asset_type = a.AssetType,
                status = a.Status,
                owners = a.Owners,
                source_path = a.SourcePath
            })
        };

        var jsonCatalog = JsonSerializer.Serialize(catalogDocument, JsonOptions(writeIndented: true));
        var markdownCatalog = BuildMarkdown(catalogDocument.metadata.reserved_future_categories, orderedAssets);

        return new CatalogGenerationResult(jsonCatalog, markdownCatalog, jsonOutputPath, markdownOutputPath, []);
    }

    private static List<string> DiscoverGovernanceFiles(string repoRoot)
    {
        var files = new List<string>();
        var promptsPath = Path.Combine(repoRoot, ".github", "prompts");
        var instructionsPath = Path.Combine(repoRoot, ".github", "instructions");
        var skillsPath = Path.Combine(repoRoot, ".github", "skills");

        if (Directory.Exists(promptsPath))
        {
            files.AddRange(Directory.GetFiles(promptsPath, "*.md", SearchOption.TopDirectoryOnly));
        }

        if (Directory.Exists(instructionsPath))
        {
            files.AddRange(Directory.GetFiles(instructionsPath, "*.instructions.md", SearchOption.TopDirectoryOnly));
        }

        if (Directory.Exists(skillsPath))
        {
            files.AddRange(Directory.GetFiles(skillsPath, "SKILL.md", SearchOption.AllDirectories));
        }

        return files;
    }

    private static string? InferAssetType(string relativePath)
    {
        if (relativePath.StartsWith(".github/prompts/", StringComparison.OrdinalIgnoreCase))
        {
            return "prompt";
        }

        if (relativePath.StartsWith(".github/instructions/", StringComparison.OrdinalIgnoreCase))
        {
            return "instruction";
        }

        if (relativePath.StartsWith(".github/skills/", StringComparison.OrdinalIgnoreCase))
        {
            return "skill";
        }

        return null;
    }

    private static string? ReadString(IReadOnlyDictionary<string, object> map, string key)
    {
        if (!map.TryGetValue(key, out var value))
        {
            return null;
        }

        return value as string;
    }

    private static IReadOnlyList<string> ReadStringList(IReadOnlyDictionary<string, object> map, string key)
    {
        if (!map.TryGetValue(key, out var value))
        {
            return [];
        }

        if (value is List<string> list)
        {
            return list;
        }

        if (value is string singleValue)
        {
            return [singleValue];
        }

        return [];
    }

    private static string ToForwardSlashPath(string path)
    {
        return path.Replace('\\', '/');
    }

    private static string ToPlatformPath(string path)
    {
        return path.Replace('/', Path.DirectorySeparatorChar);
    }

    private static JsonSerializerOptions JsonOptions(bool writeIndented = false)
    {
        return new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            WriteIndented = writeIndented
        };
    }

    private static string BuildMarkdown(IReadOnlyList<string> reservedCategories, IReadOnlyList<AssetRecord> assets)
    {
        var builder = new StringBuilder();
        builder.AppendLine("# Governance Asset Catalog");
        builder.AppendLine();
        builder.AppendLine("## Assets");
        builder.AppendLine();
        builder.AppendLine("| asset_id | asset_type | name | status | owners | source_path | summary |");
        builder.AppendLine("|---|---|---|---|---|---|---|");

        foreach (var asset in assets)
        {
            var owners = string.Join(", ", asset.Owners);
            builder.AppendLine($"| {EscapePipe(asset.AssetId)} | {EscapePipe(asset.AssetType)} | {EscapePipe(asset.Name)} | {EscapePipe(asset.Status)} | {EscapePipe(owners)} | {EscapePipe(asset.SourcePath)} | {EscapePipe(asset.Summary)} |");
        }

        builder.AppendLine();
        builder.AppendLine("## Reserved Future Categories");
        builder.AppendLine();
        foreach (var category in reservedCategories)
        {
            builder.AppendLine($"- {category}");
        }

        return builder.ToString();
    }

    private static string EscapePipe(string value)
    {
        return value.Replace("|", "\\|");
    }

    private sealed record CatalogGenerationResult(
        string JsonCatalog,
        string MarkdownCatalog,
        string JsonOutputPath,
        string MarkdownOutputPath,
        IReadOnlyList<string> Errors);

    private sealed record AssetRecord(
        string AssetId,
        string Name,
        string Summary,
        string AssetType,
        string Status,
        IReadOnlyList<string> Owners,
        string SourcePath);
}

internal static class FrontmatterParser
{
    public static IReadOnlyDictionary<string, object> Parse(string content)
    {
        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        var lines = content.Replace("\r\n", "\n").Split('\n');
        if (lines.Length < 3 || lines[0].Trim() != "---")
        {
            return result;
        }

        string? activeListKey = null;
        for (var i = 1; i < lines.Length; i++)
        {
            var line = lines[i];
            if (line.Trim() == "---")
            {
                break;
            }

            if (string.IsNullOrWhiteSpace(line))
            {
                activeListKey = null;
                continue;
            }

            var trimmed = line.Trim();
            if (trimmed.StartsWith("- ", StringComparison.Ordinal) && activeListKey is not null)
            {
                if (result[activeListKey] is not List<string> list)
                {
                    list = [];
                    result[activeListKey] = list;
                }

                list.Add(Unquote(trimmed.Substring(2).Trim()));
                continue;
            }

            var separatorIndex = trimmed.IndexOf(':');
            if (separatorIndex <= 0)
            {
                activeListKey = null;
                continue;
            }

            var key = trimmed[..separatorIndex].Trim();
            var value = trimmed[(separatorIndex + 1)..].Trim();
            if (string.IsNullOrEmpty(value))
            {
                activeListKey = key;
                result[key] = new List<string>();
            }
            else
            {
                activeListKey = null;
                result[key] = Unquote(value);
            }
        }

        return result;
    }

    private static string Unquote(string value)
    {
        if (value.Length >= 2 &&
            ((value.StartsWith('"') && value.EndsWith('"')) || (value.StartsWith('\'') && value.EndsWith('\''))))
        {
            return value[1..^1];
        }

        return value;
    }
}

public sealed record CatalogBuildResult(
    bool IsSuccess,
    IReadOnlyList<string> Errors,
    string JsonOutputPath,
    string MarkdownOutputPath);

public sealed record CatalogValidationResult(bool IsValid, IReadOnlyList<string> Errors);

internal sealed class CatalogSourceFile
{
    [System.Text.Json.Serialization.JsonPropertyName("schema_version")]
    public string SchemaVersion { get; init; } = "1.0.0";

    [System.Text.Json.Serialization.JsonPropertyName("generated_by")]
    public string GeneratedBy { get; init; } = "governance-asset-validator";

    [System.Text.Json.Serialization.JsonPropertyName("in_scope_asset_types")]
    public List<string> InScopeAssetTypes { get; init; } = [];

    [System.Text.Json.Serialization.JsonPropertyName("reserved_future_categories")]
    public List<string> ReservedFutureCategories { get; init; } = [];

    [System.Text.Json.Serialization.JsonPropertyName("generation")]
    public CatalogGenerationSection? Generation { get; init; }
}

internal sealed class CatalogGenerationSection
{
    [System.Text.Json.Serialization.JsonPropertyName("json_output_path")]
    public string JsonOutputPath { get; init; } = string.Empty;

    [System.Text.Json.Serialization.JsonPropertyName("markdown_output_path")]
    public string MarkdownOutputPath { get; init; } = string.Empty;
}
