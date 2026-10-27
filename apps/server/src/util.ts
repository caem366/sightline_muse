import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function command(args: string[], cwd: string, timeoutMs = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), {cwd, shell: process.platform === 'win32', windowsHide: true, stdio: ['ignore','pipe','pipe']});
    let output = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', data => output += data.toString());
    child.stderr.on('data', data => output += data.toString());
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error(`${args.join(' ')} exited ${code}: ${output.slice(-3000)}`)); });
  });
}
export async function save(path: string, data: string|Buffer) { await mkdir(dirname(path), {recursive:true}); await writeFile(path,data); }
export function assertLocalPath(path: string) { if (!path || path.includes('..') || path.startsWith('/') || path.includes('\\') || !/^[a-zA-Z0-9_./-]+$/.test(path)) throw new Error('Invalid relative path'); }
