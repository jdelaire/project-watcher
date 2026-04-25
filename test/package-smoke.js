import { spawnSync } from 'node:child_process';
import process from 'node:process';

const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8'
});

if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

let packs;
try {
  packs = JSON.parse(result.stdout);
} catch (error) {
  console.error(result.stdout);
  throw error;
}

const files = new Set((packs[0]?.files || []).map((file) => file.path));
const required = [
  'LICENSE',
  'README.md',
  'package.json',
  'project-watcher.config.example.json',
  'project-watcher.schema.json',
  'src/cli.js'
];
const forbiddenPrefixes = [
  'reports/',
  'docs/',
  '.github/',
  'test/',
  'tmp/'
];
const forbiddenFiles = [
  'project-watcher.config.json'
];

for (const file of required) {
  assert(files.has(file), `expected package to include ${file}`);
}

for (const file of files) {
  assert(!forbiddenFiles.includes(file), `package must not include ${file}`);
  assert(!forbiddenPrefixes.some((prefix) => file.startsWith(prefix)), `package must not include ${file}`);
}

console.log('Package smoke test passed');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
