using System.Collections.Generic;

namespace GovernanceAssetValidator;

public sealed record CatalogValidationResult(bool IsValid, IReadOnlyList<string> Errors);
