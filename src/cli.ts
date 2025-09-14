#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Runner } from './execution/runner';
import { Script } from './types';
import ansis from 'ansis';

function loadPackageScripts(cwd: string = process.cwd()): Script[] {
  const packagePath = join(cwd, 'package.json');
  
  if (!existsSync(packagePath)) {
    console.error(ansis.red('Error: No package.json found'));
    process.exit(1);
  }
  
  try {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    const scripts = packageJson.scripts || {};
    
    return Object.entries(scripts)
      .filter(([name]) => !name.startsWith('//')) // Skip comments
      .map(([name, command]) => ({
        name,
        command: command as string,
      }));
  } catch (error: any) {
    console.error(ansis.red(`Error reading package.json: ${error.message}`));
    process.exit(1);
  }
}

function showHelp(): void {
  console.log(`
${ansis.bold('frunk')} - A parallel script runner for npm scripts

${ansis.bold('Usage:')}
  f [patterns] [flags] -- command

${ansis.bold('Patterns:')}
  [test:*]              Run all scripts matching test:*
  [build:*,!build:slow] Run build scripts except build:slow
  [a]->[b]->[c]         Run a, then b, then c (sequential)
  [a,b]->[c,d]          Run a and b in parallel, then c and d

${ansis.bold('Flags:')}
  -q, --quiet           Suppress output
  -c, --continue        Continue on error
  --no-prefix           Disable output prefixes
  --prefix=<str>        Custom prefix

${ansis.bold('Examples:')}
  f [test:*]                     Run all test scripts
  f [build] -- node app.js       Run build, then run command
  f [lint,test]->[deploy]        Lint and test, then deploy
  f [test:*] -q -- echo done     Run tests quietly

${ansis.bold('Aliases:')}
  f     Short for frunk
  `);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Show help
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    process.exit(0);
  }
  
  // Load scripts
  const scripts = loadPackageScripts();
  
  // Run
  const runner = new Runner();
  await runner.run(args, scripts);
}

main().catch(error => {
  console.error(ansis.red('Fatal error:'), error);
  process.exit(1);
});