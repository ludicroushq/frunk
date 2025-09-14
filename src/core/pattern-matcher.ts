import micromatch from 'micromatch';
import { Script } from '../types';

export class PatternMatcher {
  /**
   * Resolves patterns to actual script names
   * Handles inclusions and exclusions in left-to-right order
   */
  resolvePatterns(patterns: string[], availableScripts: Script[]): string[] {
    const scriptNames = availableScripts.map(s => s.name);
    let result: string[] = [];

    for (const pattern of patterns) {
      if (pattern.startsWith('!')) {
        // Exclusion pattern - remove matches
        const excludePattern = pattern.slice(1);
        if (excludePattern.includes('*') || excludePattern.includes('?')) {
          // Glob exclusion
          const toRemove = micromatch(result, excludePattern);
          result = result.filter(name => !toRemove.includes(name));
        } else {
          // Literal exclusion
          result = result.filter(name => name !== excludePattern);
        }
      } else if (pattern.startsWith('SEQ:')) {
        // Sequential marker - handle specially
        const actualPattern = pattern.slice(4);
        if (actualPattern.startsWith('[') && actualPattern.endsWith(']')) {
          // Nested group in sequential chain
          const nestedPatterns = this.parseNestedGroup(actualPattern);
          const resolved = this.resolvePatterns(nestedPatterns, availableScripts);
          result.push(...resolved.map(r => `SEQ:${r}`));
        } else {
          // Direct pattern in sequential chain
          const matches = micromatch(scriptNames, actualPattern);
          result.push(...matches.map(m => `SEQ:${m}`));
        }
      } else if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[') || pattern.includes(':')) {
        // Glob pattern - add matches
        const matches = micromatch(scriptNames, pattern);
        result.push(...matches);
      } else {
        // Literal script name
        if (scriptNames.includes(pattern)) {
          result.push(pattern);
        } else {
          // Check if it's a command reference (like test:*)
          const matches = micromatch(scriptNames, pattern);
          if (matches.length > 0) {
            result.push(...matches);
          } else {
            throw new Error(`Script not found: ${pattern}`);
          }
        }
      }
    }

    // Remove duplicates while preserving order
    return [...new Set(result)];
  }

  private parseNestedGroup(input: string): string[] {
    // Remove [ and ] or { and } for backwards compatibility
    const content = input.slice(1, -1);
    return content.split(',').map(s => s.trim());
  }

  /**
   * Check if a pattern matches any scripts
   */
  hasMatches(pattern: string, availableScripts: Script[]): boolean {
    const scriptNames = availableScripts.map(s => s.name);
    const cleanPattern = pattern.startsWith('!') ? pattern.slice(1) : pattern;
    return micromatch(scriptNames, cleanPattern).length > 0;
  }

  /**
   * Validate that all patterns are valid
   */
  validatePatterns(patterns: string[], availableScripts: Script[]): void {
    for (const pattern of patterns) {
      if (pattern.startsWith('!')) {
        // Exclusion patterns don't need to match anything
        continue;
      }
      
      if (pattern.startsWith('SEQ:')) {
        // Sequential patterns handled separately
        continue;
      }

      // Check if pattern matches anything
      if (!this.hasMatches(pattern, availableScripts)) {
        // Check if it might be a literal that doesn't exist
        if (!pattern.includes('*') && !pattern.includes('?')) {
          throw new Error(`No scripts found matching: ${pattern}`);
        }
      }
    }
  }
}