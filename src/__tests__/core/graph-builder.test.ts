import { describe, expect, it } from "vitest";
import { GraphBuilder } from "../../core/graph-builder";
import type { Script } from "../../types";

describe("GraphBuilder", () => {
  const builder = new GraphBuilder();

  const scripts: Script[] = [
    { command: "vitest", name: "test" },
    { command: "vite build", name: "build" },
    { command: "eslint", name: "lint" },
    { command: "vite dev", name: "serve" },
  ];

  describe("buildGraph", () => {
    it("builds simple parallel graph", () => {
      const graph = builder.buildGraph(["test", "lint"], scripts, {});

      expect(graph).toHaveLength(2);

      // Find the nodes by name since order may vary
      const testNode = graph.find((n) => n.tasks[0]?.name === "test");
      const lintNode = graph.find((n) => n.tasks[0]?.name === "lint");

      expect(testNode).toBeDefined();
      expect(lintNode).toBeDefined();
      expect(testNode?.tasks).toHaveLength(1);
      expect(lintNode?.tasks).toHaveLength(1);
      expect(testNode?.sequential).toBe(false);
      expect(testNode?.dependencies).toEqual([]);
      expect(lintNode?.dependencies).toEqual([]);
    });

    it("builds graph with frunk dependencies", () => {
      const scriptsWithDeps: Script[] = [
        { command: "echo shared", name: "shared:dep" },
        { command: "echo app", name: "app:dep" },
        { command: "f [shared:dep,app:dep] -- vite dev", name: "app:dev" },
      ];

      const graph = builder.buildGraph(["app:dev"], scriptsWithDeps, {});

      // Should create nodes for shared:dep, app:dep, and app:dev
      const EXPECTED_NODE_COUNT = 3;
      expect(graph.length).toBe(EXPECTED_NODE_COUNT);

      // Find the nodes
      const appDevNode = graph.find((n) => n.tasks[0]?.name === "app:dev");
      const sharedDepNode = graph.find(
        (n) => n.tasks[0]?.name === "shared:dep"
      );
      const appDepNode = graph.find((n) => n.tasks[0]?.name === "app:dep");

      expect(appDevNode).toBeDefined();
      expect(sharedDepNode).toBeDefined();
      expect(appDepNode).toBeDefined();

      // app:dev should depend on both shared:dep and app:dep
      // Check that it has dependencies (the exact node IDs may vary)
      expect(appDevNode?.dependencies.length).toBe(2);

      // Dependencies should have no dependencies themselves
      expect(sharedDepNode?.dependencies.length).toBe(0);
      expect(appDepNode?.dependencies.length).toBe(0);
    });

    it("handles simple frunk command", () => {
      const scriptsWithFrunk: Script[] = [
        { command: "f -- echo testing", name: "test" },
      ];

      const graph = builder.buildGraph(["test"], scriptsWithFrunk, {});

      expect(graph).toHaveLength(1);
      expect(graph[0]?.tasks[0]?.command).toBe("echo testing");
    });

    it("handles inline command", () => {
      const graph = builder.buildGraph([], scripts, {}, "echo hello");

      expect(graph).toHaveLength(1);
      expect(graph[0]?.tasks[0]?.command).toBe("echo hello");
      expect(graph[0]?.tasks[0]?.name).toBe("command");
    });

    it("deduplicates shared dependencies", () => {
      const scriptsWithShared: Script[] = [
        { command: "echo shared", name: "shared" },
        { command: "f [shared] -- echo app1", name: "app1" },
        { command: "f [shared] -- echo app2", name: "app2" },
      ];

      const graph = builder.buildGraph(["app1", "app2"], scriptsWithShared, {});

      // Should only have one shared node
      const sharedNodes = graph.filter((n) => n.tasks[0]?.name === "shared");
      expect(sharedNodes).toHaveLength(1);
    });

    it("handles empty patterns with command", () => {
      const graph = builder.buildGraph([], scripts, {}, "echo hello");

      expect(graph).toHaveLength(1);
      expect(graph[0]?.tasks).toHaveLength(1);
      expect(graph[0]?.tasks[0]?.command).toBe("echo hello");
    });

    it("handles glob patterns in dependencies", () => {
      const scriptsWithGlob: Script[] = [
        { command: "vitest unit", name: "test:unit" },
        { command: "vitest e2e", name: "test:e2e" },
        { command: "f [test:*] -- echo done", name: "all" },
      ];

      const graph = builder.buildGraph(["all"], scriptsWithGlob, {});

      // Should expand test:* to test:unit and test:e2e
      const testNodes = graph.filter(
        (n) =>
          n.tasks[0]?.name === "test:unit" || n.tasks[0]?.name === "test:e2e"
      );
      expect(testNodes).toHaveLength(2);
    });

    it("creates unique node IDs", () => {
      const graph = builder.buildGraph(["test", "build", "lint"], scripts, {});

      const ids = graph.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("validateGraph", () => {
    it("accepts valid graph", () => {
      const graph = builder.buildGraph(["test", "build"], scripts, {});

      expect(() => builder.validateGraph(graph)).not.toThrow();
    });

    it("detects cycles", () => {
      const graph = [
        {
          dependencies: ["node_1"],
          id: "node_0",
          sequential: false,
          tasks: [],
        },
        {
          dependencies: ["node_0"],
          id: "node_1",
          sequential: false,
          tasks: [],
        },
      ];

      expect(() => builder.validateGraph(graph)).toThrow(
        "Circular dependency detected"
      );
    });

    it("handles complex dependency chains", () => {
      const graph = [
        {
          dependencies: [],
          id: "node_0",
          sequential: false,
          tasks: [
            {
              command: "echo a",
              dependencies: [],
              name: "a",
            },
          ],
        },
        {
          dependencies: ["node_0"],
          id: "node_1",
          sequential: false,
          tasks: [
            {
              command: "echo b",
              dependencies: [],
              name: "b",
            },
          ],
        },
        {
          dependencies: ["node_0", "node_1"],
          id: "node_2",
          sequential: false,
          tasks: [
            {
              command: "echo c",
              dependencies: [],
              name: "c",
            },
          ],
        },
      ];

      expect(() => builder.validateGraph(graph)).not.toThrow();
    });

    it("handles self-cycles", () => {
      const graph = [
        {
          dependencies: ["node_0"],
          id: "node_0",
          sequential: false,
          tasks: [],
        },
      ];

      expect(() => builder.validateGraph(graph)).toThrow(
        "Circular dependency detected"
      );
    });

    it("handles deep dependency chains", () => {
      const graph = [
        {
          dependencies: [],
          id: "node_0",
          sequential: false,
          tasks: [],
        },
        {
          dependencies: ["node_0"],
          id: "node_1",
          sequential: false,
          tasks: [],
        },
        {
          dependencies: ["node_1"],
          id: "node_2",
          sequential: false,
          tasks: [],
        },
      ];

      expect(() => builder.validateGraph(graph)).not.toThrow();
    });
  });
});
