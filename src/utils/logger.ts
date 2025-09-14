import ansis from "ansis";
import type { Config } from "../types";

const colors = [
  ansis.cyan,
  ansis.green,
  ansis.yellow,
  ansis.blue,
  ansis.magenta,
  ansis.red,
  ansis.gray,
  ansis.white,
] as const;

export class Logger {
  private readonly colorMap = new Map<string, (typeof colors)[number]>();
  private colorIndex = 0;
  private maxPrefixLength = 0;
  private readonly config: Config;

  constructor(config: Config = {}) {
    this.config = {
      prefix: true, // Default to true
      quiet: false,
      ...config,
    };
  }

  registerTask(taskName: string): void {
    if (!this.colorMap.has(taskName)) {
      const color = colors[this.colorIndex % colors.length];
      if (color) {
        this.colorMap.set(taskName, color);
      }
      this.colorIndex++;
      this.maxPrefixLength = Math.max(this.maxPrefixLength, taskName.length);
    }
  }

  log(taskName: string, message: string): void {
    if (this.config.quiet) {
      return;
    }

    const lines = message.split("\n");
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const output = this.formatLine(taskName, line);
      console.log(output);
    }
  }

  error(taskName: string, message: string): void {
    const lines = message.split("\n");
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const output = this.formatLine(taskName, ansis.red(line));
      console.error(output);
    }
  }

  info(message: string): void {
    if (this.config.quiet) {
      return;
    }
    console.log(`${ansis.blue("ℹ")} ${message}`);
  }

  success(message: string): void {
    if (this.config.quiet) {
      return;
    }
    console.log(`${ansis.green("✓")} ${message}`);
  }

  warn(message: string): void {
    console.warn(`${ansis.yellow("⚠")} ${message}`);
  }

  private formatLine(taskName: string, line: string): string {
    if (this.config.prefix === false) {
      return line;
    }

    const color = this.colorMap.get(taskName) ?? ansis.white;

    if (typeof this.config.prefix === "string") {
      // Custom prefix
      return `${color(this.config.prefix)} ${line}`;
    }
    // Default prefix format - pad to align with pipe separator
    const prefix = `[${taskName}]`;
    const paddedPrefix = prefix.padEnd(this.maxPrefixLength + 2); // +2 for brackets
    return `${color(paddedPrefix)} ${ansis.gray("|")} ${line}`;
  }

  /**
   * Create a child logger for a specific task
   */
  createTaskLogger(taskName: string): TaskLogger {
    this.registerTask(taskName);
    return new TaskLogger(this, taskName);
  }
}

export class TaskLogger {
  private readonly parent: Logger;
  private readonly taskName: string;

  constructor(parent: Logger, taskName: string) {
    this.parent = parent;
    this.taskName = taskName;
  }

  log(message: string): void {
    this.parent.log(this.taskName, message);
  }

  error(message: string): void {
    this.parent.error(this.taskName, message);
  }
}
