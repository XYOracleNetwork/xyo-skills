# Testing Principles

These are framework-agnostic testing principles. Specific frameworks, runners, and tooling configuration are defined in the XY Toolchain skill (Layer 2).

## Test Naming

Describe **what behavior is expected**, not how it's implemented.

Good:
- `should reject moves after game is finalized`
- `should return the winner when both players have submitted`

Avoid:
- `test processMove function`
- `test line 42 branch`

The test name should read like a specification. When a test fails, its name should tell you what broke without reading the test body.

## Test Structure: Arrange / Act / Assert

Every test follows the same rhythm:

1. **Arrange** — set up the preconditions and inputs
2. **Act** — execute the behavior under test
3. **Assert** — verify the expected outcome

Separate these sections visually (blank line or comment) when the test is non-trivial.

## One Concept Per Test

Each test verifies one behavioral concept. Multiple `assert` / `expect` calls are fine if they're all checking facets of the same outcome.

What to avoid: a single test that checks move validation, game state transitions, AND winner calculation. Those are three tests.

## Test the Public Interface

Tests should exercise the **public API** of a module, not its internals.

- Don't test private methods directly
- Don't assert on internal state that isn't observable through the public interface
- If you feel the need to test internals, that's often a signal to extract a module with its own public interface

This makes tests resilient to refactoring — the implementation can change without breaking tests as long as the behavior is preserved.

## Coverage Strategy

Focus on **critical paths** being covered rather than hitting a percentage target.

Prioritize:
1. Happy paths — the main use cases that must work
2. Edge cases with real consequences — boundary conditions, error handling for likely failures
3. Regression cases — any bug that was fixed should get a test to prevent recurrence

Don't write tests purely to increase a coverage number. A test that doesn't protect against a real failure mode is maintenance cost without value.
