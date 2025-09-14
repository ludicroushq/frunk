import { describe, it, expect } from 'vitest';
import { parseCommand } from '../../core/parser';

describe('Parser', () => {
  describe('parseCommand', () => {
    it('parses simple pattern group', () => {
      const result = parseCommand(['[test:*]']);
      expect(result.patterns).toEqual(['test:*']);
      expect(result.config).toEqual({});
      expect(result.command).toBeUndefined();
    });

    it('parses multiple patterns with exclusions', () => {
      const result = parseCommand(['[test:*,!test:e2e]']);
      expect(result.patterns).toEqual(['test:*', '!test:e2e']);
    });

    it('parses config options', () => {
      const result = parseCommand(['[test:*]', '--quiet', '--continue']);
      expect(result.config.quiet).toBe(true);
      expect(result.config.continue).toBe(true);
    });

    it('parses config aliases', () => {
      const result = parseCommand(['[test:*]', '-q', '-c']);
      expect(result.config.quiet).toBe(true);
      expect(result.config.continue).toBe(true);
    });

    it('parses custom prefix', () => {
      const result = parseCommand(['[test:*]', '--prefix=►']);
      expect(result.config.prefix).toBe('►');
    });

    it('parses no-prefix option', () => {
      const result = parseCommand(['[test:*]', '--no-prefix']);
      expect(result.config.prefix).toBe(false);
    });

    it('parses command after --', () => {
      const result = parseCommand(['[build:*]', '--', 'node', 'server.js']);
      expect(result.patterns).toEqual(['build:*']);
      expect(result.command).toBe('node server.js');
    });

    it('parses sequential chains', () => {
      const result = parseCommand(['[a]->[b]->[c]']);
      expect(result.patterns).toContain('SEQ:a');
      expect(result.patterns).toContain('SEQ:b');
      expect(result.patterns).toContain('SEQ:c');
    });

    it('parses mixed parallel and sequential', () => {
      const result = parseCommand(['[a,b]->[c,d]']);
      expect(result.patterns).toContain('SEQ:[a,b]');
      expect(result.patterns).toContain('SEQ:[c,d]');
    });

    it('handles multiple config flags', () => {
      const result = parseCommand(['[test:*]', '-q', '-c']);
      expect(result.config.quiet).toBe(true);
      expect(result.config.continue).toBe(true);
    });

    it('ignores patterns without brackets', () => {
      // With new syntax, bare patterns are ignored
      const result = parseCommand(['test:*']);
      expect(result.patterns).toEqual([]);
      expect(result.config).toEqual({});
    });

    it('ignores unclosed brackets', () => {
      // With new syntax, malformed patterns are ignored
      const result = parseCommand(['[test:*']);
      expect(result.patterns).toEqual([]);
      expect(result.config).toEqual({});
    });

    it('handles empty input', () => {
      const result = parseCommand([]);
      expect(result.patterns).toEqual([]);
      expect(result.config).toEqual({});
      expect(result.command).toBeUndefined();
    });

    it('handles only command', () => {
      const result = parseCommand(['--', 'echo', 'hello']);
      expect(result.patterns).toEqual([]);
      expect(result.command).toBe('echo hello');
    });

    it('parses complex real-world example', () => {
      const result = parseCommand([
        '[lint,typecheck]->[test:*,!test:e2e]',
        '-c',
        '--prefix=►',
        '--',
        'npm run deploy'
      ]);
      expect(result.patterns).toContain('SEQ:[lint,typecheck]');
      expect(result.patterns).toContain('SEQ:[test:*,!test:e2e]');
      expect(result.config.continue).toBe(true);
      expect(result.config.prefix).toBe('►');
      expect(result.command).toBe('npm run deploy');
    });
  });
});