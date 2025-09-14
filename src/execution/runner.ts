import { parseCommand } from '../core/parser';
import { PatternMatcher } from '../core/pattern-matcher';
import { GraphBuilder } from '../core/graph-builder';
import { Executor } from './executor';
import { Script, RunOptions } from '../types';

export class Runner {
  private matcher = new PatternMatcher();
  private graphBuilder = new GraphBuilder();

  async run(args: string[], availableScripts: Script[], options: RunOptions = {}): Promise<void> {
    try {
      // Parse command
      const parsed = parseCommand(args);
      
      // Merge config with options
      const config = { ...parsed.config, ...options };
      
      // Resolve patterns to actual scripts
      const resolvedPatterns = this.matcher.resolvePatterns(
        parsed.patterns, 
        availableScripts
      );
      
      // Validate patterns
      this.matcher.validatePatterns(parsed.patterns, availableScripts);
      
      // Build execution graph
      const graph = this.graphBuilder.buildGraph(
        resolvedPatterns,
        availableScripts,
        config,
        parsed.command
      );
      
      // Validate graph
      this.graphBuilder.validateGraph(graph);
      
      // Execute
      const executor = new Executor(config);
      await executor.execute(graph);
      
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
}