import { beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../../utils/logger";

describe("Logger", () => {
  let logger: Logger;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {
      // Intentionally empty - suppressing console output in tests
    });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // Intentionally empty - suppressing console output in tests
    });
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      // Intentionally empty - suppressing console output in tests
    });
    logger = new Logger();
  });

  describe("log", () => {
    it("logs with default prefix", () => {
      logger.registerTask("test");
      logger.log("test", "Hello world");

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0]?.[0];
      expect(output).toContain("[test]");
      expect(output).toContain("Hello world");
    });

    it("respects quiet mode", () => {
      logger = new Logger({ quiet: true });
      logger.log("test", "Hello");

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("handles custom prefix", () => {
      logger = new Logger({ prefix: "►" });
      logger.registerTask("test");
      logger.log("test", "Hello");

      const output = consoleLogSpy.mock.calls[0]?.[0];
      expect(output).toContain("►");
      expect(output).toContain("Hello");
    });

    it("handles no prefix", () => {
      logger = new Logger({ prefix: false });
      logger.log("test", "Hello");

      expect(consoleLogSpy).toHaveBeenCalledWith("Hello");
    });

    it("handles multiline messages", () => {
      logger.registerTask("test");
      logger.log("test", "Line 1\nLine 2\nLine 3");

      const EXPECTED_LINE_COUNT = 3;
      expect(consoleLogSpy).toHaveBeenCalledTimes(EXPECTED_LINE_COUNT);
    });

    it("skips empty lines", () => {
      logger.log("test", "Line 1\n\nLine 2");

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("error", () => {
    it("logs errors in red", () => {
      logger.registerTask("test");
      logger.error("test", "Error message");

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0]?.[0];
      expect(output).toContain("[test]");
      expect(output).toContain("Error message");
    });

    it("always shows errors even in quiet mode", () => {
      logger = new Logger({ quiet: true });
      logger.error("test", "Error");

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("info", () => {
    it("shows info messages", () => {
      logger.info("Information");

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0]?.[0];
      expect(output).toContain("ℹ");
      expect(output).toContain("Information");
    });

    it("respects quiet mode", () => {
      logger = new Logger({ quiet: true });
      logger.info("Info");

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe("success", () => {
    it("shows success messages", () => {
      logger.success("Done!");

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0]?.[0];
      expect(output).toContain("✓");
      expect(output).toContain("Done!");
    });
  });

  describe("warn", () => {
    it("shows warning messages", () => {
      logger.warn("Warning!");

      expect(consoleWarnSpy).toHaveBeenCalled();
      const output = consoleWarnSpy.mock.calls[0]?.[0];
      expect(output).toContain("⚠");
      expect(output).toContain("Warning!");
    });
  });

  describe("registerTask", () => {
    it("assigns different colors to tasks", () => {
      logger.registerTask("task1");
      logger.registerTask("task2");
      logger.registerTask("task3");

      logger.log("task1", "Message 1");
      logger.log("task2", "Message 2");
      logger.log("task3", "Message 3");

      const outputs = consoleLogSpy.mock.calls.map((c: any) => c[0]);
      // Check that outputs are different (different colors)
      expect(new Set(outputs).size).toBeGreaterThan(1);
    });

    it("pads prefixes and adds pipe separator", () => {
      logger.registerTask("a");
      logger.registerTask("longer");

      logger.log("a", "Test");
      logger.log("longer", "Test");

      const output1 = consoleLogSpy.mock.calls[0]?.[0];
      const output2 = consoleLogSpy.mock.calls[1]?.[0];

      // Check that both have pipe separator
      expect(output1).toContain("|");
      expect(output2).toContain("|");

      // Extract clean output without ANSI codes
      // Using string construction to avoid control character warning
      const ESCAPE_CHAR_CODE = 27;
      const ESC = String.fromCharCode(ESCAPE_CHAR_CODE);
      const ansiRegex = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
      const cleanOutput1 = output1.replace(ansiRegex, "");
      const cleanOutput2 = output2.replace(ansiRegex, "");

      // Check alignment - everything before | should be same length
      const prefix1 = cleanOutput1.substring(0, cleanOutput1.indexOf("|"));
      const prefix2 = cleanOutput2.substring(0, cleanOutput2.indexOf("|"));

      expect(prefix1.length).toBe(prefix2.length);
      expect(cleanOutput1).toContain("[a]");
      expect(cleanOutput2).toContain("[longer]");
    });
  });

  describe("createTaskLogger", () => {
    it("creates a task-specific logger", () => {
      const taskLogger = logger.createTaskLogger("mytask");

      taskLogger.log("Hello");

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0]?.[0];
      expect(output).toContain("[mytask]");
      expect(output).toContain("Hello");
    });

    it("task logger respects parent config", () => {
      logger = new Logger({ quiet: true });
      const taskLogger = logger.createTaskLogger("mytask");

      taskLogger.log("Hello");

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
