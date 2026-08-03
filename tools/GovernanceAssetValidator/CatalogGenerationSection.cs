using System.Text.Json.Serialization;

namespace GovernanceAssetValidator;

internal sealed class CatalogGenerationSection
{
    [JsonPropertyName("json_output_path")]
    public string JsonOutputPath { get; init; } = string.Empty;

    [JsonPropertyName("markdown_output_path")]
    public string MarkdownOutputPath { get; init; } = string.Empty;
}
