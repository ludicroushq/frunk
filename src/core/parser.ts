import type { ParsedCommand } from "../types";

export class Parser {
  parse(args: string[]): ParsedCommand {
    const result: ParsedCommand = {
      config: {},
      patterns: [],
    };

    // Extract command after -- separator
    const { argsToProcess, command } = this.extractCommand(args);
    if (command !== undefined) {
      // Check for nested frunk commands which are not supported
      if (command.startsWith("f ") || command.startsWith("frunk ")) {
        throw new Error(
          "Nested frunk commands are not supported. Cannot use 'f' or 'frunk' after '--'"
        );
      }
      result.command = command;
    }

    // Parse deps and flags before --
    for (const arg of argsToProcess) {
      this.processArg(arg, result);
    }

    return result;
  }

  private extractCommand(args: string[]): {
    argsToProcess: string[];
    command?: string;
  } {
    const separatorIndex = args.indexOf("--");
    if (separatorIndex === -1) {
      return { argsToProcess: args };
    }
    return {
      argsToProcess: args.slice(0, separatorIndex),
      command: args.slice(separatorIndex + 1).join(" "),
    };
  }

  private processArg(arg: string, result: ParsedCommand): void {
    if (arg.startsWith("[") && arg.endsWith("]")) {
      this.processPattern(arg, result);
    } else if (arg.startsWith("--")) {
      this.processLongFlag(arg.substring(2), result);
    } else if (arg.startsWith("-")) {
      this.processShortFlags(arg.substring(1), result);
    }
    // Else: incomplete pattern or unknown argument - ignore
  }

  private processPattern(arg: string, result: ParsedCommand): void {
    if (arg.includes("->")) {
      // Sequential chain
      const chain = this.parseSequentialChain(arg);
      result.patterns.push(...chain);
    } else {
      // Parallel patterns
      const patterns = this.parsePatternGroup(arg);
      result.patterns.push(...patterns);
    }
  }

  private processLongFlag(flag: string, result: ParsedCommand): void {
    if (flag === "quiet" || flag === "q") {
      result.config.quiet = true;
    } else if (flag === "continue" || flag === "c") {
      result.config.continue = true;
    } else if (flag === "no-prefix") {
      result.config.prefix = false;
    } else if (flag.startsWith("prefix=")) {
      const PREFIX_LENGTH = "prefix=".length;
      result.config.prefix = flag.substring(PREFIX_LENGTH);
    } else {
      console.warn(`Unknown flag: --${flag}`);
    }
  }

  private processShortFlags(flags: string, result: ParsedCommand): void {
    for (const flag of flags) {
      if (flag === "q") {
        result.config.quiet = true;
      } else if (flag === "c") {
        result.config.continue = true;
      } else {
        console.warn(`Unknown flag: -${flag}`);
      }
    }
  }

  private parsePatternGroup(input: string): string[] {
    // Remove [ and ]
    const content = input.slice(1, -1);

    // Split by comma, handling nested structures
    const patterns: string[] = [];
    let current = "";
    let depth = 0;

    for (const char of content) {
      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
      }

      if (char === "," && depth === 0) {
        if (current.trim()) {
          patterns.push(current.trim());
        }
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      patterns.push(current.trim());
    }

    return patterns;
  }

  private parseSequentialChain(input: string): string[] {
    // Pattern like [a]->[b]->[c] means sequential execution
    // Pattern like [a,b]->[c,d] means parallel groups in sequence
    const parts = this.splitByArrow(input);
    return parts.map((part) => this.formatSequentialPart(part));
  }

  private splitByArrow(input: string): string[] {
    const parts: string[] = [];
    let current = "";
    let braceDepth = 0;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      const nextChar = input[i + 1];

      if (char === "[") {
        braceDepth++;
      } else if (char === "]") {
        braceDepth--;
      }

      if (char === "-" && nextChar === ">" && braceDepth === 0) {
        // Found -> outside of any braces
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = "";
        i++; // Skip the '>' character
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }

  private formatSequentialPart(part: string): string {
    // Remove brackets if present
    const cleanPart =
      part.startsWith("[") && part.endsWith("]") ? part.slice(1, -1) : part;

    // Format based on whether it's a group or single item
    return cleanPart.includes(",") ? `SEQ:[${cleanPart}]` : `SEQ:${cleanPart}`;
  }
}

export function parseCommand(args: string[]): ParsedCommand {
  const parser = new Parser();
  return parser.parse(args);
}
