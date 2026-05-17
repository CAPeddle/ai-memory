### Analyzer package selection rationale

| Package | Prefix | Purpose | Why selected |
|---------|--------|---------|-------------|
| `Microsoft.CodeAnalysis.NetAnalyzers` | CA | .NET platform correctness, performance, security, and design rules | Built into .NET SDK; authoritative source for platform-level guidance |
| `StyleCop.Analyzers` | SA/SX | Formatting, documentation, and naming consistency | Ensures consistent style across AI-agent-authored code; complements `.editorconfig` |
| `SonarAnalyzer.CSharp` | S | Broad quality and security hotspots | Strong coverage of SOLID violations, null checks, exception handling, and SQL injection patterns relevant to this codebase |
| `Meziantou.Analyzer` | MA | Modern C# idioms, performance, and correctness | Catches patterns that are legal but suboptimal (e.g., `string.Concat` vs. interpolation, missing `ConfigureAwait`) |

