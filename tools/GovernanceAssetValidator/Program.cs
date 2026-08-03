using System.IO;

namespace GovernanceAssetValidator;

public static class Program
{
    public static int Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.Error.WriteLine("Usage: GovernanceAssetValidator <build|validate> [repoRoot]");
            return 2;
        }

        var mode = args[0];
        var repoRoot = args.Length > 1 ? args[1] : Directory.GetCurrentDirectory();

        if (string.Equals(mode, "build", StringComparison.OrdinalIgnoreCase))
        {
            var buildResult = CatalogValidationEngine.Build(repoRoot);
            if (!buildResult.IsSuccess)
            {
                foreach (var error in buildResult.Errors)
                {
                    Console.Error.WriteLine(error);
                }

                return 1;
            }

            Console.WriteLine($"Wrote {buildResult.JsonOutputPath}");
            Console.WriteLine($"Wrote {buildResult.MarkdownOutputPath}");
            return 0;
        }

        if (string.Equals(mode, "validate", StringComparison.OrdinalIgnoreCase))
        {
            var validationResult = CatalogValidationEngine.Validate(repoRoot);
            if (validationResult.IsSuccess)
            {
                Console.WriteLine("Validation succeeded.");
                return 0;
            }

            foreach (var error in validationResult.Errors)
            {
                Console.Error.WriteLine(error);
            }

            return 1;
        }

        Console.Error.WriteLine($"Unknown mode: {mode}");
        return 2;
    }
}
