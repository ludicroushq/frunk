import debug from "debug";
import graphlib from "graphlib";
import type { Config, ExecutionNode, Script, Task } from "../types";
import { PatternMatcher } from "./pattern-matcher";

const { Graph, alg } = graphlib;

const log = debug("frunk:graph");

// Regex patterns used in parsing
const NODE_CLI_PATTERN = /^node\s+.*\/cli\.js\s+\[/;
const SIMPLE_FRUNK_PATTERN = /^(?:f|frunk)\s+--\s+(.+)$/;
const STANDARD_FRUNK_PATTERN =
  /^(?:f|frunk)\s+(\[.+?\])(?:\s+.*?)?\s*(?:--\s+(.+))?$/;
const PATH_BASED_PATTERN =
  /(?:cli\.js|node\s+.*\/cli\.js)\s+(\[.+?\])(?:\s+.*?)?\s*(?:--\s+(.+))?$/;
const SEQ_MARKER_REGEX = /^SEQ\d*:/;
const SEQ_INDEX_CAPTURE = /^SEQ(\d+):(.+)$/;

type TaskNode = {
  task: Task;
  isPlaceholder?: boolean;
};

export class GraphBuilder {
  // biome-ignore lint/style/useReadonlyClassProperties: ts
  private nodeCounter = 0;
  private readonly matcher = new PatternMatcher();

  /**
   * Build execution graph from resolved patterns
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Core graph construction requires this complexity
  buildGraph(
    patterns: string[],
    availableScripts: Script[],
    _config: Config,
    command?: string
  ): ExecutionNode[] {
    const scriptMap = new Map(availableScripts.map((s) => [s.name, s]));
    const graph = new Graph();

    log("=== Starting graph build ===");
    log("Input patterns:", patterns);
    log("Available scripts:", Array.from(scriptMap.keys()));

    // Parse sequential groups from patterns
    // Patterns come in as: ["SEQ:a", "SEQ:b", "SEQ:c", "SEQ:d"] for [a,b]->[c,d]
    // We need to identify the group boundaries based on the original pattern structure
    const sequentialGroups = this.parseSequentialGroups(patterns);
    log("Sequential groups:", sequentialGroups);

    // Helper to recursively process a script and its dependencies
    const processScript = (
      scriptName: string,
      visited = new Set<string>()
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Core dependency resolution logic requires this complexity
    ): void => {
      if (visited.has(scriptName)) {
        log(`Already visited ${scriptName}, skipping`);
        return;
      }
      visited.add(scriptName);

      const script = scriptMap.get(scriptName);
      if (!script) {
        log(`Script ${scriptName} not found`);
        return;
      }

      log(`Processing script: ${scriptName}, command: ${script.command}`);

      // Check if this script's command is itself a frunk command
      const isFrunkCommand =
        script.command.startsWith("f ") ||
        script.command.startsWith("frunk ") ||
        script.command.includes("/frunk/dist/cli.js") ||
        script.command.includes("frunk/dist/cli.js") ||
        script.command.match(NODE_CLI_PATTERN);

      let taskNode: TaskNode;

      if (isFrunkCommand) {
        // Parse the frunk command to extract dependencies and final command
        const frunkCmd = this.parseFrunkCommand(script.command);
        log(`Parsed frunk command for ${scriptName}:`, frunkCmd);

        if (frunkCmd) {
          // Create task node
          taskNode = {
            task: {
              command: frunkCmd.finalCommand || 'echo "No command"',
              dependencies: [],
              name: scriptName,
            },
          };

          // Add node to graph
          graph.setNode(scriptName, taskNode);

          // Resolve all patterns together to handle exclusions properly
          // e.g., [test:*,!test:e2e] needs to be resolved as a group
          let resolvedDeps: string[] = [];
          try {
            resolvedDeps = this.matcher.resolvePatterns(
              frunkCmd.dependencies,
              Array.from(scriptMap.values())
            );
          } catch (error) {
            // If a dependency doesn't exist, log and continue
            log(
              `Warning: Could not resolve dependencies for ${scriptName}: ${error}`
            );
            // Still try to process literal dependencies that might exist
            for (const dep of frunkCmd.dependencies) {
              if (scriptMap.has(dep)) {
                resolvedDeps.push(dep);
              }
            }
          }

          // Add edges for dependencies (note: edges go from dependent to dependency)
          for (const dep of resolvedDeps) {
            log(`Adding edge from ${scriptName} to ${dep}`);
            graph.setEdge(scriptName, dep);

            // Recursively process the dependency
            processScript(dep, visited);
          }
        } else {
          // Couldn't parse, use as-is
          log(`Could not parse frunk command for ${scriptName}, using as-is`);
          taskNode = {
            task: {
              command: script.command,
              dependencies: [],
              name: scriptName,
            },
          };
          graph.setNode(scriptName, taskNode);
        }
      } else {
        // Not a frunk command, use as-is
        log(`${scriptName} is not a frunk command, using as-is`);
        taskNode = {
          task: {
            command: script.command,
            dependencies: [],
            name: scriptName,
          },
        };
        graph.setNode(scriptName, taskNode);
      }
    };

    // Process all requested patterns (strip any sequential markers like SEQ0:, SEQ1:, etc.)
    const resolvedScriptNames = patterns.map((p) =>
      p.replace(SEQ_MARKER_REGEX, "")
    );
    for (const scriptName of resolvedScriptNames) {
      processScript(scriptName);
    }

    // Add edges between sequential groups
    // Each script in group N+1 should depend on ALL scripts in group N
    for (let i = 1; i < sequentialGroups.length; i++) {
      const prevGroup = sequentialGroups[i - 1];
      const currentGroup = sequentialGroups[i];

      if (!(prevGroup && currentGroup)) {
        continue;
      }

      for (const currentScript of currentGroup) {
        for (const prevScript of prevGroup) {
          // Only add edge if both nodes exist in the graph
          if (graph.hasNode(currentScript) && graph.hasNode(prevScript)) {
            log(
              `Adding sequential edge from ${currentScript} to ${prevScript}`
            );
            graph.setEdge(currentScript, prevScript);
          }
        }
      }
    }

    // If we have a direct command after --, add it as a node that depends
    // on all requested scripts so it runs after dependencies complete.
    if (command && resolvedScriptNames.length > 0) {
      const COMMAND_NODE_NAME = "__frunk_command__";
      const commandTask: TaskNode = {
        task: {
          command,
          dependencies: [],
          name: "command",
        },
      };
      graph.setNode(COMMAND_NODE_NAME, commandTask);

      for (const depName of resolvedScriptNames) {
        // Only add edges to scripts that exist; skip unknowns gracefully
        if (graph.hasNode(depName)) {
          log(`Adding edge from command to ${depName}`);
          graph.setEdge(COMMAND_NODE_NAME, depName);
        }
      }
    }

    log("\n=== Graph structure ===");
    log("Nodes:", graph.nodes());
    log("Edges:", graph.edges());

    // Check for cycles
    if (!alg.isAcyclic(graph)) {
      const cycles = alg.findCycles(graph);
      throw new Error(
        `Circular dependency detected: ${JSON.stringify(cycles)}`
      );
    }

    // Get topological sort to determine execution order
    const executionOrder = alg.topsort(graph);
    log("Execution order (topological sort):", executionOrder);

    // Build execution nodes from the graph
    const nodes: ExecutionNode[] = [];
    const nodeIdMap = new Map<string, string>(); // taskName -> nodeId

    // Create nodes in reverse topological order (dependencies first)
    for (const taskName of executionOrder.reverse()) {
      const taskNode = graph.node(taskName) as TaskNode | undefined;
      if (!taskNode) {
        continue;
      }

      // Skip if already processed
      if (nodeIdMap.has(taskName)) {
        continue;
      }

      // Get dependencies (successors in the graph since edges go from dependent to dependency)
      const dependencies = graph.successors(taskName) || [];
      const depNodeIds = dependencies
        .map((dep) => nodeIdMap.get(dep))
        .filter((id): id is string => id !== undefined);

      // Create execution node
      const nodeId = `node_${this.nodeCounter++}`;
      const node: ExecutionNode = {
        dependencies: depNodeIds,
        id: nodeId,
        sequential: false,
        tasks: [taskNode.task],
      };

      log(`Created node ${nodeId} for task ${taskName}:`, {
        command: taskNode.task.command,
        dependencies: depNodeIds,
      });

      nodes.push(node);
      nodeIdMap.set(taskName, nodeId);
    }

    log("\n=== Final execution nodes ===");
    log("Total nodes:", nodes.length);
    for (const node of nodes) {
      const taskNames = node.tasks.map((t) => t.name).join(", ");
      const depNames = node.dependencies
        .map((depId) => {
          const depNode = nodes.find((n) => n.id === depId);
          return depNode?.tasks.map((t) => t.name).join(",") || depId;
        })
        .join(", ");
      log(`Node ${node.id}: [${taskNames}] depends on [${depNames}]`);
    }
    log("=== End graph build ===\n");

    // If we have a command but no patterns, create a single task
    if (patterns.length === 0 && command) {
      nodes.push({
        dependencies: [],
        id: `node_${this.nodeCounter++}`,
        sequential: false,
        tasks: [
          {
            command,
            dependencies: [],
            name: "command",
          },
        ],
      });
    } else if (patterns.length === 0 && nodes.length === 0) {
      // Empty pattern group for consistency
      nodes.push({
        dependencies: [],
        id: `node_${this.nodeCounter++}`,
        sequential: false,
        tasks: [],
      });
    }

    return nodes;
  }

  /**
   * Parse a frunk command to extract dependencies and final command
   */
  private parseFrunkCommand(
    command: string
  ): { dependencies: string[]; finalCommand?: string } | null {
    // Parse commands like:
    // - "f [shared:dep,discord:dep] -- tsx --watch"
    // - "f -- echo 'hello'" (no dependencies, just a command)
    // - "/path/to/cli.js [test,build]"
    // - "node /path/to/cli.js [test,build] -- command"

    // First check for the simple "f -- command" format (no dependencies)
    const simpleMatch = command.match(SIMPLE_FRUNK_PATTERN);
    if (simpleMatch?.[1]) {
      // This is just a command with no dependencies
      return {
        dependencies: [],
        finalCommand: simpleMatch[1].trim(),
      };
    }

    // Try standard f/frunk format with patterns
    let match = command.match(STANDARD_FRUNK_PATTERN);

    // If not found, try path-based format
    if (!match) {
      match = command.match(PATH_BASED_PATTERN);
    }

    if (!match) {
      return null;
    }

    const patternsStr = match[1];
    const finalCommand = match[2];

    if (!patternsStr) {
      return null;
    }

    // Parse the patterns (remove brackets and split by comma)
    if (!(patternsStr.startsWith("[") && patternsStr.endsWith("]"))) {
      return null;
    }

    const patterns = patternsStr
      .slice(1, -1)
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p);

    return {
      dependencies: patterns,
      ...(finalCommand && { finalCommand: finalCommand.trim() }),
    };
  }

  /**
   * Parse sequential groups from patterns
   * Input patterns like ["SEQ0:a", "SEQ0:b", "SEQ1:c", "SEQ1:d"] from [a,b]->[c,d]
   * The numeric index indicates which sequential group each pattern belongs to.
   */
  private parseSequentialGroups(patterns: string[]): string[][] {
    if (patterns.length === 0) {
      return [];
    }

    // Check if we have any sequential markers (SEQ0:, SEQ1:, etc.)
    const hasSequential = patterns.some((p) => SEQ_INDEX_CAPTURE.test(p));
    if (!hasSequential) {
      // All parallel, single group
      return [patterns];
    }

    // Group patterns by their SEQ index
    const groupMap = new Map<number, string[]>();
    const nonSeqPatterns: string[] = [];

    for (const pattern of patterns) {
      const match = pattern.match(SEQ_INDEX_CAPTURE);
      if (match?.[1] && match[2]) {
        const groupIndex = Number.parseInt(match[1], 10);
        const scriptName = match[2];

        if (!groupMap.has(groupIndex)) {
          groupMap.set(groupIndex, []);
        }
        groupMap.get(groupIndex)?.push(scriptName);
      } else {
        // Non-sequential pattern
        nonSeqPatterns.push(pattern);
      }
    }

    // Convert map to sorted array of groups
    const sortedIndices = Array.from(groupMap.keys()).sort((a, b) => a - b);
    const groups: string[][] = [];

    for (const index of sortedIndices) {
      const group = groupMap.get(index);
      if (group && group.length > 0) {
        groups.push(group);
      }
    }

    // Add non-sequential patterns as a final group if any
    if (nonSeqPatterns.length > 0) {
      groups.push(nonSeqPatterns);
    }

    return groups;
  }

  /**
   * Validate graph for cycles (using graphlib's built-in validation)
   */
  validateGraph(nodes: ExecutionNode[]): void {
    // Build a graph from the execution nodes
    const graph = new Graph();

    // Add all nodes
    for (const node of nodes) {
      graph.setNode(node.id);
    }

    // Add edges
    for (const node of nodes) {
      for (const dep of node.dependencies) {
        graph.setEdge(node.id, dep);
      }
    }

    // Check for cycles
    if (!alg.isAcyclic(graph)) {
      const cycles = alg.findCycles(graph);
      throw new Error(
        `Circular dependency detected: ${JSON.stringify(cycles)}`
      );
    }
  }
}
