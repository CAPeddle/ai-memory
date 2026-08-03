using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace GovernanceAssetValidator;

internal sealed class CatalogSourceFile
{
    [JsonPropertyName("schema_version")]
    public string SchemaVersion { get; init; } = "1.0.0";

    [JsonPropertyName("generated_by")]
    public string GeneratedBy { get; init; } = "governance-asset-validator";

    [JsonPropertyName("in_scope_asset_types")]
    public List<string> InScopeAssetTypes { get; init; } = [];

    [JsonPropertyName("reserved_future_categories")]
    public List<string> ReservedFutureCategories { get; init; } = [];

    [JsonPropertyName("generation")]
    public CatalogGenerationSection? Generation { get; init; }
}
