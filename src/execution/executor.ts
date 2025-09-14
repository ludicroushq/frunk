import { join } from "node:path";
import debug from "debug";
import { type ExecaChildProcess, execa } from "execa";
import type { ExecutionNode, RunOptions, Task } from "../types";
import { Logger, type TaskLogger } from "../utils/logger";

const log = debug("frunk:executor");

type RunningTask = {
  task: Task;
  process: ExecaChildProcess;
  logger: TaskLogger;
};

export class Executor {
  private readonly processes = new Map<string, RunningTask>();
  private readonly completed = new Set<string>();
  private readonly failed = new Set<string>();
  private readonly logger: Logger;
  private readonly options: RunOptions;
  private aborted = false;

  constructor(options: RunOptions = {}) {
    this.options = options;
    this.logger = new Logger(options);

    // Handle shutdown
    process.on("SIGINT", () => this.shutdown());
    process.on("SIGTERM", () => this.shutdown());
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Core execution orchestration requires this complexity
  async execute(nodes: ExecutionNode[]): Promise<void> {
    log("=== Starting execution ===");
    log("Nodes to execute:", nodes.length);
    for (const node of nodes) {
      log(`Node ${node.id}:`, {
        dependencies: node.dependencies,
        tasks: node.tasks.map((t) => ({ command: t.command, name: t.name })),
      });
    }

    // Register all tasks with logger (except inline commands)
    for (const node of nodes) {
      for (const task of node.tasks) {
        if (task.name !== "command") {
          this.logger.registerTask(task.name);
        }
      }
    }

    // Execute nodes respecting dependencies
    const running = new Set<string>();
    const completed = new Set<string>();

    const canRun = (node: ExecutionNode): boolean => {
      if (completed.has(node.id) || running.has(node.id)) {
        log(`Node ${node.id} already completed or running`);
        return false;
      }

      // Check if all dependencies are completed
      for (const dep of node.dependencies) {
        if (!completed.has(dep)) {
          log(`Node ${node.id} waiting for dependency ${dep}`);
          return false;
        }
      }

      log(`Node ${node.id} is ready to run`);
      return true;
    };

    const runNode = async (node: ExecutionNode): Promise<void> => {
      log(`Starting node ${node.id}`);
      running.add(node.id);

      try {
        if (node.sequential) {
          // Run tasks sequentially
          for (const task of node.tasks) {
            if (this.aborted) {
              break;
            }
            log(`Running task ${task.name} sequentially`);
            await this.runTask(task);
          }
        } else {
          // Run tasks in parallel
          log(
            `Running ${node.tasks.length} tasks in parallel:`,
            node.tasks.map((t) => t.name)
          );
          await Promise.all(node.tasks.map((task) => this.runTask(task)));
        }

        completed.add(node.id);
        log(`Completed node ${node.id}`);
      } catch (error) {
        this.failed.add(node.id);
        log(`Failed node ${node.id}:`, error);
        if (!this.options.continue) {
          throw error;
        }
      } finally {
        running.delete(node.id);
      }
    };

    // Main execution loop
    while (completed.size < nodes.length && !this.aborted) {
      const runnableNodes = nodes.filter(canRun);

      if (runnableNodes.length === 0) {
        if (running.size === 0) {
          // Check if we're stuck
          const remaining = nodes.filter((n) => !completed.has(n.id));
          if (remaining.length > 0) {
            throw new Error(
              `Cannot run nodes due to failed dependencies: ${remaining.map((n) => n.id).join(", ")}`
            );
          }
          break;
        }

        // Wait for something to complete
        const POLL_INTERVAL_MS = 100;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }

      // Start all runnable nodes
      await Promise.all(runnableNodes.map(runNode));
    }
  }

  private async runTask(task: Task): Promise<void> {
    log(`\n=== Running task: ${task.name} ===`);
    log(`Command: ${task.command}`);

    // For commands from --, run without prefix
    const isDirectCommand = task.name === "command";

    const logger: { log: (msg: string) => void; error: (msg: string) => void } =
      isDirectCommand
        ? {
            error: (msg: string) => console.error(msg),
            log: (msg: string) => console.log(msg),
          }
        : this.logger.createTaskLogger(task.name);

    if (!isDirectCommand) {
      this.logger.info(`Running: ${task.name}`);
    }

    // Create process
    const cwd = this.options.cwd ?? process.cwd();
    const npmBinPath = join(cwd, "node_modules", ".bin");
    const pathSeparator = process.platform === "win32" ? ";" : ":";
    // biome-ignore lint/complexity/useLiteralKeys: ts
    const enhancedPath = npmBinPath + pathSeparator + process.env["PATH"];

    // Run command exactly like npm does - use /bin/sh on Unix, cmd.exe on Windows
    const proc = execa(task.command, {
      cwd,
      env: {
        ...process.env,
        ...this.options.env,
        PATH: enhancedPath,
      },
      shell: true, // Uses /bin/sh on Unix, cmd.exe on Windows
      stdio: "pipe",
    });

    // Store running process
    const running: RunningTask = {
      logger: this.logger.createTaskLogger(task.name),
      process: proc,
      task,
    };
    this.processes.set(task.name, running);

    // Handle output
    proc.stdout?.on("data", (data: Buffer) => {
      logger.log(data.toString().trim());
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        logger.error(message);
      }
    });

    // Wait for task to complete
    try {
      await proc;
      if (!isDirectCommand) {
        this.logger.success(`Completed: ${task.name}`);
      }
      this.completed.add(task.name);
      this.processes.delete(task.name);
    } catch (err) {
      if (!this.aborted) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Failed: ${message}`);
        this.failed.add(task.name);
        if (!this.options.continue) {
          throw err;
        }
      }
    }
  }

  private shutdown(): void {
    if (this.aborted) {
      return;
    }
    this.aborted = true;

    // Only log shutdown if we have named tasks
    const hasNamedTasks = Array.from(this.processes.keys()).some(
      (name) => name !== "command"
    );
    if (hasNamedTasks) {
      this.logger.info("Shutting down...");
    }

    // Kill all processes
    for (const [name, running] of this.processes.entries()) {
      try {
        running.process.kill("SIGTERM");
        // Only log for named tasks, not inline commands
        if (name !== "command") {
          this.logger.info(`Stopped: ${name}`);
        }
      } catch {
        // Process may have already exited
      }
    }

    // Give processes time to clean up
    const SHUTDOWN_GRACE_PERIOD_MS = 1000;
    setTimeout(() => {
      for (const running of this.processes.values()) {
        try {
          running.process.kill("SIGKILL");
        } catch {
          // Process may have already exited
        }
      }
      process.exit(0);
    }, SHUTDOWN_GRACE_PERIOD_MS);
  }
}
