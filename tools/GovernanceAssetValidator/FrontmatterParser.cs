using System.Collections.Generic;

namespace GovernanceAssetValidator;

internal static class FrontmatterParser
{
    public static IReadOnlyDictionary<string, object> Parse(string content)
    {
        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        var lines = content.Replace("\r\n", "\n").Split('\n');

        if (lines.Length < 3 || !string.Equals(lines[0].Trim(), "---", StringComparison.Ordinal))
        {
            return result;
        }

        string? activeListKey = null;
        for (var i = 1; i < lines.Length; i++)
        {
            var line = lines[i];

            if (string.Equals(line.Trim(), "---", StringComparison.Ordinal))
            {
                break;
            }

            if (string.IsNullOrWhiteSpace(line))
            {
                activeListKey = null;
                continue;
            }

            var trimmed = line.Trim();
            if (trimmed.StartsWith("- ", StringComparison.Ordinal) && activeListKey is not null)
            {
                if (result[activeListKey] is not List<string> list)
                {
                    list = [];
                    result[activeListKey] = list;
                }

                list.Add(Unquote(trimmed.Substring(2).Trim()));
                continue;
            }

            ParseKeyValuePair(trimmed, ref activeListKey, result);
        }

        return result;
    }

    private static void ParseKeyValuePair(
        string trimmed,
        ref string? activeListKey,
        Dictionary<string, object> result)
    {
        var separatorIndex = trimmed.IndexOf(':');
        if (separatorIndex <= 0)
        {
            activeListKey = null;
            return;
        }

        var key = trimmed[..separatorIndex].Trim();
        var value = trimmed[(separatorIndex + 1)..].Trim();
        if (string.IsNullOrEmpty(value))
        {
            activeListKey = key;
            result[key] = new List<string>();
        }
        else
        {
            activeListKey = null;
            result[key] = Unquote(value);
        }
    }

    private static string Unquote(string value)
    {
        if (value.Length >= 2 &&
            ((value.StartsWith('"') && value.EndsWith('"')) || (value.StartsWith('\'') && value.EndsWith('\''))))
        {
            return value[1..^1];
        }

        return value;
    }
}
