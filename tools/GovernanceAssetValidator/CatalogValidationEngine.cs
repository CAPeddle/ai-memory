using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace GovernanceAssetValidator;

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
        "source_path",
    ];

    private static readonly GovernanceDirectory[] GovernanceDirectories =
    [
        new(".github/prompts/", "*.md", SearchOption.TopDirectoryOnly, "prompt"),
        new(".github/instructions/", "*.instructions.md", SearchOption.TopDirectoryOnly, "instruction"),
        new(".github/skills/", "SKILL.md", SearchOption.AllDirectories, "skill"),
    ];

    public static CatalogBuildResult Build(string repoRoot)
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

    public static CatalogValidationResult Validate(string repoRoot)
    {
        var generation = Generate(repoRoot);
        if (generation.Errors.Count > 0)
        {
            return new CatalogValidationResult(false, generation.Errors);
        }

        string existingJson;
        string existingMarkdown;
        try
        {
            existingJson = NormalizeNewLines(File.ReadAllText(generation.JsonOutputPath));
            existingMarkdown = NormalizeNewLines(File.ReadAllText(generation.MarkdownOutputPath));
        }
        catch (FileNotFoundException ex)
        {
            return new CatalogValidationResult(false, [$"Missing generated catalog: {ex.FileName}"]);
        }

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
        CatalogSourceFile? source;
        try
        {
            source = JsonSerializer.Deserialize<CatalogSourceFile>(File.ReadAllText(sourcePath), JsonOptions());
        }
        catch (FileNotFoundException ex)
        {
            return new CatalogGenerationResult(string.Empty, string.Empty, string.Empty, string.Empty, [$"Missing source metadata: {ex.FileName}"]);
        }

        if (source is null || source.Generation is null)
        {
            return new CatalogGenerationResult(string.Empty, string.Empty, string.Empty, string.Empty, ["Source metadata could not be parsed."]);
        }

        var assets = DiscoverAndValidateAssets(repoRoot, source, errors);

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

        var (jsonCatalog, markdownCatalog) = SerializeCatalog(orderedAssets, source);

        return new CatalogGenerationResult(jsonCatalog, markdownCatalog, jsonOutputPath, markdownOutputPath, []);
    }

    private static List<AssetRecord> DiscoverAndValidateAssets(
        string repoRoot,
        CatalogSourceFile source,
        List<string> errors)
    {
        var assets = new List<AssetRecord>();
        var discoveredFiles = DiscoverGovernanceFiles(repoRoot);

        foreach (var fullPath in discoveredFiles)
        {
            var relativePath = ToForwardSlashPath(Path.GetRelativePath(repoRoot, fullPath));
            var asset = ValidateAndBuildAsset(relativePath, File.ReadAllText(fullPath), source, errors);
            if (asset is not null)
            {
                assets.Add(asset);
            }
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

        return assets;
    }

    private static (string JsonCatalog, string MarkdownCatalog) SerializeCatalog(
        List<AssetRecord> orderedAssets,
        CatalogSourceFile source)
    {
        var catalogDocument = new
        {
            metadata = new
            {
                schema_version = source.SchemaVersion,
                generated_at_utc = DeterministicGeneratedAt,
                generated_by = source.GeneratedBy,
                in_scope_asset_types = source.InScopeAssetTypes,
                reserved_future_categories = source.ReservedFutureCategories,
                required_fields = RequiredFields,
            },
            assets = orderedAssets.Select(a => new
            {
                asset_id = a.AssetId,
                name = a.Name,
                summary = a.Summary,
                asset_type = a.AssetType,
                status = a.Status,
                owners = a.Owners,
                source_path = a.SourcePath,
            }),
        };

        var jsonCatalog = JsonSerializer.Serialize(catalogDocument, JsonOptions(writeIndented: true));
        var markdownCatalog = BuildMarkdown(catalogDocument.metadata.reserved_future_categories, orderedAssets);
        return (jsonCatalog, markdownCatalog);
    }

    private static AssetRecord? ValidateAndBuildAsset(
        string relativePath,
        string content,
        CatalogSourceFile source,
        List<string> errors)
    {
        var frontmatter = FrontmatterParser.Parse(content);
        if (frontmatter.Count == 0)
        {
            errors.Add($"Missing frontmatter: {relativePath}");
            return null;
        }

        var name = ReadString(frontmatter, "name");
        var summary = ReadString(frontmatter, "summary") ?? ReadString(frontmatter, "description");
        var assetType = ReadString(frontmatter, "asset_type") ?? InferAssetType(relativePath);
        var status = ReadString(frontmatter, "status") ?? "active";
        var owners = ReadStringList(frontmatter, "owners");
        var sourcePathFromMeta = ReadString(frontmatter, "source_path") ?? relativePath;
        var assetId = ReadString(frontmatter, "asset_id") ?? $"{assetType}:{sourcePathFromMeta}";

        var missing = CollectMissingFields(name, summary, assetType, status, owners, sourcePathFromMeta);
        if (missing.Count > 0)
        {
            errors.Add($"Missing required metadata field(s) in {relativePath}: {string.Join(", ", missing)}");
            return null;
        }

        if (!source.InScopeAssetTypes.Contains(assetType!, StringComparer.OrdinalIgnoreCase))
        {
            errors.Add($"Unsupported asset_type in {relativePath}: {assetType}");
            return null;
        }

        return new AssetRecord(
            assetId!,
            name!,
            summary!,
            assetType!,
            status!,
            owners,
            ToForwardSlashPath(sourcePathFromMeta!));
    }

    private static List<string> CollectMissingFields(
        string? name,
        string? summary,
        string? assetType,
        string? status,
        List<string> owners,
        string? sourcePathFromMeta)
    {
        (string? Value, string FieldName)[] checks =
        [
            (name, "name"),
            (summary, "summary"),
            (assetType, "asset_type"),
            (status, "status"),
            (sourcePathFromMeta, "source_path"),
        ];
        var missing = checks
            .Where(f => string.IsNullOrWhiteSpace(f.Value))
            .Select(f => f.FieldName)
            .ToList();
        if (owners.Count == 0)
        {
            missing.Add("owners");
        }

        return missing;
    }

    private static List<string> DiscoverGovernanceFiles(string repoRoot)
    {
        var files = new List<string>();
        foreach (var dir in GovernanceDirectories)
        {
            var fullPath = Path.Combine(repoRoot, ToPlatformPath(dir.RelativeForwardSlashPrefix));
            if (Directory.Exists(fullPath))
            {
                files.AddRange(Directory.GetFiles(fullPath, dir.Pattern, dir.SearchOption));
            }
        }

        return files;
    }

    private static string? InferAssetType(string relativePath)
    {
        return GovernanceDirectories
            .FirstOrDefault(dir => relativePath.StartsWith(dir.RelativeForwardSlashPrefix, StringComparison.OrdinalIgnoreCase))
            ?.AssetType;
    }

    private static string? ReadString(IReadOnlyDictionary<string, object> map, string key)
    {
        if (!map.TryGetValue(key, out var value))
        {
            return null;
        }

        return value as string;
    }

    private static List<string> ReadStringList(IReadOnlyDictionary<string, object> map, string key)
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
            WriteIndented = writeIndented,
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
            builder.AppendLine(CultureInfo.InvariantCulture, $"| {EscapePipe(asset.AssetId)} | {EscapePipe(asset.AssetType)} | {EscapePipe(asset.Name)} | {EscapePipe(asset.Status)} | {EscapePipe(owners)} | {EscapePipe(asset.SourcePath)} | {EscapePipe(asset.Summary)} |");
        }

        builder.AppendLine();
        builder.AppendLine("## Reserved Future Categories");
        builder.AppendLine();
        foreach (var category in reservedCategories)
        {
            builder.AppendLine(CultureInfo.InvariantCulture, $"- {category}");
        }

        return builder.ToString();
    }

    private static string EscapePipe(string value)
    {
        return value.Replace("|", "\\|");
    }

    private sealed record GovernanceDirectory(
        string RelativeForwardSlashPrefix,
        string Pattern,
        SearchOption SearchOption,
        string AssetType);

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
