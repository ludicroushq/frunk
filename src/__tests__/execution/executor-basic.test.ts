import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Executor } from "../../execution/executor";

describe("Executor Basic Tests", () => {
  let processOnSpy: any;
  let _processExitSpy: any;

  beforeEach(() => {
    // Mock process.on to prevent actual signal handlers
    processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);
    _processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an executor with default options", () => {
    const executor = new Executor({});
    expect(executor).toBeDefined();
    expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
  });

  it("creates an executor with quiet option", () => {
    const executor = new Executor({ quiet: true });
    expect(executor).toBeDefined();
  });

  it("creates an executor with continue option", () => {
    const executor = new Executor({ continue: true });
    expect(executor).toBeDefined();
  });

  it("creates an executor with custom prefix", () => {
    const executor = new Executor({ prefix: ">" });
    expect(executor).toBeDefined();
  });

  it("creates an executor with no prefix", () => {
    const executor = new Executor({ prefix: false });
    expect(executor).toBeDefined();
  });

  it("creates an executor with custom environment", () => {
    const executor = new Executor({ env: { TEST: "value" } });
    expect(executor).toBeDefined();
  });

  it("creates an executor with custom cwd", () => {
    const executor = new Executor({ cwd: "/tmp" });
    expect(executor).toBeDefined();
  });

  it("has an execute method", () => {
    const executor = new Executor({});
    expect(typeof executor.execute).toBe("function");
  });

  it("handles empty node list", async () => {
    const executor = new Executor({});
    await executor.execute([]);
    // Should complete without error
  });

  it("tracks execution state", () => {
    const executor = new Executor({});
    // Access private properties through any type
    const execAny = executor as any;
    expect(execAny.processes).toBeDefined();
    expect(execAny.completed).toBeDefined();
    expect(execAny.failed).toBeDefined();
    expect(execAny.aborted).toBe(false);
  });

  it("initializes logger with options", () => {
    const executor = new Executor({ prefix: ">>>", quiet: true });
    const execAny = executor as any;
    expect(execAny.logger).toBeDefined();
  });

  it("can call shutdown method", () => {
    const executor = new Executor({});
    const execAny = executor as any;
    expect(typeof execAny.shutdown).toBe("function");
    // Call shutdown
    execAny.shutdown();
    expect(execAny.aborted).toBe(true);
  });
});
