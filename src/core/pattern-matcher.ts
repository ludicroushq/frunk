import micromatch from "micromatch";
import type { Script } from "../types";

const SEQ_PREFIX = "SEQ:";
const INDEXED_SEQ_REGEX = /^SEQ(\d+):(.+)$/;
const ANY_INDEXED_SEQ_REGEX = /^SEQ\d+:/;
const INDEXED_SEQ_GROUP_REGEX = /^SEQ(\d+):/;

export class PatternMatcher {
  /**
   * Resolves patterns to actual script names
   * Handles inclusions and exclusions in left-to-right order
   */
  resolvePatterns(patterns: string[], availableScripts: Script[]): string[] {
    const scriptNames = availableScripts.map((s) => s.name);
    let result: string[] = [];

    for (const pattern of patterns) {
      result = this.processPattern(
        pattern,
        result,
        scriptNames,
        availableScripts
      );
    }

    // Remove duplicates while preserving order
    return [...new Set(result)];
  }

  private processPattern(
    pattern: string,
    currentResult: string[],
    scriptNames: string[],
    availableScripts: Script[]
  ): string[] {
    if (pattern.startsWith("!")) {
      return this.processExclusion(pattern.slice(1), currentResult);
    }

    // Match SEQ:d pattern
    if (pattern.startsWith(SEQ_PREFIX) || ANY_INDEXED_SEQ_REGEX.test(pattern)) {
      return this.processSequential(
        pattern,
        currentResult,
        scriptNames,
        availableScripts
      );
    }

    const matches = this.findMatches(pattern, scriptNames);
    return [...currentResult, ...matches];
  }

  private processExclusion(excludePattern: string, result: string[]): string[] {
    if (excludePattern.includes("*") || excludePattern.includes("?")) {
      const toRemove = micromatch(result, excludePattern);
      return result.filter((name) => !toRemove.includes(name));
    }
    return result.filter((name) => name !== excludePattern);
  }

  private processSequential(
    pattern: string,
    currentResult: string[],
    scriptNames: string[],
    availableScripts: Script[]
  ): string[] {
    // Extract the actual pattern and determine group index
    // Patterns can be: "SEQ:pattern", "SEQ:[a,b]", "SEQ0:pattern", etc.
    let actualPattern: string;
    let groupIndex: number;

    const indexedMatch = pattern.match(INDEXED_SEQ_REGEX);
    if (indexedMatch?.[1] && indexedMatch[2]) {
      // Already indexed (e.g., SEQ0:pattern)
      groupIndex = Number.parseInt(indexedMatch[1], 10);
      actualPattern = indexedMatch[2];
    } else {
      // Simple SEQ: prefix - determine group index from existing patterns
      actualPattern = pattern.slice(SEQ_PREFIX.length);

      // Count existing SEQ groups to determine the current group index
      const existingGroups = new Set<number>();
      for (const r of currentResult) {
        const match = r.match(INDEXED_SEQ_GROUP_REGEX);
        if (match?.[1]) {
          existingGroups.add(Number.parseInt(match[1], 10));
        }
      }
      groupIndex = existingGroups.size;
    }

    if (actualPattern.startsWith("[") && actualPattern.endsWith("]")) {
      const nestedPatterns = this.parseNestedGroup(actualPattern);
      const resolved = this.resolvePatterns(nestedPatterns, availableScripts);
      return [
        ...currentResult,
        ...resolved.map((r) => `SEQ${groupIndex}:${r}`),
      ];
    }

    const matches = micromatch(scriptNames, actualPattern);
    return [...currentResult, ...matches.map((m) => `SEQ${groupIndex}:${m}`)];
  }

  private findMatches(pattern: string, scriptNames: string[]): string[] {
    if (this.isGlobPattern(pattern)) {
      return micromatch(scriptNames, pattern);
    }

    if (scriptNames.includes(pattern)) {
      return [pattern];
    }

    // Try as potential glob
    const matches = micromatch(scriptNames, pattern);
    if (matches.length > 0) {
      return matches;
    }

    throw new Error(`Script not found: ${pattern}`);
  }

  private isGlobPattern(pattern: string): boolean {
    return (
      pattern.includes("*") ||
      pattern.includes("?") ||
      pattern.includes("[") ||
      pattern.includes(":")
    );
  }

  private parseNestedGroup(input: string): string[] {
    // Remove [ and ] or { and } for backwards compatibility
    const content = input.slice(1, -1);
    return content.split(",").map((s) => s.trim());
  }

  /**
   * Check if a pattern matches any scripts
   */
  hasMatches(pattern: string, availableScripts: Script[]): boolean {
    const scriptNames = availableScripts.map((s) => s.name);
    const cleanPattern = pattern.startsWith("!") ? pattern.slice(1) : pattern;
    return micromatch(scriptNames, cleanPattern).length > 0;
  }

  /**
   * Validate that all patterns are valid
   */
  validatePatterns(patterns: string[], availableScripts: Script[]): void {
    for (const pattern of patterns) {
      if (pattern.startsWith("!")) {
        // Exclusion patterns don't need to match anything
        continue;
      }

      if (
        pattern.startsWith(SEQ_PREFIX) ||
        ANY_INDEXED_SEQ_REGEX.test(pattern)
      ) {
        // Sequential patterns handled separately
        continue;
      }

      // Check if pattern matches anything
      if (
        !(
          this.hasMatches(pattern, availableScripts) ||
          pattern.includes("*") ||
          pattern.includes("?")
        )
      ) {
        throw new Error(`No scripts found matching: ${pattern}`);
      }
    }
  }
}
