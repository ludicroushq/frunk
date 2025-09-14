import { describe, expect, it } from "vitest";
import { parseCommand } from "../../core/parser";

describe("Parser Edge Cases", () => {
  it("handles multiple sequential chains", () => {
    const result = parseCommand(["[a]->[b]", "[c]->[d]"]);
    expect(result.patterns).toContain("SEQ:a");
    expect(result.patterns).toContain("SEQ:b");
    expect(result.patterns).toContain("SEQ:c");
    expect(result.patterns).toContain("SEQ:d");
  });

  it("handles deeply nested patterns", () => {
    const result = parseCommand(["[a,b,c]->[d,e,f]->[g,h,i]"]);
    expect(result.patterns).toContain("SEQ:[a,b,c]");
    expect(result.patterns).toContain("SEQ:[d,e,f]");
    expect(result.patterns).toContain("SEQ:[g,h,i]");
  });

  it("handles patterns with special characters", () => {
    const result = parseCommand(["[@scope/package:*]"]);
    expect(result.patterns).toEqual(["@scope/package:*"]);
  });

  it("handles patterns with numbers", () => {
    const result = parseCommand(["[test-123]"]);
    expect(result.patterns).toEqual(["test-123"]);
  });

  it("handles patterns with underscores", () => {
    const result = parseCommand(["[test_script]"]);
    expect(result.patterns).toEqual(["test_script"]);
  });

  it("handles empty sequential chain parts", () => {
    const result = parseCommand(["[]->[a]"]);
    expect(result.patterns).toContain("SEQ:a");
  });

  it("handles whitespace in patterns", () => {
    const result = parseCommand(["[ test , build ]"]);
    expect(result.patterns).toEqual(["test", "build"]);
  });

  it("handles multiple flags", () => {
    const result = parseCommand(["[test]", "-q", "-c", "--no-prefix"]);
    expect(result.config.quiet).toBe(true);
    expect(result.config.continue).toBe(true);
    expect(result.config.prefix).toBe(false);
  });

  it("handles prefix with special characters", () => {
    const result = parseCommand(["[test]", "--prefix==>"]);
    expect(result.config.prefix).toBe("=>");
  });

  it("handles prefix with spaces", () => {
    const result = parseCommand(["[test]", "--prefix=>> "]);
    expect(result.config.prefix).toBe(">> ");
  });

  it("handles unknown flags gracefully", () => {
    const result = parseCommand(["[test]", "--unknown-flag"]);
    expect(result.patterns).toEqual(["test"]);
    // Unknown flag should be ignored
  });

  it("handles mixed valid and invalid syntax", () => {
    const result = parseCommand(["[test]", "invalid", "--quiet"]);
    expect(result.patterns).toEqual(["test"]);
    expect(result.config.quiet).toBe(true);
  });

  it("handles command with quotes", () => {
    const result = parseCommand(["[test]", "--", "echo", '"hello world"']);
    expect(result.command).toBe('echo "hello world"');
  });

  it("handles command with multiple arguments", () => {
    const result = parseCommand([
      "[test]",
      "--",
      "npm",
      "run",
      "build",
      "--",
      "--watch",
    ]);
    expect(result.command).toBe("npm run build -- --watch");
  });

  it("handles patterns with colons in unusual places", () => {
    const result = parseCommand(["[:test]"]);
    expect(result.patterns).toEqual([":test"]);
  });

  it("handles patterns ending with colon", () => {
    const result = parseCommand(["[test:]"]);
    expect(result.patterns).toEqual(["test:"]);
  });

  it("handles multiple exclusion patterns", () => {
    const result = parseCommand(["[*:*,!test:*,!build:*]"]);
    expect(result.patterns).toEqual(["*:*", "!test:*", "!build:*"]);
  });

  it("handles sequential with single items", () => {
    const result = parseCommand(["[a]->[b]"]);
    expect(result.patterns).toEqual(["SEQ:a", "SEQ:b"]);
  });

  it("handles very long pattern lists", () => {
    const PATTERN_COUNT = 50;
    const longPattern = Array.from(
      { length: PATTERN_COUNT },
      (_, i) => `task${i}`
    ).join(",");
    const result = parseCommand([`[${longPattern}]`]);
    expect(result.patterns).toHaveLength(PATTERN_COUNT);
  });

  it("handles patterns with dots", () => {
    const result = parseCommand(["[build.prod]"]);
    expect(result.patterns).toEqual(["build.prod"]);
  });

  it("handles patterns with hyphens", () => {
    const result = parseCommand(["[build-prod]"]);
    expect(result.patterns).toEqual(["build-prod"]);
  });

  it("ignores comments in unusual places", () => {
    const result = parseCommand([
      "[test]",
      "# this is not a comment in args",
      "--quiet",
    ]);
    expect(result.patterns).toEqual(["test"]);
    expect(result.config.quiet).toBe(true);
  });

  it("handles escaped characters in patterns", () => {
    const result = parseCommand(["[test\\:unit]"]);
    expect(result.patterns).toEqual(["test\\:unit"]);
  });

  it("handles unicode in patterns", () => {
    const result = parseCommand(["[测试:单元]"]);
    expect(result.patterns).toEqual(["测试:单元"]);
  });

  it("handles emoji in patterns", () => {
    const result = parseCommand(["[test:🚀]"]);
    expect(result.patterns).toEqual(["test:🚀"]);
  });
});
