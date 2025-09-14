import { Task, ExecutionNode, Script, Config } from '../types';
import { PatternMatcher } from './pattern-matcher';
import debug from 'debug';

const log = debug('frunk:graph');

export class GraphBuilder {
  private nodeCounter = 0;
  private matcher = new PatternMatcher();

  /**
   * Build execution graph from resolved patterns
   */
  buildGraph(
    patterns: string[], 
    availableScripts: Script[],
    _config: Config,
    command?: string
  ): ExecutionNode[] {
    const scriptMap = new Map(availableScripts.map(s => [s.name, s]));
    const allTasks = new Map<string, Task>();
    const taskDependencies = new Map<string, string[]>();
    
    log('=== Starting graph build ===');
    log('Input patterns:', patterns);
    log('Available scripts:', Array.from(scriptMap.keys()));
    
    // Helper to recursively process a script and its dependencies
    const processScript = (scriptName: string, visited = new Set<string>()): void => {
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
        script.command.startsWith('f ') || 
        script.command.startsWith('frunk ') ||
        script.command.includes('/frunk/dist/cli.js') ||
        script.command.includes('frunk/dist/cli.js') ||
        script.command.match(/^node\s+.*\/cli\.js\s+\[/);
      
      if (isFrunkCommand) {
        // Parse the frunk command to extract dependencies and final command
        const frunkCmd = this.parseFrunkCommand(script.command);
        log(`Parsed frunk command for ${scriptName}:`, frunkCmd);
        
        if (frunkCmd) {
          // Store this task with its final command
          allTasks.set(scriptName, {
            name: scriptName,
            command: frunkCmd.finalCommand || 'echo "No command"',
            dependencies: [],
          });
          
          // Resolve glob patterns in dependencies to actual script names
          const resolvedDeps: string[] = [];
          for (const dep of frunkCmd.dependencies) {
            if (dep.includes('*') || dep.includes('?')) {
              // It's a glob pattern, resolve it
              const resolved = this.matcher.resolvePatterns([dep], Array.from(scriptMap.values()));
              resolvedDeps.push(...resolved);
            } else {
              resolvedDeps.push(dep);
            }
          }
          
          // Store the resolved dependencies for later resolution
          taskDependencies.set(scriptName, resolvedDeps);
          
          // Recursively process each resolved dependency
          for (const dep of resolvedDeps) {
            log(`Processing dependency ${dep} of ${scriptName}`);
            processScript(dep, visited);
          }
        } else {
          // Couldn't parse, use as-is
          log(`Could not parse frunk command for ${scriptName}, using as-is`);
          allTasks.set(scriptName, {
            name: scriptName,
            command: script.command,
            dependencies: [],
          });
        }
      } else {
        // Not a frunk command, use as-is
        log(`${scriptName} is not a frunk command, using as-is`);
        allTasks.set(scriptName, {
          name: scriptName,
          command: script.command,
          dependencies: [],
        });
      }
    };
    
    // First pass: collect all tasks and their dependencies
    for (const pattern of patterns) {
      const scriptName = pattern.replace('SEQ:', '');
      processScript(scriptName);
    }
    
    log('\n=== Second pass: building execution nodes ===');
    log('All tasks collected:', Array.from(allTasks.keys()));
    log('Task dependencies:', Array.from(taskDependencies.entries()));
    
    // Second pass: build execution nodes with proper dependencies
    const nodes: ExecutionNode[] = [];
    const nodeIdMap = new Map<string, string>(); // taskName -> nodeId
    
    // Helper to create a node for a task and its dependencies
    const createNodeForTask = (taskName: string, visited = new Set<string>()): string => {
      log(`\nCreating node for task: ${taskName}`);
      
      // Check for circular dependencies
      if (visited.has(taskName)) {
        log(`Circular dependency detected for ${taskName}`);
        return '';
      }
      visited.add(taskName);
      
      // Check if already processed
      if (nodeIdMap.has(taskName)) {
        const existingId = nodeIdMap.get(taskName)!;
        log(`Task ${taskName} already has node ${existingId}`);
        return existingId;
      }
      
      const task = allTasks.get(taskName);
      if (!task) {
        log(`Task ${taskName} not found in allTasks`);
        return '';
      }
      
      const deps = taskDependencies.get(taskName) || [];
      log(`Task ${taskName} has dependencies:`, deps);
      
      const depNodeIds: string[] = [];
      
      // First create nodes for dependencies
      for (const dep of deps) {
        const depNodeId = createNodeForTask(dep, new Set(visited));
        if (depNodeId) {
          depNodeIds.push(depNodeId);
          log(`Added dependency node ${depNodeId} for ${dep}`);
        }
      }
      
      // Create node for this task
      const nodeId = `node_${this.nodeCounter++}`;
      const node: ExecutionNode = {
        id: nodeId,
        tasks: [task],
        dependencies: depNodeIds,
        sequential: false,
      };
      
      log(`Created node ${nodeId} for task ${taskName}:`, {
        command: task.command,
        dependencies: depNodeIds
      });
      
      nodes.push(node);
      nodeIdMap.set(taskName, nodeId);
      
      return nodeId;
    };
    
    // Create nodes for all requested patterns
    for (const pattern of patterns) {
      const scriptName = pattern.replace('SEQ:', '');
      log(`\n=== Creating nodes for pattern: ${scriptName} ===`);
      createNodeForTask(scriptName);
    }
    
    log('\n=== Final graph ===');
    log('Total nodes:', nodes.length);
    for (const node of nodes) {
      const taskNames = node.tasks.map(t => t.name).join(', ');
      const depNames = node.dependencies.map(depId => {
        const depNode = nodes.find(n => n.id === depId);
        return depNode?.tasks.map(t => t.name).join(',') || depId;
      }).join(', ');
      log(`Node ${node.id}: [${taskNames}] depends on [${depNames}]`);
    }
    log('=== End graph build ===\n');
    
    // If we have a command but no patterns, create a single task
    if (patterns.length === 0 && command) {
      nodes.push({
        id: `node_${this.nodeCounter++}`,
        tasks: [{
          name: 'command',
          command,
          dependencies: [],
        }],
        dependencies: [],
        sequential: false,
      });
    } else if (patterns.length === 0) {
      // Empty pattern group for consistency
      nodes.push({
        id: `node_${this.nodeCounter++}`,
        tasks: [],
        dependencies: [],
        sequential: false,
      });
    }
    
    return nodes;
  }


  /**
   * Parse a frunk command to extract dependencies and final command
   */
  private parseFrunkCommand(command: string): { dependencies: string[], finalCommand?: string } | null {
    // Parse commands like:
    // - "f [shared:dep,discord:dep] -- tsx --watch"
    // - "f -- echo 'hello'" (no dependencies, just a command)
    // - "/path/to/cli.js [test,build]"
    // - "node /path/to/cli.js [test,build] -- command"
    
    // First check for the simple "f -- command" format (no dependencies)
    const simpleMatch = command.match(/^(?:f|frunk)\s+--\s+(.+)$/);
    if (simpleMatch && simpleMatch[1]) {
      // This is just a command with no dependencies
      return {
        dependencies: [],
        finalCommand: simpleMatch[1].trim()
      };
    }
    
    // Try standard f/frunk format with patterns
    let match = command.match(/^(?:f|frunk)\s+(\[.+?\])(?:\s+.*?)?\s*(?:--\s+(.+))?$/);
    
    // If not found, try path-based format
    if (!match) {
      match = command.match(/(?:cli\.js|node\s+.*\/cli\.js)\s+(\[.+?\])(?:\s+.*?)?\s*(?:--\s+(.+))?$/);
    }
    
    if (!match) return null;
    
    const patternsStr = match[1];
    const finalCommand = match[2];
    
    if (!patternsStr) return null;
    
    // Parse the patterns (remove brackets and split by comma)
    if (!patternsStr.startsWith('[') || !patternsStr.endsWith(']')) {
      return null;
    }
    
    const patterns = patternsStr
      .slice(1, -1)
      .split(',')
      .map(p => p.trim())
      .filter(p => p);
    
    return {
      dependencies: patterns,
      ...(finalCommand && { finalCommand: finalCommand.trim() })
    };
  }

  /**
   * Validate graph for cycles
   */
  validateGraph(nodes: ExecutionNode[]): void {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    // Check for cycles
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const hasCycle = (nodeId: string): boolean => {
      if (visiting.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      
      visiting.add(nodeId);
      const node = nodeMap.get(nodeId);
      
      if (node) {
        for (const dep of node.dependencies) {
          if (hasCycle(dep)) return true;
        }
      }
      
      visiting.delete(nodeId);
      visited.add(nodeId);
      return false;
    };
    
    for (const node of nodes) {
      if (hasCycle(node.id)) {
        throw new Error('Circular dependency detected in execution graph');
      }
    }
  }
}