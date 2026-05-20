$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$projectPath = Join-Path $repoRoot "tools\GovernanceAssetValidator\GovernanceAssetValidator.csproj"

$null = & dotnet run --project $projectPath -- validate $repoRoot
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
