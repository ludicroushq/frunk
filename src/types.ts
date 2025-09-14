export type Config = {
  quiet?: boolean;
  continue?: boolean;
  prefix?: boolean | string;
  // Future: cache, timeout, retry, etc.
};

export type ParsedCommand = {
  patterns: string[];
  config: Config;
  command?: string;
};

export type Task = {
  name: string;
  command: string;
  dependencies: string[];
};

export type Script = {
  name: string;
  command: string;
};

export type ExecutionNode = {
  id: string;
  tasks: Task[];
  dependencies: string[];
  sequential: boolean;
};

export interface RunOptions extends Config {
  cwd?: string;
  env?: Record<string, string>;
}

export interface ParseError extends Error {
  position?: number;
  context?: string;
}
