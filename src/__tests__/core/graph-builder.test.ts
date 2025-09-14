import { describe, it, expect } from 'vitest';
import { GraphBuilder } from '../../core/graph-builder';
import { Script, Config } from '../../types';

describe('GraphBuilder', () => {
  const builder = new GraphBuilder();
  
  const scripts: Script[] = [
    { name: 'test', command: 'vitest' },
    { name: 'build', command: 'vite build' },
    { name: 'lint', command: 'eslint' },
    { name: 'serve', command: 'vite dev' },
  ];

  describe('buildGraph', () => {
    it('builds simple parallel graph', () => {
      const graph = builder.buildGraph(
        ['test', 'lint'],
        scripts,
        {}
      );
      
      expect(graph).toHaveLength(2);
      expect(graph[0]?.tasks).toHaveLength(1);
      expect(graph[0]?.tasks[0]?.name).toBe('test');
      expect(graph[1]?.tasks).toHaveLength(1);
      expect(graph[1]?.tasks[0]?.name).toBe('lint');
      expect(graph[0]?.sequential).toBe(false);
      expect(graph[0]?.dependencies).toEqual([]);
    });

    it('builds graph with frunk dependencies', () => {
      const scriptsWithDeps: Script[] = [
        { name: 'shared:dep', command: 'echo shared' },
        { name: 'app:dep', command: 'echo app' },
        { name: 'app:dev', command: 'f [shared:dep,app:dep] -- vite dev' },
      ];
      
      const graph = builder.buildGraph(
        ['app:dev'],
        scriptsWithDeps,
        {}
      );
      
      // Should create nodes for shared:dep, app:dep, and app:dev
      expect(graph.length).toBeGreaterThanOrEqual(3);
      
      // Find the app:dev node and check it depends on the dep nodes
      const appDevNode = graph.find(n => n.tasks[0]?.name === 'app:dev');
      expect(appDevNode).toBeDefined();
      expect(appDevNode?.dependencies.length).toBe(2);
    });

    it('handles simple frunk command', () => {
      const scriptsWithFrunk: Script[] = [
        { name: 'test', command: 'f -- echo testing' },
      ];
      
      const graph = builder.buildGraph(
        ['test'],
        scriptsWithFrunk,
        {}
      );
      
      expect(graph).toHaveLength(1);
      expect(graph[0]?.tasks[0]?.command).toBe('echo testing');
    });

    it('handles inline command', () => {
      const graph = builder.buildGraph(
        [],
        scripts,
        {},
        'echo hello'
      );
      
      expect(graph).toHaveLength(1);
      expect(graph[0]?.tasks[0]?.command).toBe('echo hello');
      expect(graph[0]?.tasks[0]?.name).toBe('command');
    });

    it('deduplicates shared dependencies', () => {
      const scriptsWithShared: Script[] = [
        { name: 'shared', command: 'echo shared' },
        { name: 'app1', command: 'f [shared] -- echo app1' },
        { name: 'app2', command: 'f [shared] -- echo app2' },
      ];
      
      const graph = builder.buildGraph(
        ['app1', 'app2'],
        scriptsWithShared,
        {}
      );
      
      // Should only have one shared node
      const sharedNodes = graph.filter(n => n.tasks[0]?.name === 'shared');
      expect(sharedNodes).toHaveLength(1);
    });

    it('handles empty patterns with command', () => {
      const graph = builder.buildGraph(
        [],
        scripts,
        {},
        'echo hello'
      );
      
      expect(graph).toHaveLength(1);
      expect(graph[0]?.tasks).toHaveLength(1);
      expect(graph[0]?.tasks[0]?.command).toBe('echo hello');
    });

    it('handles glob patterns in dependencies', () => {
      const scriptsWithGlob: Script[] = [
        { name: 'test:unit', command: 'vitest unit' },
        { name: 'test:e2e', command: 'vitest e2e' },
        { name: 'all', command: 'f [test:*] -- echo done' },
      ];
      
      const graph = builder.buildGraph(
        ['all'],
        scriptsWithGlob,
        {}
      );
      
      // Should expand test:* to test:unit and test:e2e
      const testNodes = graph.filter(n => 
        n.tasks[0]?.name === 'test:unit' || n.tasks[0]?.name === 'test:e2e'
      );
      expect(testNodes).toHaveLength(2);
    });

    it('creates unique node IDs', () => {
      const graph = builder.buildGraph(
        ['test', 'build', 'lint'],
        scripts,
        {}
      );
      
      const ids = graph.map(n => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('validateGraph', () => {
    it('accepts valid graph', () => {
      const graph = builder.buildGraph(
        ['test', 'build'],
        scripts,
        {}
      );
      
      expect(() => builder.validateGraph(graph)).not.toThrow();
    });

    it('detects cycles', () => {
      const graph = [
        {
          id: 'node_0',
          tasks: [],
          dependencies: ['node_1'],
          sequential: false,
        },
        {
          id: 'node_1',
          tasks: [],
          dependencies: ['node_0'],
          sequential: false,
        },
      ];
      
      expect(() => builder.validateGraph(graph))
        .toThrow('Circular dependency detected');
    });

    it('handles complex dependency chains', () => {
      const graph = [
        {
          id: 'node_0',
          tasks: [{
            name: 'a',
            command: 'echo a',
            dependencies: [],
          }],
          dependencies: [],
          sequential: false,
        },
        {
          id: 'node_1',
          tasks: [{
            name: 'b',
            command: 'echo b',
            dependencies: [],
          }],
          dependencies: ['node_0'],
          sequential: false,
        },
        {
          id: 'node_2',
          tasks: [{
            name: 'c',
            command: 'echo c',
            dependencies: [],
          }],
          dependencies: ['node_0', 'node_1'],
          sequential: false,
        },
      ];
      
      expect(() => builder.validateGraph(graph)).not.toThrow();
    });

    it('handles self-cycles', () => {
      const graph = [
        {
          id: 'node_0',
          tasks: [],
          dependencies: ['node_0'],
          sequential: false,
        },
      ];
      
      expect(() => builder.validateGraph(graph))
        .toThrow('Circular dependency detected');
    });

    it('handles deep dependency chains', () => {
      const graph = [
        {
          id: 'node_0',
          tasks: [],
          dependencies: [],
          sequential: false,
        },
        {
          id: 'node_1',
          tasks: [],
          dependencies: ['node_0'],
          sequential: false,
        },
        {
          id: 'node_2',
          tasks: [],
          dependencies: ['node_1'],
          sequential: false,
        },
      ];
      
      expect(() => builder.validateGraph(graph)).not.toThrow();
    });
  });
});