using System.Collections.Generic;

namespace GovernanceAssetValidator;

public sealed record CatalogBuildResult(
    bool IsSuccess,
    IReadOnlyList<string> Errors,
    string JsonOutputPath,
    string MarkdownOutputPath);
