import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Runner } from "../../execution/runner";

describe("Command forwarding with double dashes", () => {
  let tmpDir: string;
  let consoleLogSpy: any;

  beforeEach(() => {
    // Create a temporary working directory with a fake `next` binary
    tmpDir = mkdtempSync(join(os.tmpdir(), "frunk-cmd-"));
    const binDir = join(tmpDir, "node_modules", ".bin");
    mkdirSync(binDir, { recursive: true });

    // Fake `next` CLI that prints its received args as JSON
    const shimPath = join(binDir, "next");
    const shim =
      "#!/usr/bin/env node\n" +
      "// Print arguments after the script path\n" +
      "console.log(JSON.stringify(process.argv.slice(2)));\n";
    writeFileSync(shimPath, shim, { encoding: "utf8" });
    const EXECUTABLE_MODE = 0o755;
    chmodSync(shimPath, EXECUTABLE_MODE);

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {
      // suppress test noise
      return;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Cleanup temp dir
    try {
      rmSync(tmpDir, { force: true, recursive: true });
    } catch {
      // ignore
    }
  });

  it("passes repeated -- through unchanged to the command", async () => {
    const runner = new Runner();

    // No patterns; only a direct command after the first --
    const args = ["--", "next", "serve", "--", "--trace-deprication"]; // deliberate spelling, as in the example

    // Empty scripts; just verify direct command execution
    await runner.run(args, [], { cwd: tmpDir });

    // Our fake `next` prints its argv (excluding node and script path)
    // Expect: ["serve","--","--trace-deprication"]
    const printed = consoleLogSpy.mock.calls.map((c: any[]) => String(c[0]));
    const match = printed.find((line: string) =>
      line.includes('["serve","--","--trace-deprication"]')
    );
    expect(
      match,
      `output did not include expected argv: ${printed.join(" | ")}`
    ).toBeDefined();
  });
});
