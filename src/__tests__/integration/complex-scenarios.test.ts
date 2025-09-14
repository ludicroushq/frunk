import { describe, expect, it } from "vitest";
import { GraphBuilder } from "../../core/graph-builder";
import type { Script } from "../../types";

// Regex for circular dependency error matching
const CIRCULAR_ERROR_REGEX = /[Cc]ircular/;

describe("Complex Integration Scenarios", () => {
  const builder = new GraphBuilder();

  describe("Microservices with shared dependencies", () => {
    it("handles multiple services with shared infrastructure dependencies", () => {
      const scripts: Script[] = [
        { command: "f [*:dev]", name: "dev" },
        { command: 'echo "Setting up database"', name: "database:setup" },
        { command: 'echo "Setting up cache"', name: "cache:setup" },
        {
          command: 'f [database:setup,cache:setup] -- echo "Shared deps ready"',
          name: "shared:deps",
        },
        {
          command: 'f [shared:deps] -- echo "API deps ready"',
          name: "api:deps",
        },
        {
          command: "f [shared:deps,api:deps] -- nodemon src/api/server.ts",
          name: "api:dev",
        },
        { command: 'f -- echo "Frontend deps ready"', name: "frontend:deps" },
        {
          command: "f [shared:deps,frontend:deps] -- vite dev --port 3000",
          name: "frontend:dev",
        },
        {
          command: "f [shared:deps] -- tsx --watch src/worker/index.ts",
          name: "worker:dev",
        },
        { command: "f [shared:deps] -- next dev -p 4000", name: "admin:dev" },
      ];

      const graph = builder.buildGraph(["dev"], scripts, {});

      // Should create nodes for all *:dev scripts and their dependencies
      const nodeNames = graph.map((n) => n.tasks[0]?.name).filter(Boolean);

      // All dev scripts should be present
      expect(nodeNames).toContain("api:dev");
      expect(nodeNames).toContain("frontend:dev");
      expect(nodeNames).toContain("worker:dev");
      expect(nodeNames).toContain("admin:dev");

      // Shared dependencies should be present only once
      const sharedDepsNodes = graph.filter(
        (n) => n.tasks[0]?.name === "shared:deps"
      );
      expect(sharedDepsNodes).toHaveLength(1);

      // Database and cache setup should each appear once
      const dbNodes = graph.filter(
        (n) => n.tasks[0]?.name === "database:setup"
      );
      const cacheNodes = graph.filter(
        (n) => n.tasks[0]?.name === "cache:setup"
      );
      expect(dbNodes).toHaveLength(1);
      expect(cacheNodes).toHaveLength(1);

      // Verify dependency chain: api:dev depends on api:deps and shared:deps
      const apiDevNode = graph.find((n) => n.tasks[0]?.name === "api:dev");
      expect(apiDevNode?.dependencies.length).toBe(2);
    });
  });

  describe("Build pipeline with multiple stages", () => {
    it("handles complex build pipeline with parallel and sequential stages", () => {
      const scripts: Script[] = [
        {
          command: "f [clean]->[lint,typecheck,test:*]->[build:*]->[deploy]",
          name: "ci",
        },
        { command: "rm -rf dist coverage", name: "clean" },
        { command: "eslint .", name: "lint" },
        { command: "tsc --noEmit", name: "typecheck" },
        { command: "vitest unit", name: "test:unit" },
        { command: "vitest integration", name: "test:integration" },
        { command: "playwright test", name: "test:e2e" },
        { command: "vite build", name: "build:client" },
        { command: "tsc --build", name: "build:server" },
        { command: "f -- webpack", name: "build:assets" },
        { command: "f -- sh deploy.sh", name: "deploy" },
      ];

      const graph = builder.buildGraph(["lint", "typecheck"], scripts, {});

      // Should create nodes for lint and typecheck
      const lintNode = graph.find((n) => n.tasks[0]?.name === "lint");
      const typecheckNode = graph.find((n) => n.tasks[0]?.name === "typecheck");

      expect(lintNode).toBeDefined();
      expect(typecheckNode).toBeDefined();

      // They should have no dependencies on each other
      expect(lintNode?.dependencies).toEqual([]);
      expect(typecheckNode?.dependencies).toEqual([]);
    });
  });

  describe("Nested frunk commands with deduplication", () => {
    it("deduplicates deeply nested shared dependencies", () => {
      const scripts: Script[] = [
        {
          command: "f [service-a:dev,service-b:dev,service-c:dev]",
          name: "dev",
        },
        { command: 'echo "Setting up infrastructure"', name: "common:infra" },
        {
          command: 'f [common:infra] -- echo "Loading config"',
          name: "common:config",
        },
        {
          command: 'f [common:config] -- echo "Setting up auth"',
          name: "common:auth",
        },
        {
          command: 'f [common:auth] -- echo "Service A deps"',
          name: "service-a:deps",
        },
        {
          command: "f [service-a:deps] -- node service-a.js",
          name: "service-a:dev",
        },
        {
          command: 'f [common:auth] -- echo "Service B deps"',
          name: "service-b:deps",
        },
        {
          command: "f [service-b:deps] -- node service-b.js",
          name: "service-b:dev",
        },
        {
          command: "f [common:auth] -- node service-c.js",
          name: "service-c:dev",
        },
      ];

      const graph = builder.buildGraph(["dev"], scripts, {});

      // Each common dependency should appear only once
      const infraNodes = graph.filter(
        (n) => n.tasks[0]?.name === "common:infra"
      );
      const configNodes = graph.filter(
        (n) => n.tasks[0]?.name === "common:config"
      );
      const authNodes = graph.filter((n) => n.tasks[0]?.name === "common:auth");

      expect(infraNodes).toHaveLength(1);
      expect(configNodes).toHaveLength(1);
      expect(authNodes).toHaveLength(1);

      // All services should be present
      expect(graph.some((n) => n.tasks[0]?.name === "service-a:dev")).toBe(
        true
      );
      expect(graph.some((n) => n.tasks[0]?.name === "service-b:dev")).toBe(
        true
      );
      expect(graph.some((n) => n.tasks[0]?.name === "service-c:dev")).toBe(
        true
      );
    });
  });

  describe("Glob patterns in dependencies", () => {
    it("resolves glob patterns in frunk command dependencies", () => {
      const scripts: Script[] = [
        { command: 'f [compile:*] -- echo "All built"', name: "build:all" },
        { command: "babel src", name: "compile:js" },
        { command: "tsc", name: "compile:ts" },
        { command: "postcss", name: "compile:css" },
        { command: "webpack", name: "compile:assets" },
      ];

      const graph = builder.buildGraph(["build:all"], scripts, {});

      // build:all should depend on all compile:* tasks
      const buildNode = graph.find((n) => n.tasks[0]?.name === "build:all");
      expect(buildNode).toBeDefined();

      // All compile tasks should be present
      expect(graph.some((n) => n.tasks[0]?.name === "compile:js")).toBe(true);
      expect(graph.some((n) => n.tasks[0]?.name === "compile:ts")).toBe(true);
      expect(graph.some((n) => n.tasks[0]?.name === "compile:css")).toBe(true);
      expect(graph.some((n) => n.tasks[0]?.name === "compile:assets")).toBe(
        true
      );

      // build:all should have 4 dependencies (all compile:* tasks)
      const EXPECTED_COMPILE_TASKS = 4;
      expect(buildNode?.dependencies.length).toBe(EXPECTED_COMPILE_TASKS);
    });

    it("handles exclusion patterns in dependencies", () => {
      const scripts: Script[] = [
        {
          command: 'f [test:*,!test:e2e] -- echo "Fast tests done"',
          name: "run:fast-tests",
        },
        { command: "vitest unit", name: "test:unit" },
        { command: "vitest integration", name: "test:integration" },
        { command: "playwright test", name: "test:e2e" },
      ];

      const graph = builder.buildGraph(["run:fast-tests"], scripts, {});

      // Should include unit and integration but not e2e
      expect(graph.some((n) => n.tasks[0]?.name === "test:unit")).toBe(true);
      expect(graph.some((n) => n.tasks[0]?.name === "test:integration")).toBe(
        true
      );
      expect(graph.some((n) => n.tasks[0]?.name === "test:e2e")).toBe(false);

      const runFastNode = graph.find(
        (n) => n.tasks[0]?.name === "run:fast-tests"
      );
      expect(runFastNode?.dependencies.length).toBe(2);
    });
  });

  describe("Mixed frunk and non-frunk commands", () => {
    it("handles mix of frunk and regular shell commands", () => {
      const scripts: Script[] = [
        {
          command: 'f [install,db:migrate] -- echo "Setup complete"',
          name: "setup",
        },
        { command: "npm ci", name: "install" }, // Regular command
        {
          command: "f [db:start] -- prisma migrate deploy",
          name: "db:migrate",
        }, // Frunk command
        { command: "docker-compose up -d postgres", name: "db:start" }, // Regular command
      ];

      const graph = builder.buildGraph(["setup"], scripts, {});

      // All tasks should be present
      const taskNames = graph.map((n) => n.tasks[0]?.name).filter(Boolean);
      expect(taskNames).toContain("setup");
      expect(taskNames).toContain("install");
      expect(taskNames).toContain("db:migrate");
      expect(taskNames).toContain("db:start");

      // Verify dependency chain
      const setupNode = graph.find((n) => n.tasks[0]?.name === "setup");
      const dbMigrateNode = graph.find(
        (n) => n.tasks[0]?.name === "db:migrate"
      );

      expect(setupNode?.dependencies.length).toBe(2); // depends on install and db:migrate
      expect(dbMigrateNode?.dependencies.length).toBe(1); // depends on db:start
    });
  });

  describe("Circular dependency detection", () => {
    it("detects direct circular dependencies", () => {
      const scripts: Script[] = [
        { command: 'f [task-b] -- echo "A"', name: "task-a" },
        { command: 'f [task-a] -- echo "B"', name: "task-b" },
      ];

      expect(() => {
        builder.buildGraph(["task-a"], scripts, {});
      }).toThrow(CIRCULAR_ERROR_REGEX);
    });

    it("detects indirect circular dependencies", () => {
      const scripts: Script[] = [
        { command: 'f [task-b] -- echo "A"', name: "task-a" },
        { command: 'f [task-c] -- echo "B"', name: "task-b" },
        { command: 'f [task-a] -- echo "C"', name: "task-c" },
      ];

      expect(() => {
        builder.buildGraph(["task-a"], scripts, {});
      }).toThrow(CIRCULAR_ERROR_REGEX);
    });
  });

  describe("Empty and edge cases", () => {
    it("handles scripts with no dependencies", () => {
      const scripts: Script[] = [
        { command: 'f -- echo "No deps"', name: "standalone" },
      ];

      const graph = builder.buildGraph(["standalone"], scripts, {});

      const node = graph.find((n) => n.tasks[0]?.name === "standalone");
      expect(node).toBeDefined();
      expect(node?.dependencies).toEqual([]);
      expect(node?.tasks[0]?.command).toBe('echo "No deps"');
    });

    it("handles empty dependency list", () => {
      const scripts: Script[] = [
        { command: 'f [] -- echo "Empty deps"', name: "empty-deps" },
      ];

      const graph = builder.buildGraph(["empty-deps"], scripts, {});

      const node = graph.find((n) => n.tasks[0]?.name === "empty-deps");
      expect(node).toBeDefined();
      expect(node?.dependencies).toEqual([]);
    });

    it("handles missing scripts gracefully", () => {
      const scripts: Script[] = [
        { command: 'f [nonexistent] -- echo "Missing dep"', name: "task" },
      ];

      const graph = builder.buildGraph(["task"], scripts, {});

      // Should create task node but skip missing dependency
      const taskNode = graph.find((n) => n.tasks[0]?.name === "task");
      expect(taskNode).toBeDefined();

      // Should not create node for nonexistent script
      const nonexistentNode = graph.find(
        (n) => n.tasks[0]?.name === "nonexistent"
      );
      expect(nonexistentNode).toBeUndefined();
    });
  });

  describe("Real-world monorepo scenario", () => {
    it("handles complex monorepo with multiple packages and shared tooling", () => {
      const scripts: Script[] = [
        // Root orchestration
        { command: "f [*:dev]", name: "dev" },
        { command: "f [*:build]", name: "build" },
        { command: "f [*:test]", name: "test" },

        // Shared tooling
        { command: 'echo "Setting up build tools"', name: "tools:setup" },
        {
          command: 'f [tools:setup] -- echo "Watching for changes"',
          name: "tools:watch",
        },

        // Package: core
        {
          command: 'f [tools:setup] -- echo "Core dependencies"',
          name: "core:deps",
        },
        {
          command: "f [core:deps] -- tsc -p packages/core",
          name: "core:build",
        },
        {
          command: "f [core:deps,tools:watch] -- tsc -w -p packages/core",
          name: "core:dev",
        },
        {
          command: "f [core:build] -- vitest packages/core",
          name: "core:test",
        },

        // Package: ui (depends on core)
        {
          command: 'f [core:build] -- echo "UI dependencies"',
          name: "ui:deps",
        },
        { command: "f [ui:deps] -- vite build packages/ui", name: "ui:build" },
        {
          command: "f [core:dev,tools:watch] -- vite dev packages/ui",
          name: "ui:dev",
        },
        { command: "f [ui:build] -- vitest packages/ui", name: "ui:test" },

        // Package: app (depends on both core and ui)
        {
          command: 'f [core:build,ui:build] -- echo "App dependencies"',
          name: "app:deps",
        },
        {
          command: "f [app:deps] -- next build packages/app",
          name: "app:build",
        },
        {
          command: "f [core:dev,ui:dev,tools:watch] -- next dev packages/app",
          name: "app:dev",
        },
        { command: "f [app:build] -- playwright test", name: "app:test" },
      ];

      const graph = builder.buildGraph(["dev"], scripts, {});

      // All dev scripts should be present
      expect(graph.some((n) => n.tasks[0]?.name === "core:dev")).toBe(true);
      expect(graph.some((n) => n.tasks[0]?.name === "ui:dev")).toBe(true);
      expect(graph.some((n) => n.tasks[0]?.name === "app:dev")).toBe(true);

      // Shared tools should only appear once
      const toolsSetupNodes = graph.filter(
        (n) => n.tasks[0]?.name === "tools:setup"
      );
      const toolsWatchNodes = graph.filter(
        (n) => n.tasks[0]?.name === "tools:watch"
      );
      expect(toolsSetupNodes).toHaveLength(1);
      expect(toolsWatchNodes).toHaveLength(1);

      // core:dev should only appear once even though app:dev depends on it
      const coreDevNodes = graph.filter((n) => n.tasks[0]?.name === "core:dev");
      expect(coreDevNodes).toHaveLength(1);

      // Verify app:dev has correct dependencies
      const appDevNode = graph.find((n) => n.tasks[0]?.name === "app:dev");
      expect(appDevNode?.dependencies.length).toBeGreaterThan(0);
    });
  });

  describe("Command parsing edge cases", () => {
    it("handles various frunk command formats", () => {
      const scripts: Script[] = [
        { command: 'f [dep1,dep2] -- echo "test"', name: "format1" },
        { command: 'f [dep1, dep2] -- echo "test"', name: "format2" }, // with spaces
        { command: 'f [dep1] -- echo "test"', name: "format3" }, // single dep
        { command: 'f -- echo "test"', name: "format4" }, // no deps
        { command: 'echo "dep1"', name: "dep1" },
        { command: 'echo "dep2"', name: "dep2" },
      ];

      const graph1 = builder.buildGraph(["format1"], scripts, {});
      const graph2 = builder.buildGraph(["format2"], scripts, {});
      const graph3 = builder.buildGraph(["format3"], scripts, {});
      const graph4 = builder.buildGraph(["format4"], scripts, {});

      // format1 and format2 should have same structure (2 deps)
      const format1Node = graph1.find((n) => n.tasks[0]?.name === "format1");
      const format2Node = graph2.find((n) => n.tasks[0]?.name === "format2");
      expect(format1Node?.dependencies.length).toBe(2);
      expect(format2Node?.dependencies.length).toBe(2);

      // format3 should have 1 dep
      const format3Node = graph3.find((n) => n.tasks[0]?.name === "format3");
      expect(format3Node?.dependencies.length).toBe(1);

      // format4 should have no deps
      const format4Node = graph4.find((n) => n.tasks[0]?.name === "format4");
      expect(format4Node?.dependencies.length).toBe(0);
    });
  });
});
