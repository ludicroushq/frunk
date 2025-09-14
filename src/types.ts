export interface Config {
  quiet?: boolean;
  continue?: boolean;
  prefix?: boolean | string;
  // Future: cache, timeout, retry, etc.
}

export interface ParsedCommand {
  patterns: string[];
  config: Config;
  command?: string;
}

export interface Task {
  name: string;
  command: string;
  dependencies: string[];
}

export interface Script {
  name: string;
  command: string;
}

export interface ExecutionNode {
  id: string;
  tasks: Task[];
  dependencies: string[];
  sequential: boolean;
}

export interface RunOptions extends Config {
  cwd?: string;
  env?: Record<string, string>;
}


export interface ParseError extends Error {
  position?: number;
  context?: string;
}