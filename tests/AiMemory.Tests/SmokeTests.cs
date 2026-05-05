using FluentAssertions;
using Xunit;

namespace AiMemory.Tests;

public class SmokeTests
{
    [Fact]
    public void Placeholder_WhenExecuted_Passes()
    {
        true.Should().BeTrue();
    }
}