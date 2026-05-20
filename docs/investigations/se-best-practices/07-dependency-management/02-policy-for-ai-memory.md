### Policy for ai-memory

| Rule | Detail |
|------|--------|
| **Pin exact versions** | All `PackageReference` entries use exact versions (e.g., `Version="8.9.0"`). No floating (`*`) or range (`[1.0,2.0)`) versions. |
| **Monthly audit** | Run `dotnet list package --outdated` from `c:\projects\ai-memory\src\` on the first working day of each month. |
| **Security updates** | CVE-flagged packages must be updated within 48 hours of public disclosure. Check [https://github.com/advisories](https://github.com/advisories) or NuGet security advisories. |
| **Major upgrades** | Create a dedicated story for major version migrations. Never inline a breaking major upgrade during feature work. |
| **License preference** | MIT or Apache-2.0. Any package with a non-standard license must be documented in `coding-standards.instructions.md` when added. |
| **Minimize transitive depth** | Prefer packages with few transitive dependencies. Run `dotnet list package --include-transitive` to audit the transitive closure. |

