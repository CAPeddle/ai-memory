### Build integration
All four packages are referenced in `Directory.Build.props` with `PrivateAssets="all"` (analyzer-only, not a runtime dependency). `EnforceCodeStyleInBuild=true` ensures `.editorconfig` style rules are enforced at build time. `TreatWarningsAsErrors=true` is already set — violations become build errors.

