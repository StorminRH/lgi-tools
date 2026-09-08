import { spawn } from 'node:child_process';
import { localProcessEnvironment, assertLocalEnvironment, effectiveEnvironment, prepareEnvironment } from './environment.mjs';

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'guard') assertLocalEnvironment(effectiveEnvironment(process.cwd()));
  else if (command === 'prepare') prepareEnvironment(process.cwd());
  else {
    if (!command) throw new Error('Expected a command');
    const child = spawn(command, args, { stdio: 'inherit', detached: true, env: localProcessEnvironment(process.cwd()) });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (child.pid) process.kill(-child.pid, signal); });
    child.on('error', () => { console.error(`Could not start ${command}`); process.exitCode = 1; });
    child.on('exit', (code) => { process.exitCode = code ?? 1; });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
