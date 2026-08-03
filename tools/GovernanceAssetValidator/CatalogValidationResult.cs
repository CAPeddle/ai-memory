using System.Collections.Generic;

namespace GovernanceAssetValidator;

public sealed record CatalogValidationResult(bool IsSuccess, IReadOnlyList<string> Errors);
