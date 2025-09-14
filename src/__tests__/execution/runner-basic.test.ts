import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Runner } from "../../execution/runner";
import type { Script } from "../../types";

describe("Runner Basic Tests", () => {
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // Intentionally empty - suppressing console output in tests
    });
    processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a runner instance", () => {
    const runner = new Runner();
    expect(runner).toBeDefined();
  });

  it("has a run method", () => {
    const runner = new Runner();
    expect(typeof runner.run).toBe("function");
  });

  it("has pattern matcher and graph builder", () => {
    const runner = new Runner();
    const runnerAny = runner as any;
    expect(runnerAny.matcher).toBeDefined();
    expect(runnerAny.graphBuilder).toBeDefined();
  });

  it("handles pattern not found error", async () => {
    const runner = new Runner();
    const scripts: Script[] = [{ command: "echo test", name: "test" }];

    await runner.run(["[nonexistent]"], scripts);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error:",
      expect.stringContaining("not found")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("handles circular dependency error", async () => {
    const runner = new Runner();
    const scripts: Script[] = [
      { command: "f [b]", name: "a" },
      { command: "f [a]", name: "b" },
    ];

    await runner.run(["[a]"], scripts);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error:",
      expect.stringContaining("Circular")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("merges command config with runtime options", async () => {
    const runner = new Runner();
    const scripts: Script[] = [{ command: "echo test", name: "test" }];

    const _executorSpy = vi.fn();
    const runnerAny = runner as any;

    // Mock the executor to check config
    vi.spyOn(runnerAny.graphBuilder, "buildGraph").mockReturnValue([]);

    await runner.run(["[test]", "--quiet"], scripts, { prefix: ">" });

    expect(runnerAny.graphBuilder.buildGraph).toHaveBeenCalledWith(
      ["test"],
      scripts,
      expect.objectContaining({ prefix: ">", quiet: true }),
      undefined
    );
  });

  it("handles empty script list", async () => {
    const runner = new Runner();
    const scripts: Script[] = [];

    await runner.run(["[*]"], scripts);

    // Should handle gracefully even with no scripts
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it("passes command to graph builder", async () => {
    const runner = new Runner();
    const scripts: Script[] = [{ command: "echo test", name: "test" }];

    const runnerAny = runner as any;
    const buildGraphSpy = vi
      .spyOn(runnerAny.graphBuilder, "buildGraph")
      .mockReturnValue([]);

    await runner.run(["[test]", "--", "npm", "test"], scripts);

    expect(buildGraphSpy).toHaveBeenCalledWith(
      ["test"],
      scripts,
      expect.any(Object),
      "npm test"
    );
  });
});
