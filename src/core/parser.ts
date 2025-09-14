import { ParsedCommand } from '../types';

export class Parser {
  parse(args: string[]): ParsedCommand {
    const result: ParsedCommand = {
      patterns: [],
      config: {},
    };

    // Find the -- separator
    const separatorIndex = args.indexOf('--');
    
    if (separatorIndex !== -1) {
      // Everything after -- is the command
      result.command = args.slice(separatorIndex + 1).join(' ');
      args = args.slice(0, separatorIndex);
    }

    // Parse deps and flags before --
    for (const arg of args) {
      if (arg.startsWith('[') && arg.endsWith(']')) {
        // Pattern group with square brackets
        if (arg.includes('->')) {
          // Sequential chain
          const chain = this.parseSequentialChain(arg);
          result.patterns.push(...chain);
        } else {
          // Parallel patterns
          const patterns = this.parsePatternGroup(arg);
          result.patterns.push(...patterns);
        }
      } else if (arg.startsWith('--')) {
        // Long flag
        const flag = arg.substring(2);
        if (flag === 'quiet' || flag === 'q') {
          result.config.quiet = true;
        } else if (flag === 'continue' || flag === 'c') {
          result.config.continue = true;
        } else if (flag === 'no-prefix') {
          result.config.prefix = false;
        } else if (flag.startsWith('prefix=')) {
          result.config.prefix = flag.substring(7);
        } else {
          console.warn(`Unknown flag: --${flag}`);
        }
      } else if (arg.startsWith('-')) {
        // Short flags
        const flags = arg.substring(1);
        for (const flag of flags) {
          if (flag === 'q') {
            result.config.quiet = true;
          } else if (flag === 'c') {
            result.config.continue = true;
          } else {
            console.warn(`Unknown flag: -${flag}`);
          }
        }
      } else if (arg.startsWith('[')) {
        // Unclosed bracket - ignore it
        continue;
      } else {
        // Unknown argument - ignore it
        continue;
      }
    }

    return result;
  }

  private parsePatternGroup(input: string): string[] {
    // Remove [ and ]
    const content = input.slice(1, -1);
    
    // Split by comma, handling nested structures
    const patterns: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of content) {
      if (char === '{') depth++;
      else if (char === '}') depth--;
      
      if (char === ',' && depth === 0) {
        if (current.trim()) patterns.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) patterns.push(current.trim());
    
    return patterns;
  }


  private parseSequentialChain(input: string): string[] {
    // Pattern like [a]->[b]->[c] means sequential execution
    // Pattern like [a,b]->[c,d] means parallel groups in sequence
    
    // The input string contains -> somewhere, we need to split by it
    // while respecting brace boundaries
    const parts: string[] = [];
    let current = '';
    let braceDepth = 0;
    
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      const nextChar = input[i + 1];
      
      if (char === '[') {
        braceDepth++;
        current += char;
      } else if (char === ']') {
        braceDepth--;
        current += char;
      } else if (char === '-' && nextChar === '>' && braceDepth === 0) {
        // Found -> outside of any braces - this is a separator
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = '';
        i++; // Skip the '>' character
      } else {
        current += char;
      }
    }
    
    // Don't forget the last part
    if (current.trim()) {
      parts.push(current.trim());
    }
    
    // Now process each part and convert to our internal format
    const result: string[] = [];
    for (const part of parts) {
      // Each part should be wrapped in brackets like [a] or [a,b]
      let cleanPart = part;
      if (part.startsWith('[') && part.endsWith(']')) {
        cleanPart = part.slice(1, -1);
      }
      
      if (cleanPart.includes(',')) {
        // This is a parallel group that needs to run sequentially with others
        result.push(`SEQ:[${cleanPart}]`);
      } else {
        // Single task that runs sequentially
        result.push(`SEQ:${cleanPart}`);
      }
    }
    
    return result;
  }
}

export function parseCommand(args: string[]): ParsedCommand {
  const parser = new Parser();
  return parser.parse(args);
}