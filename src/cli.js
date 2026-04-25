#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_CONFIG = {
  paths: ['~/Projects'],
  maxDepth: 4,
  outputDir: 'reports',
  excludeDirs: [
    '.git',
    '__pycache__',
    '.env',
    '.mypy_cache',
    '.pytest_cache',
    '.ruff_cache',
    '.asc',
    '.tmp',
    '.venv',
    '.venv-placeholders',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.next',
    '.playwright',
    '.turbo',
    '.cache',
    '.build',
    'DerivedData',
    'dSYMs',
    'env',
    'playwright-profiles',
    'site-packages',
    'target',
    'tmp',
    'venv',
    'vendor'
  ],
  excludeFiles: [
    '.DS_Store',
    '.env',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'Cargo.lock',
    'Gemfile.lock'
  ],
  maxFileBytes: 1024 * 1024,
  locTool: 'auto',
  countDuplicateFiles: false,
  fileScope: 'tracked',
  maxSnapshots: 52,
  releaseReadiness: {
    watchAfterDays: 30,
    staleAfterDays: 90,
    releaseDueAfterCommits: 20
  }
};

const LANGUAGE_BY_EXTENSION = new Map([
  ['.astro', 'Astro'],
  ['.c', 'C'],
  ['.cc', 'C++'],
  ['.clj', 'Clojure'],
  ['.cpp', 'C++'],
  ['.cs', 'C#'],
  ['.css', 'CSS'],
  ['.dart', 'Dart'],
  ['.ex', 'Elixir'],
  ['.exs', 'Elixir'],
  ['.go', 'Go'],
  ['.h', 'C/C++ Header'],
  ['.hpp', 'C/C++ Header'],
  ['.html', 'HTML'],
  ['.java', 'Java'],
  ['.js', 'JavaScript'],
  ['.json', 'JSON'],
  ['.jsx', 'JavaScript'],
  ['.kt', 'Kotlin'],
  ['.kts', 'Kotlin'],
  ['.lua', 'Lua'],
  ['.m', 'Objective-C'],
  ['.md', 'Markdown'],
  ['.mm', 'Objective-C++'],
  ['.php', 'PHP'],
  ['.plist', 'Property List'],
  ['.py', 'Python'],
  ['.rb', 'Ruby'],
  ['.rs', 'Rust'],
  ['.scss', 'SCSS'],
  ['.sh', 'Shell'],
  ['.sql', 'SQL'],
  ['.svelte', 'Svelte'],
  ['.swift', 'Swift'],
  ['.toml', 'TOML'],
  ['.ts', 'TypeScript'],
  ['.tsx', 'TypeScript'],
  ['.vue', 'Vue'],
  ['.xml', 'XML'],
  ['.yaml', 'YAML'],
  ['.yml', 'YAML'],
  ['.zig', 'Zig']
]);

const LANGUAGE_BY_FILENAME = new Map([
  ['Dockerfile', 'Dockerfile'],
  ['Makefile', 'Makefile'],
  ['Rakefile', 'Ruby'],
  ['Gemfile', 'Ruby'],
  ['Podfile', 'Ruby']
]);

const BINARY_EXTENSIONS = new Set([
  '.a',
  '.app',
  '.bin',
  '.bmp',
  '.class',
  '.dmg',
  '.dll',
  '.doc',
  '.docx',
  '.dylib',
  '.eot',
  '.exe',
  '.gif',
  '.heic',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.o',
  '.otf',
  '.pdf',
  '.png',
  '.so',
  '.sqlite',
  '.ttf',
  '.webp',
  '.woff',
  '.woff2',
  '.xcarchive',
  '.zip'
]);

const SEMVER_TAG = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const RELEASE_READINESS_RANK = new Map([
  ['fresh', 0],
  ['watch', 1],
  ['release due', 2],
  ['stale', 3]
]);
const UNRELEASED_COMMIT_LIMIT = 10;
const UNRELEASED_FILE_LIMIT = 10;
const UNRELEASED_AUTHOR_LIMIT = 8;
const HOURS_TO_MS = 60 * 60 * 1000;
const DEFAULT_SERVE_SCAN_INTERVAL_HOURS = 12;
const DOCS_DIR = 'docs';
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);

const AI_AGENT_DEFINITIONS = [
  {
    id: 'claude',
    name: 'Claude Code',
    iconUrl: './assets/agents/claude.svg',
    homepage: 'https://claude.ai/code',
    fallback: 'C',
    signals: [
      { pattern: /^CLAUDE\.md$/i, label: 'CLAUDE.md' },
      { pattern: /^\.claude\//i, label: '.claude/' }
    ]
  },
  {
    id: 'codex',
    name: 'Codex',
    iconUrl: 'https://openai.com/favicon.ico',
    homepage: 'https://openai.com/codex',
    fallback: 'O',
    signals: [
      { pattern: /^AGENTS\.md$/i, label: 'AGENTS.md' },
      { pattern: /^\.codex\//i, label: '.codex/' }
    ]
  },
  {
    id: 'cursor',
    name: 'Cursor',
    iconUrl: 'https://cursor.com/favicon.ico',
    homepage: 'https://cursor.com',
    fallback: 'Cu',
    signals: [
      { pattern: /^\.cursor\//i, label: '.cursor/' },
      { pattern: /^\.cursorrules$/i, label: '.cursorrules' }
    ]
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    iconUrl: 'https://github.githubassets.com/favicons/favicon.svg',
    homepage: 'https://github.com/features/copilot',
    fallback: 'GH',
    signals: [
      { pattern: /^\.github\/copilot-instructions\.md$/i, label: 'copilot-instructions.md' },
      { pattern: /^\.github\/instructions\/.+\.instructions\.md$/i, label: '.github/instructions/' }
    ]
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    iconUrl: 'https://windsurf.com/favicon.ico',
    homepage: 'https://windsurf.com',
    fallback: 'W',
    signals: [
      { pattern: /^\.windsurf\//i, label: '.windsurf/' },
      { pattern: /^\.windsurfrules$/i, label: '.windsurfrules' }
    ]
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    iconUrl: 'https://www.gstatic.com/lamda/images/gemini_favicon_f069958c85030456e93de685481c559f160ea06b.png',
    homepage: 'https://gemini.google.com',
    fallback: 'G',
    signals: [
      { pattern: /^GEMINI\.md$/i, label: 'GEMINI.md' },
      { pattern: /^\.gemini\//i, label: '.gemini/' }
    ]
  },
  {
    id: 'aider',
    name: 'Aider',
    iconUrl: '',
    homepage: 'https://aider.chat',
    fallback: 'A',
    signals: [
      { pattern: /^\.aider/i, label: '.aider*' },
      { pattern: /^aider\.conf\.ya?ml$/i, label: 'aider.conf' }
    ]
  },
  {
    id: 'cline',
    name: 'Cline',
    iconUrl: '',
    homepage: 'https://cline.bot',
    fallback: 'Cl',
    signals: [
      { pattern: /^\.cline\//i, label: '.cline/' },
      { pattern: /^\.clinerules$/i, label: '.clinerules' }
    ]
  },
  {
    id: 'roo',
    name: 'Roo Code',
    iconUrl: 'https://roocode.com/favicon.ico',
    homepage: 'https://roocode.com',
    fallback: 'R',
    signals: [
      { pattern: /^\.roo\//i, label: '.roo/' },
      { pattern: /^\.roomodes$/i, label: '.roomodes' },
      { pattern: /^\.rooignore$/i, label: '.rooignore' }
    ]
  }
];

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'scan';

  try {
    if (command === 'scan') {
      await scanCommand(args);
    } else if (command === 'init') {
      await initCommand(args);
    } else if (command === 'doctor') {
      await doctorCommand(args);
    } else if (command === 'serve') {
      await serveCommand(args);
    } else if (command === 'help' || command === '--help' || command === '-h') {
      printHelp();
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(`project-watcher: ${error.message}`);
    process.exitCode = 1;
  }
}

async function scanCommand(args) {
  const { configPath, jsonOnly } = parseScanArgs(args);
  const scan = await writeScanReport(configPath);

  if (jsonOnly) {
    console.log(JSON.stringify(scan.report, null, 2));
    return;
  }

  logScanResult(scan);
}

async function writeScanReport(configPath) {
  const loaded = await loadConfig(configPath);
  const config = normalizeConfig(loaded.config, loaded.configPath);

  const repoPaths = await discoverRepositories(config);
  const repositories = [];

  for (const repoPath of repoPaths) {
    repositories.push(await analyzeRepository(repoPath, config));
  }

  repositories.sort(sortRepositoriesByActivity);
  assignRepositoryDetailPaths(repositories);
  assignRepositoryDocPaths(repositories);
  assignRepositoryChangelogPaths(repositories);

  const baseReport = buildReport({
    generatedAt: new Date().toISOString(),
    configPath: loaded.configPath,
    roots: config.paths,
    repositories,
    config
  });

  const outputDir = resolvePath(config.outputDir, path.dirname(loaded.configPath));
  const snapshotsDir = path.join(outputDir, 'snapshots');
  await fsp.mkdir(snapshotsDir, { recursive: true });

  const previousSnapshots = await readSnapshots(snapshotsDir);
  const report = {
    ...baseReport,
    history: buildHistory([...previousSnapshots, baseReport]),
    delta: buildDelta(previousSnapshots, baseReport)
  };

  const jsonPath = path.join(outputDir, 'report.json');
  const markdownPath = path.join(outputDir, 'report.md');
  const htmlPath = path.join(outputDir, 'report.html');
  const snapshotPath = path.join(snapshotsDir, `${safeTimestamp(baseReport.generatedAt)}.json`);

  await writeDashboardAssets(outputDir, report);
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(snapshotPath, `${JSON.stringify(baseReport, null, 2)}\n`, 'utf8');
  await fsp.writeFile(markdownPath, renderMarkdown(report), 'utf8');
  await fsp.writeFile(htmlPath, renderHtml(report), 'utf8');
  await writeCsvExports(outputDir, report);
  await writeRepositoryPages(outputDir, report);
  await pruneSnapshots(snapshotsDir, config.maxSnapshots);

  return {
    report,
    outputDir,
    jsonPath,
    markdownPath,
    htmlPath,
    csvPath: path.join(outputDir, 'csv'),
    snapshotPath,
    repositoryCount: repositories.length
  };
}

function logScanResult(scan) {
  console.log(`Scanned ${scan.repositoryCount} repositories`);
  console.log(`JSON: ${scan.jsonPath}`);
  console.log(`Markdown: ${scan.markdownPath}`);
  console.log(`Dashboard: ${scan.htmlPath}`);
  console.log(`CSV: ${scan.csvPath}`);
  console.log(`Snapshot: ${scan.snapshotPath}`);
}

async function initCommand(args) {
  const target = args[0] ? resolvePath(args[0], process.cwd()) : path.join(process.cwd(), 'project-watcher.config.json');

  if (fs.existsSync(target)) {
    throw new Error(`Config already exists: ${target}`);
  }

  await fsp.writeFile(target, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8');
  console.log(`Created ${target}`);
}

async function doctorCommand(args) {
  const { configPath } = parseDoctorArgs(args);
  const checks = [];

  try {
    const loaded = await loadConfig(configPath);
    checks.push(okCheck('Config file', loaded.configPath));

    const config = normalizeConfig(loaded.config, loaded.configPath);
    checks.push(okCheck('Config JSON', 'valid'));

    for (const root of config.paths) {
      if (!fs.existsSync(root)) {
        checks.push(failCheck('Scan path missing', root));
        continue;
      }

      const stat = await fsp.stat(root);
      checks.push(stat.isDirectory()
        ? okCheck('Scan path', root)
        : failCheck('Scan path is not a directory', root));
    }

    const outputDir = resolvePath(config.outputDir, path.dirname(loaded.configPath));
    await fsp.mkdir(outputDir, { recursive: true });
    await fsp.access(outputDir, fs.constants.W_OK);
    checks.push(okCheck('Output directory', outputDir));

    const repoPaths = await discoverRepositories(config);
    checks.push(repoPaths.length > 0
      ? okCheck('Repository discovery', `${formatNumber(repoPaths.length)} repositories`)
      : warnCheck('Repository discovery', 'no repositories found'));

    const availableLocTools = ['cloc', 'tokei', 'scc'].filter(commandExists);
    if (config.fileScope === 'tracked' && !commandExists('cloc')) {
      checks.push(warnCheck('LOC tool', 'tracked mode needs cloc for external classified counts; builtin fallback will be used'));
    } else if (availableLocTools.length > 0) {
      checks.push(okCheck('LOC tool', availableLocTools.join(', ')));
    } else {
      checks.push(warnCheck('LOC tool', 'no cloc/tokei/scc found; builtin fallback will be used'));
    }

    checks.push(Number.isInteger(config.maxSnapshots) && config.maxSnapshots > 0
      ? okCheck('Snapshot retention', `keeping latest ${formatNumber(config.maxSnapshots)} snapshots`)
      : warnCheck('Snapshot retention', 'disabled; snapshots will grow without pruning'));

    const ignoreCheck = checkConfigIgnored(loaded.configPath);
    checks.push(ignoreCheck);
  } catch (error) {
    checks.push(failCheck('Config load', error.message));
  }

  for (const check of checks) {
    console.log(`${check.status.padEnd(4)} ${check.name}: ${check.detail}`);
  }

  if (checks.some((check) => check.status === 'FAIL')) {
    process.exitCode = 1;
  }
}

async function serveCommand(args) {
  const { configPath, host, port, open, autoScan, scanIntervalHours } = parseServeArgs(args);
  const startupScan = autoScan
    ? await runServeScan(configPath, 'startup')
    : await prepareStaticOutput(configPath);
  const outputDir = startupScan.outputDir;

  const server = http.createServer(async (request, response) => {
    try {
      const requestedUrl = new URL(request.url || '/', `http://${host}:${port}`);
      const filePath = resolveStaticPath(outputDir, requestedUrl.pathname);

      if (!filePath) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const stat = await fsp.stat(filePath);
      if (!stat.isFile()) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      response.writeHead(200, {
        'content-type': contentType(filePath),
        'cache-control': 'no-store'
      });
      fs.createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });

  let scanInProgress = false;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  console.log(`Serving ${outputDir}`);
  const dashboardUrl = `http://${host}:${port}/`;
  console.log(`Dashboard: ${dashboardUrl}`);
  if (autoScan) {
    console.log(`Auto-scan: every ${formatHours(scanIntervalHours)}`);
    const scanTimer = setInterval(() => {
      if (scanInProgress) {
        console.log('Skipping scheduled scan; previous scan is still running');
        return;
      }

      scanInProgress = true;
      runServeScan(configPath, 'scheduled')
        .catch((error) => {
          console.error(`Scheduled scan failed: ${error.message}`);
        })
        .finally(() => {
          scanInProgress = false;
        });
    }, scanIntervalHours * HOURS_TO_MS);

    server.once('close', () => clearInterval(scanTimer));
  }

  if (open) {
    openUrl(dashboardUrl);
  }
}

async function prepareStaticOutput(configPath) {
  const loaded = await loadConfig(configPath);
  const config = normalizeConfig(loaded.config, loaded.configPath);
  const outputDir = resolvePath(config.outputDir, path.dirname(loaded.configPath));
  const dashboardPath = path.join(outputDir, 'report.html');

  if (!fs.existsSync(dashboardPath)) {
    throw new Error(`Dashboard not found: ${dashboardPath}. Run "node ./src/cli.js scan" first.`);
  }

  return { outputDir };
}

async function runServeScan(configPath, reason) {
  console.log(`Running ${reason} scan...`);
  const startedAt = Date.now();
  const scan = await writeScanReport(configPath);
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Scan complete (${reason}): ${scan.repositoryCount} repositories in ${elapsedSeconds}s`);
  return scan;
}

function parseScanArgs(args) {
  let configPath = process.env.PROJECT_WATCHER_CONFIG || path.join(process.cwd(), 'project-watcher.config.json');
  let jsonOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--config' || arg === '-c') {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      configPath = value;
      index += 1;
    } else if (arg === '--json') {
      jsonOnly = true;
    } else {
      throw new Error(`Unknown scan option: ${arg}`);
    }
  }

  return {
    configPath: resolvePath(configPath, process.cwd()),
    jsonOnly
  };
}

function parseServeArgs(args) {
  let configPath = process.env.PROJECT_WATCHER_CONFIG || path.join(process.cwd(), 'project-watcher.config.json');
  let host = '127.0.0.1';
  let port = 7341;
  let open = false;
  let autoScan = true;
  let scanIntervalHours = DEFAULT_SERVE_SCAN_INTERVAL_HOURS;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--config' || arg === '-c') {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      configPath = value;
      index += 1;
    } else if (arg === '--host') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('--host requires a value');
      }
      host = value;
      index += 1;
    } else if (arg === '--port' || arg === '-p') {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error(`${arg} requires a port between 1 and 65535`);
      }
      port = value;
      index += 1;
    } else if (arg === '--open') {
      open = true;
    } else if (arg === '--no-auto-scan') {
      autoScan = false;
    } else if (arg === '--scan-interval-hours') {
      const value = Number.parseFloat(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('--scan-interval-hours requires a positive number');
      }
      scanIntervalHours = value;
      index += 1;
    } else {
      throw new Error(`Unknown serve option: ${arg}`);
    }
  }

  return {
    configPath: resolvePath(configPath, process.cwd()),
    host,
    port,
    open,
    autoScan,
    scanIntervalHours
  };
}

function parseDoctorArgs(args) {
  let configPath = process.env.PROJECT_WATCHER_CONFIG || path.join(process.cwd(), 'project-watcher.config.json');

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--config' || arg === '-c') {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      configPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown doctor option: ${arg}`);
    }
  }

  return {
    configPath: resolvePath(configPath, process.cwd())
  };
}

async function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}. Run "node ./src/cli.js init" first.`);
  }

  const raw = await fsp.readFile(configPath, 'utf8');
  let config;

  try {
    config = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
  }

  return { config, configPath };
}

function normalizeConfig(config, configPath) {
  const baseDir = path.dirname(configPath);
  const merged = {
    ...DEFAULT_CONFIG,
    ...config,
    excludeDirs: config.excludeDirs || DEFAULT_CONFIG.excludeDirs,
    excludeFiles: config.excludeFiles || DEFAULT_CONFIG.excludeFiles
  };

  if (!Array.isArray(merged.paths) || merged.paths.length === 0) {
    throw new Error('Config must contain a non-empty "paths" array');
  }

  return {
    ...merged,
    paths: merged.paths.map((item) => resolvePath(item, baseDir)),
    outputDir: merged.outputDir || DEFAULT_CONFIG.outputDir,
    maxDepth: Number.isInteger(merged.maxDepth) && merged.maxDepth >= 0 ? merged.maxDepth : DEFAULT_CONFIG.maxDepth,
    excludeDirs: new Set(merged.excludeDirs),
    excludeFiles: new Set(merged.excludeFiles),
    maxFileBytes: Number.isInteger(merged.maxFileBytes) && merged.maxFileBytes > 0 ? merged.maxFileBytes : DEFAULT_CONFIG.maxFileBytes,
    locTool: normalizeLocTool(merged.locTool),
    countDuplicateFiles: Boolean(merged.countDuplicateFiles),
    fileScope: normalizeFileScope(merged.fileScope),
    maxSnapshots: normalizeMaxSnapshots(merged.maxSnapshots),
    releaseReadiness: normalizeReleaseReadiness(merged.releaseReadiness)
  };
}

function normalizeLocTool(value) {
  const tool = typeof value === 'string' ? value : DEFAULT_CONFIG.locTool;
  const allowed = new Set(['auto', 'builtin', 'cloc', 'tokei', 'scc']);

  if (!allowed.has(tool)) {
    throw new Error('Config "locTool" must be one of: auto, builtin, cloc, tokei, scc');
  }

  return tool;
}

function normalizeFileScope(value) {
  const scope = typeof value === 'string' ? value : DEFAULT_CONFIG.fileScope;
  const allowed = new Set(['tracked', 'workingTree']);

  if (!allowed.has(scope)) {
    throw new Error('Config "fileScope" must be one of: tracked, workingTree');
  }

  return scope;
}

function normalizeMaxSnapshots(value) {
  if (value === undefined || value === null) {
    return DEFAULT_CONFIG.maxSnapshots;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Config "maxSnapshots" must be a non-negative integer');
  }

  return value;
}

function normalizeReleaseReadiness(value) {
  const defaults = DEFAULT_CONFIG.releaseReadiness;
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {
    watchAfterDays: normalizeIntegerSetting(input.watchAfterDays, defaults.watchAfterDays, 'releaseReadiness.watchAfterDays', 0),
    staleAfterDays: normalizeIntegerSetting(input.staleAfterDays, defaults.staleAfterDays, 'releaseReadiness.staleAfterDays', 0),
    releaseDueAfterCommits: normalizeIntegerSetting(input.releaseDueAfterCommits, defaults.releaseDueAfterCommits, 'releaseReadiness.releaseDueAfterCommits', 1)
  };

  if (normalized.staleAfterDays < normalized.watchAfterDays) {
    throw new Error('Config "releaseReadiness.staleAfterDays" must be greater than or equal to "releaseReadiness.watchAfterDays"');
  }

  return normalized;
}

function normalizeIntegerSetting(value, fallback, name, minimum) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`Config "${name}" must be an integer >= ${minimum}`);
  }

  return value;
}

async function discoverRepositories(config) {
  const repos = new Set();

  for (const root of config.paths) {
    if (!fs.existsSync(root)) {
      console.warn(`Skipping missing path: ${root}`);
      continue;
    }

    const stat = await fsp.stat(root);
    if (!stat.isDirectory()) {
      console.warn(`Skipping non-directory path: ${root}`);
      continue;
    }

    await walkForRepos(root, 0, config, repos);
  }

  return [...repos].sort();
}

async function walkForRepos(directory, depth, config, repos) {
  if (await isGitRepository(directory)) {
    repos.add(directory);
    return;
  }

  if (depth >= config.maxDepth) {
    return;
  }

  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (config.excludeDirs.has(entry.name)) {
      continue;
    }

    await walkForRepos(path.join(directory, entry.name), depth + 1, config, repos);
  }
}

async function isGitRepository(directory) {
  const gitPath = path.join(directory, '.git');
  try {
    const stat = await fsp.stat(gitPath);
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

async function analyzeRepository(repoPath, config) {
  const name = path.basename(repoPath);
  const remoteUrl = git(repoPath, ['remote', 'get-url', 'origin']);
  const branch = getBranch(repoPath);
  const status = git(repoPath, ['status', '--porcelain']);
  const lastCommit = getLastCommit(repoPath);
  const tags = getTags(repoPath);
  const contributors = getContributors(repoPath);
  const weekly = getWeeklyActivity(repoPath);
  const aiAgents = detectAiAgents(repoPath);
  const docs = await collectRepositoryDocs(repoPath, config);
  const changelog = await collectRepositoryChangelog(repoPath, config);
  const loc = await countRepositoryLines(repoPath, config);
  const fileTypes = await collectFileTypeStats(repoPath, config);
  const totalCommits = numberFromGit(repoPath, ['rev-list', '--count', 'HEAD']);
  const releaseWork = getReleaseWorkSinceLatestTag(repoPath, tags[0], totalCommits, config);

  return {
    name,
    path: repoPath,
    remoteUrl: remoteUrl || null,
    branch,
    isDirty: status.length > 0,
    dirtyFileCount: status ? status.split('\n').filter(Boolean).length : 0,
    commits: {
      total: totalCommits,
      last7Days: weekly.last7Days.commits,
      last30Days: numberFromGit(repoPath, ['rev-list', '--count', '--since=30 days ago', 'HEAD']),
      last90Days: numberFromGit(repoPath, ['rev-list', '--count', '--since=90 days ago', 'HEAD'])
    },
    contributors: {
      total: contributors.length,
      top: contributors.slice(0, 5),
      all: contributors
    },
    branches: {
      local: listFromGit(repoPath, ['branch', '--format=%(refname:short)']).length
    },
    releases: {
      tags: tags.length,
      semverTags: tags.filter((tag) => SEMVER_TAG.test(tag.name)).length,
      tagsLast30Days: countTagsSince(tags, 30),
      tagsLast90Days: countTagsSince(tags, 90),
      tagsLast365Days: countTagsSince(tags, 365),
      latestTag: tags[0] || null,
      daysSinceLatestTag: tags[0]?.date ? daysSince(tags[0].date) : null,
      commitsSinceLatestTag: releaseWork.commitsSinceLatestTag,
      filesChangedSinceLatestTag: releaseWork.filesChangedSinceLatestTag,
      unreleasedWork: releaseWork.unreleasedWork,
      recentTags: tags.slice(0, 10)
    },
    lastCommit,
    weekly,
    aiAgents,
    docs,
    changelog,
    loc,
    fileTypes
  };
}

function getBranch(repoPath) {
  const branch = git(repoPath, ['branch', '--show-current']);
  if (branch) {
    return branch;
  }

  const head = git(repoPath, ['rev-parse', '--short', 'HEAD']);
  return head ? `(detached ${head})` : null;
}

function getLastCommit(repoPath) {
  const output = git(repoPath, ['log', '-1', '--format=%cI%x09%h%x09%s']);
  if (!output) {
    return null;
  }

  const [date, hash, ...subjectParts] = output.split('\t');
  return {
    date,
    hash,
    subject: subjectParts.join('\t')
  };
}

function getTags(repoPath) {
  return listFromGit(repoPath, [
    'for-each-ref',
    '--sort=-creatordate',
    '--format=%(refname:short)%09%(creatordate:iso8601-strict)',
    'refs/tags'
  ]).map((line) => {
    const [name, ...dateParts] = line.split('\t');
    return {
      name,
      date: dateParts.join('\t') || null
    };
  }).sort(sortTagRows);
}

function getReleaseWorkSinceLatestTag(repoPath, latestTag, totalCommits, config) {
  const hasLatestTag = Boolean(latestTag?.name);
  const range = hasLatestTag ? `${latestTag.name}..HEAD` : 'HEAD';
  const commits = getRecentCommitsForRange(repoPath, range, UNRELEASED_COMMIT_LIMIT);
  const changedFiles = getChangedFilesForRange(repoPath, range, config);
  const authors = getAuthorsForRange(repoPath, range).slice(0, UNRELEASED_AUTHOR_LIMIT);
  const command = hasLatestTag
    ? `git log ${shellQuote(range)} --oneline`
    : 'git log --oneline';

  if (!latestTag?.name) {
    return {
      commitsSinceLatestTag: totalCommits,
      filesChangedSinceLatestTag: changedFiles.length,
      unreleasedWork: {
        baseTag: null,
        range,
        command,
        commits,
        changedFiles: changedFiles.slice(0, UNRELEASED_FILE_LIMIT),
        authors
      }
    };
  }

  return {
    commitsSinceLatestTag: numberFromGit(repoPath, ['rev-list', '--count', range]),
    filesChangedSinceLatestTag: changedFiles.length,
    unreleasedWork: {
      baseTag: latestTag.name,
      range,
      command,
      commits,
      changedFiles: changedFiles.slice(0, UNRELEASED_FILE_LIMIT),
      authors
    }
  };
}

function getRecentCommitsForRange(repoPath, range, limit) {
  return listFromGit(repoPath, [
    'log',
    range,
    `--max-count=${limit}`,
    '--format=%H%x09%h%x09%aI%x09%an%x09%s'
  ]).map((line) => {
    const [hash, shortHash, date, author, ...subjectParts] = line.split('\t');
    return {
      hash,
      shortHash,
      date,
      author,
      subject: subjectParts.join('\t')
    };
  }).filter((commit) => commit.hash && commit.subject);
}

function getChangedFilesForRange(repoPath, range, config) {
  const files = new Map();
  const output = gitRaw(repoPath, ['log', range, '--numstat', '--format=']);

  for (const line of output.split('\n')) {
    const parsed = parseNumstatLine(line);
    if (!parsed) {
      continue;
    }

    const relativePath = normalizeReportPath(parsed.path);
    if (!shouldIncludeRelativePath(relativePath, config)) {
      continue;
    }

    const current = files.get(relativePath) || {
      path: relativePath,
      additions: 0,
      deletions: 0,
      churn: 0,
      touches: 0
    };

    current.additions += parsed.additions;
    current.deletions += parsed.deletions;
    current.churn += parsed.additions + parsed.deletions;
    current.touches += 1;
    files.set(relativePath, current);
  }

  return [...files.values()].sort((a, b) => (
    b.churn - a.churn
    || b.touches - a.touches
    || a.path.localeCompare(b.path)
  ));
}

function getAuthorsForRange(repoPath, range) {
  return parseShortlog(listFromGit(repoPath, ['shortlog', '-sn', range]));
}

function getContributors(repoPath) {
  return parseShortlog(listFromGit(repoPath, ['shortlog', '-sn', '--all']));
}

function parseShortlog(lines) {
  return lines.map((line) => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) {
      return { name: line.trim(), commits: 0 };
    }

    return {
      name: match[2],
      commits: Number.parseInt(match[1], 10)
    };
  }).filter((item) => item.name);
}

function getWeeklyActivity(repoPath, weekCount = 8) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const currentWeekStart = startOfWeekUTC(now);
  const firstWeekStart = new Date(currentWeekStart.getTime() - (weekCount - 1) * 7 * 86400000);
  const weeks = [];
  const weeksByStart = new Map();

  for (let index = 0; index < weekCount; index += 1) {
    const date = new Date(firstWeekStart.getTime() + index * 7 * 86400000);
    const row = newActivityBucket(formatDateKey(date));
    weeks.push(row);
    weeksByStart.set(row.weekStart, row);
  }

  const last7Days = newActivityBucket(formatDateKey(sevenDaysAgo));
  const output = gitRaw(repoPath, [
    'log',
    `--since=${firstWeekStart.toISOString()}`,
    '--numstat',
    '--format=%x1e%H%x09%aI%x09%an'
  ]);

  for (const record of output.split('\x1e').filter((item) => item.trim().length > 0)) {
    const lines = record.trim().split('\n').filter(Boolean);
    const [hash, dateText, author] = (lines.shift() || '').split('\t');
    const commitDate = new Date(dateText);

    if (!hash || Number.isNaN(commitDate.getTime())) {
      continue;
    }

    const weekStart = formatDateKey(startOfWeekUTC(commitDate));
    const week = weeksByStart.get(weekStart);
    const inLast7Days = commitDate >= sevenDaysAgo;

    if (week) {
      addCommitToBucket(week, author);
    }

    if (inLast7Days) {
      addCommitToBucket(last7Days, author);
    }

    for (const line of lines) {
      const parsed = parseNumstatLine(line);
      if (!parsed) {
        continue;
      }

      if (week) {
        addNumstatToBucket(week, parsed);
      }

      if (inLast7Days) {
        addNumstatToBucket(last7Days, parsed);
      }
    }
  }

  return {
    last7Days: finalizeActivityBucket(last7Days),
    weeks: weeks.map(finalizeActivityBucket)
  };
}

function detectAiAgents(repoPath) {
  const trackedFiles = listTrackedFiles(repoPath);
  const agents = [];

  for (const definition of AI_AGENT_DEFINITIONS) {
    const matchedSignals = new Map();

    for (const relativePath of trackedFiles) {
      const normalizedPath = relativePath.replace(/\\/g, '/');
      for (const signal of definition.signals) {
        if (signal.pattern.test(normalizedPath)) {
          const current = matchedSignals.get(signal.label) || {
            label: signal.label,
            files: []
          };
          current.files.push(normalizedPath);
          matchedSignals.set(signal.label, current);
        }
      }
    }

    const signals = [...matchedSignals.values()].map((signal) => ({
      label: signal.label,
      files: signal.files.slice(0, 10),
      count: signal.files.length
    }));

    if (signals.length > 0) {
      agents.push({
        id: definition.id,
        name: definition.name,
        iconUrl: definition.iconUrl,
        homepage: definition.homepage,
        fallback: definition.fallback,
        signalCount: sum(signals, (signal) => signal.count),
        signals
      });
    }
  }

  return agents.sort((a, b) => b.signalCount - a.signalCount || a.name.localeCompare(b.name));
}

async function collectRepositoryDocs(repoPath, config) {
  const docsPath = path.join(repoPath, DOCS_DIR);
  let stat;

  try {
    stat = await fsp.stat(docsPath);
  } catch {
    return {
      root: DOCS_DIR,
      exists: false,
      markdownFiles: 0,
      files: []
    };
  }

  if (!stat.isDirectory()) {
    return {
      root: DOCS_DIR,
      exists: false,
      markdownFiles: 0,
      files: []
    };
  }

  const files = [];
  await walkDocsMarkdownFiles(docsPath, repoPath, config, files);
  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    root: DOCS_DIR,
    exists: true,
    markdownFiles: files.length,
    files
  };
}

async function collectRepositoryChangelog(repoPath, config) {
  const candidates = [];
  await walkChangelogFiles(repoPath, repoPath, config, candidates);
  candidates.sort(sortChangelogCandidates);

  const changelog = candidates[0];
  if (!changelog) {
    return null;
  }

  let stat;
  try {
    stat = await fsp.stat(path.join(repoPath, changelog.path));
  } catch {
    return null;
  }

  if (stat.size > config.maxFileBytes) {
    return null;
  }

  const content = await readLikelyText(path.join(repoPath, changelog.path));
  if (content === null) {
    return null;
  }

  const lineStats = countLines(content);

  return {
    kind: 'changelog',
    path: changelog.path,
    title: markdownTitle(content, changelog.path),
    bytes: stat.size,
    lines: lineStats.lines,
    modifiedAt: stat.mtime.toISOString()
  };
}

function sortChangelogCandidates(a, b) {
  const aPath = a.path.toLowerCase();
  const bPath = b.path.toLowerCase();
  const aDocs = aPath === 'docs/changelog.md' || aPath === 'docs/changelog.markdown';
  const bDocs = bPath === 'docs/changelog.md' || bPath === 'docs/changelog.markdown';

  if (aDocs !== bDocs) {
    return aDocs ? -1 : 1;
  }

  return a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path);
}

async function walkChangelogFiles(directory, repoPath, config, candidates) {
  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!config.excludeDirs.has(entry.name)) {
        await walkChangelogFiles(fullPath, repoPath, config, candidates);
      }
      continue;
    }

    if (!entry.isFile() || config.excludeFiles.has(entry.name)) {
      continue;
    }

    const name = entry.name.toLowerCase();
    if (name === 'changelog.md' || name === 'changelog.markdown') {
      candidates.push({ path: normalizeReportPath(path.relative(repoPath, fullPath)) });
    }
  }
}

async function walkDocsMarkdownFiles(directory, repoPath, config, files) {
  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!config.excludeDirs.has(entry.name)) {
        await walkDocsMarkdownFiles(fullPath, repoPath, config, files);
      }
      continue;
    }

    if (!entry.isFile() || config.excludeFiles.has(entry.name)) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!MARKDOWN_EXTENSIONS.has(extension)) {
      continue;
    }

    let stat;
    try {
      stat = await fsp.stat(fullPath);
    } catch {
      continue;
    }

    if (stat.size > config.maxFileBytes) {
      continue;
    }

    const content = await readLikelyText(fullPath);
    if (content === null) {
      continue;
    }

    const relativePath = normalizeReportPath(path.relative(repoPath, fullPath));
    const lineStats = countLines(content);

    files.push({
      path: relativePath,
      title: markdownTitle(content, relativePath),
      bytes: stat.size,
      lines: lineStats.lines,
      modifiedAt: stat.mtime.toISOString()
    });
  }
}

function markdownTitle(content, relativePath) {
  const heading = content.split(/\r?\n/).find((line) => /^#\s+/.test(line.trim()));
  if (heading) {
    return heading.replace(/^#\s+/, '').trim();
  }

  return path.basename(relativePath, path.extname(relativePath))
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function newActivityBucket(weekStart) {
  return {
    weekStart,
    commits: 0,
    additions: 0,
    deletions: 0,
    netLines: 0,
    filesChanged: 0,
    activeAuthors: 0,
    _files: new Set(),
    _authors: new Set()
  };
}

function addCommitToBucket(bucket, author) {
  bucket.commits += 1;
  if (author) {
    bucket._authors.add(author);
  }
}

function addNumstatToBucket(bucket, parsed) {
  bucket.additions += parsed.additions;
  bucket.deletions += parsed.deletions;
  bucket.netLines += parsed.additions - parsed.deletions;
  bucket._files.add(parsed.path);
}

function finalizeActivityBucket(bucket) {
  return {
    weekStart: bucket.weekStart,
    commits: bucket.commits,
    additions: bucket.additions,
    deletions: bucket.deletions,
    netLines: bucket.netLines,
    filesChanged: bucket._files.size,
    activeAuthors: bucket._authors.size
  };
}

function parseNumstatLine(line) {
  const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
  if (!match) {
    return null;
  }

  return {
    additions: match[1] === '-' ? 0 : Number.parseInt(match[1], 10),
    deletions: match[2] === '-' ? 0 : Number.parseInt(match[2], 10),
    path: match[3]
  };
}

async function countRepositoryLines(repoPath, config) {
  const external = countRepositoryLinesWithTool(repoPath, config);
  if (external) {
    return external;
  }

  return countRepositoryLinesBuiltin(repoPath, config);
}

function countRepositoryLinesWithTool(repoPath, config) {
  const tools = config.locTool === 'auto' ? ['tokei', 'scc', 'cloc'] : [config.locTool];

  for (const tool of tools) {
    if (tool === 'builtin') {
      continue;
    }

    if (config.fileScope === 'tracked' && tool !== 'cloc') {
      continue;
    }

    if (!commandExists(tool)) {
      continue;
    }

    const result = tool === 'cloc'
      ? countRepositoryLinesWithCloc(repoPath, config)
      : tool === 'tokei'
        ? countRepositoryLinesWithTokei(repoPath, config)
        : countRepositoryLinesWithScc(repoPath, config);

    if (result) {
      return result;
    }
  }

  return null;
}

function countRepositoryLinesWithCloc(repoPath, config) {
  const args = [
    '--json',
    '--quiet',
    '--timeout=0',
    `--exclude-dir=${[...config.excludeDirs].join(',')}`
  ];

  if (config.countDuplicateFiles) {
    args.push('--skip-uniqueness');
  }
  const filePattern = regexUnion([...config.excludeFiles]);

  if (filePattern) {
    args.push(`--not-match-f=${filePattern}`);
  }

  if (config.fileScope === 'tracked') {
    args.push('--vcs=git');
  } else {
    args.push(repoPath);
  }

  const result = spawnSync('cloc', args, {
    cwd: config.fileScope === 'tracked' ? repoPath : process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return locFromClocJson(parsed, {
      tool: 'cloc',
      duplicatePolicy: config.countDuplicateFiles ? 'counted' : 'deduplicated',
      fileScope: config.fileScope
    });
  } catch {
    return null;
  }
}

function countRepositoryLinesWithTokei(repoPath, config) {
  const args = ['--output', 'json'];

  for (const dir of config.excludeDirs) {
    args.push('--exclude', dir);
  }

  for (const file of config.excludeFiles) {
    args.push('--exclude', file);
  }

  args.push(repoPath);

  const result = spawnSync('tokei', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return null;
  }

  try {
    return locFromTokeiJson(JSON.parse(result.stdout));
  } catch {
    return null;
  }
}

function countRepositoryLinesWithScc(repoPath, config) {
  const args = ['--format', 'json', '--no-cocomo'];

  for (const dir of config.excludeDirs) {
    args.push('--exclude-dir', dir);
  }

  for (const file of config.excludeFiles) {
    args.push('--exclude-file', file);
  }

  args.push(repoPath);

  const result = spawnSync('scc', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return null;
  }

  try {
    return locFromSccJson(JSON.parse(result.stdout));
  } catch {
    return null;
  }
}

function locFromClocJson(parsed, options) {
  const sumRow = parsed.SUM || {};
  const byLanguage = [];

  for (const [language, stats] of Object.entries(parsed)) {
    if (language === 'header' || language === 'SUM') {
      continue;
    }

    byLanguage.push(locLanguageRow({
      language,
      files: stats.nFiles,
      blankLines: stats.blank,
      commentLines: stats.comment,
      codeLines: stats.code
    }));
  }

  return {
    tool: options.tool,
    duplicatePolicy: options.duplicatePolicy,
    fileScope: options.fileScope,
    files: numberOrZero(sumRow.nFiles),
    lines: numberOrZero(sumRow.blank) + numberOrZero(sumRow.comment) + numberOrZero(sumRow.code),
    blankLines: numberOrZero(sumRow.blank),
    commentLines: numberOrZero(sumRow.comment),
    codeLines: numberOrZero(sumRow.code),
    bytes: 0,
    byLanguage: byLanguage.sort(sortLocLanguages)
  };
}

function locFromTokeiJson(parsed) {
  const byLanguage = [];
  let files = 0;
  let lines = 0;
  let blankLines = 0;
  let commentLines = 0;
  let codeLines = 0;

  for (const [language, stats] of Object.entries(parsed)) {
    if (language === 'Total') {
      continue;
    }

    const row = locLanguageRow({
      language,
      files: Array.isArray(stats.reports) ? stats.reports.length : stats.files,
      blankLines: stats.blanks,
      commentLines: stats.comments,
      codeLines: stats.code
    });

    files += row.files;
    lines += row.lines;
    blankLines += row.blankLines;
    commentLines += row.commentLines;
    codeLines += row.codeLines;
    byLanguage.push(row);
  }

  return {
    tool: 'tokei',
    duplicatePolicy: 'tool-default',
    fileScope: 'workingTree',
    files,
    lines,
    blankLines,
    commentLines,
    codeLines,
    bytes: 0,
    byLanguage: byLanguage.sort(sortLocLanguages)
  };
}

function locFromSccJson(parsed) {
  const rows = Array.isArray(parsed) ? parsed : [];
  const byLanguage = [];
  let files = 0;
  let lines = 0;
  let blankLines = 0;
  let commentLines = 0;
  let codeLines = 0;

  for (const stats of rows) {
    const row = locLanguageRow({
      language: stats.Name,
      files: stats.Count,
      blankLines: stats.Blank,
      commentLines: stats.Comment,
      codeLines: stats.Code
    });

    files += row.files;
    lines += row.lines;
    blankLines += row.blankLines;
    commentLines += row.commentLines;
    codeLines += row.codeLines;
    byLanguage.push(row);
  }

  return {
    tool: 'scc',
    duplicatePolicy: 'tool-default',
    fileScope: 'workingTree',
    files,
    lines,
    blankLines,
    commentLines,
    codeLines,
    bytes: 0,
    byLanguage: byLanguage.sort(sortLocLanguages)
  };
}

function locLanguageRow({ language, files, blankLines, commentLines, codeLines }) {
  const normalizedBlankLines = numberOrZero(blankLines);
  const normalizedCommentLines = numberOrZero(commentLines);
  const normalizedCodeLines = numberOrZero(codeLines);

  return {
    language: language || 'Other',
    files: numberOrZero(files),
    lines: normalizedBlankLines + normalizedCommentLines + normalizedCodeLines,
    blankLines: normalizedBlankLines,
    commentLines: normalizedCommentLines,
    codeLines: normalizedCodeLines,
    bytes: 0
  };
}

async function countRepositoryLinesBuiltin(repoPath, config) {
  const byLanguage = new Map();
  const totals = {
    tool: 'builtin',
    duplicatePolicy: 'counted',
    fileScope: config.fileScope,
    files: 0,
    lines: 0,
    blankLines: 0,
    commentLines: 0,
    codeLines: 0,
    bytes: 0
  };

  await forEachRepositoryFile(repoPath, config, async (filePath, stat) => {
    const fileName = path.basename(filePath);
    const extension = path.extname(fileName);

    if (BINARY_EXTENSIONS.has(extension.toLowerCase())) {
      return;
    }

    if (stat.size > config.maxFileBytes) {
      return;
    }

    const content = await readLikelyText(filePath);
    if (content === null) {
      return;
    }

    const lineStats = countLines(content);
    const language = detectLanguage(fileName, extension);

    totals.files += 1;
    totals.lines += lineStats.lines;
    totals.blankLines += lineStats.blankLines;
    totals.codeLines += lineStats.codeLines;
    totals.bytes += stat.size;

    const current = byLanguage.get(language) || {
      language,
      files: 0,
      lines: 0,
      blankLines: 0,
      commentLines: 0,
      codeLines: 0,
      bytes: 0
    };

    current.files += 1;
    current.lines += lineStats.lines;
    current.blankLines += lineStats.blankLines;
    current.codeLines += lineStats.codeLines;
    current.bytes += stat.size;
    byLanguage.set(language, current);
  });

  return {
    ...totals,
    byLanguage: [...byLanguage.values()].sort(sortLocLanguages)
  };
}

async function collectFileTypeStats(repoPath, config) {
  const byType = new Map();
  const totals = {
    files: 0,
    bytes: 0,
    textFiles: 0,
    binaryFiles: 0,
    oversizedFiles: 0,
    textLines: 0,
    nonEmptyTextLines: 0
  };

  await forEachRepositoryFile(repoPath, config, async (filePath, stat) => {
    const fileName = path.basename(filePath);
    const extension = path.extname(fileName).toLowerCase();
    const type = fileTypeFor(fileName);
    const row = byType.get(type) || {
      type,
      files: 0,
      bytes: 0,
      textFiles: 0,
      binaryFiles: 0,
      oversizedFiles: 0,
      textLines: 0,
      nonEmptyTextLines: 0
    };

    totals.files += 1;
    totals.bytes += stat.size;
    row.files += 1;
    row.bytes += stat.size;

    if (stat.size > config.maxFileBytes) {
      totals.oversizedFiles += 1;
      row.oversizedFiles += 1;
      byType.set(type, row);
      return;
    }

    if (BINARY_EXTENSIONS.has(extension)) {
      totals.binaryFiles += 1;
      row.binaryFiles += 1;
      byType.set(type, row);
      return;
    }

    const content = await readLikelyText(filePath);
    if (content === null) {
      totals.binaryFiles += 1;
      row.binaryFiles += 1;
      byType.set(type, row);
      return;
    }

    const lineStats = countLines(content);
    totals.textFiles += 1;
    totals.textLines += lineStats.lines;
    totals.nonEmptyTextLines += lineStats.codeLines;
    row.textFiles += 1;
    row.textLines += lineStats.lines;
    row.nonEmptyTextLines += lineStats.codeLines;
    byType.set(type, row);
  });

  return {
    ...totals,
    byType: [...byType.values()].sort(sortFileTypes)
  };
}

async function forEachRepositoryFile(repoPath, config, onFile) {
  if (config.fileScope === 'tracked') {
    const relativePaths = listTrackedFiles(repoPath);

    for (const relativePath of relativePaths) {
      if (!shouldIncludeRelativePath(relativePath, config)) {
        continue;
      }

      const filePath = path.join(repoPath, relativePath);
      let stat;

      try {
        stat = await fsp.stat(filePath);
      } catch {
        continue;
      }

      if (stat.isFile()) {
        await onFile(filePath, stat);
      }
    }

    return;
  }

  await walkFiles(repoPath, config, onFile);
}

async function walkFiles(directory, config, onFile) {
  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!config.excludeDirs.has(entry.name)) {
        await walkFiles(fullPath, config, onFile);
      }
      continue;
    }

    if (!entry.isFile() || config.excludeFiles.has(entry.name)) {
      continue;
    }

    let stat;
    try {
      stat = await fsp.stat(fullPath);
    } catch {
      continue;
    }

    await onFile(fullPath, stat);
  }
}

async function readLikelyText(filePath) {
  let buffer;
  try {
    buffer = await fsp.readFile(filePath);
  } catch {
    return null;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  if (sample.includes(0)) {
    return null;
  }

  return buffer.toString('utf8');
}

function countLines(content) {
  if (content.length === 0) {
    return { lines: 0, blankLines: 0, codeLines: 0 };
  }

  const normalized = content.endsWith('\n') ? content.slice(0, -1) : content;
  const lines = normalized.length === 0 ? [] : normalized.split(/\r?\n/);
  const blankLines = lines.filter((line) => line.trim().length === 0).length;

  return {
    lines: lines.length,
    blankLines,
    codeLines: lines.length - blankLines
  };
}

function detectLanguage(fileName, extension) {
  if (LANGUAGE_BY_FILENAME.has(fileName)) {
    return LANGUAGE_BY_FILENAME.get(fileName);
  }

  return LANGUAGE_BY_EXTENSION.get(extension.toLowerCase()) || 'Other';
}

function buildReport({ generatedAt, configPath, roots, repositories, config }) {
  const totals = {
    repositories: repositories.length,
    dirtyRepositories: repositories.filter((repo) => repo.isDirty).length,
    commits: sum(repositories, (repo) => repo.commits.total),
    commitsLast7Days: sum(repositories, (repo) => repo.commits.last7Days),
    commitsLast30Days: sum(repositories, (repo) => repo.commits.last30Days),
    commitsLast90Days: sum(repositories, (repo) => repo.commits.last90Days),
    tags: sum(repositories, (repo) => repo.releases.tags),
    semverTags: sum(repositories, (repo) => repo.releases.semverTags),
    docsRepositories: repositories.filter((repo) => (repo.docs?.markdownFiles || 0) > 0).length,
    docsMarkdownFiles: sum(repositories, (repo) => repo.docs?.markdownFiles || 0),
    files: sum(repositories, (repo) => repo.loc.files),
    physicalFiles: sum(repositories, (repo) => repo.fileTypes.files),
    physicalBytes: sum(repositories, (repo) => repo.fileTypes.bytes),
    textFiles: sum(repositories, (repo) => repo.fileTypes.textFiles),
    binaryFiles: sum(repositories, (repo) => repo.fileTypes.binaryFiles),
    oversizedFiles: sum(repositories, (repo) => repo.fileTypes.oversizedFiles),
    textLines: sum(repositories, (repo) => repo.fileTypes.textLines),
    lines: sum(repositories, (repo) => repo.loc.lines),
    blankLines: sum(repositories, (repo) => repo.loc.blankLines),
    commentLines: sum(repositories, (repo) => repo.loc.commentLines || 0),
    codeLines: sum(repositories, (repo) => repo.loc.codeLines)
  };
  const releaseReadiness = aggregateReleaseReadiness(repositories, config.releaseReadiness);

  return {
    generatedAt,
    configPath,
    roots,
    totals,
    weekly: aggregateWeeklyActivity(repositories),
    releases: aggregateReleases(repositories),
    releaseReadiness,
    contributors: aggregateContributors(repositories),
    aiAgents: aggregateAiAgents(repositories),
    languages: aggregateLanguages(repositories),
    fileTypes: aggregateFileTypes(repositories),
    repositories
  };
}

function aggregateLanguages(repositories) {
  const languages = new Map();

  for (const repo of repositories) {
    for (const item of repo.loc.byLanguage) {
      const current = languages.get(item.language) || {
        language: item.language,
        files: 0,
        lines: 0,
        blankLines: 0,
        commentLines: 0,
        codeLines: 0,
        bytes: 0
      };

      current.files += item.files;
      current.lines += item.lines;
      current.blankLines += item.blankLines;
      current.commentLines += item.commentLines || 0;
      current.codeLines += item.codeLines;
      current.bytes += item.bytes;
      languages.set(item.language, current);
    }
  }

  return [...languages.values()].sort(sortLocLanguages);
}

function aggregateWeeklyActivity(repositories) {
  const weeksByStart = new Map();
  const totals = {
    commits: 0,
    additions: 0,
    deletions: 0,
    netLines: 0,
    filesChanged: 0,
    activeRepos: 0,
    activeAuthors: 0
  };

  for (const repo of repositories) {
    const last7Days = repo.weekly?.last7Days || {};
    totals.commits += last7Days.commits || 0;
    totals.additions += last7Days.additions || 0;
    totals.deletions += last7Days.deletions || 0;
    totals.netLines += last7Days.netLines || 0;
    totals.filesChanged += last7Days.filesChanged || 0;
    totals.activeAuthors += last7Days.activeAuthors || 0;

    if ((last7Days.commits || 0) > 0) {
      totals.activeRepos += 1;
    }

    for (const week of repo.weekly?.weeks || []) {
      const current = weeksByStart.get(week.weekStart) || {
        weekStart: week.weekStart,
        commits: 0,
        additions: 0,
        deletions: 0,
        netLines: 0,
        filesChanged: 0,
        activeAuthors: 0
      };

      current.commits += week.commits;
      current.additions += week.additions;
      current.deletions += week.deletions;
      current.netLines += week.netLines;
      current.filesChanged += week.filesChanged;
      current.activeAuthors += week.activeAuthors;
      weeksByStart.set(week.weekStart, current);
    }
  }

  return {
    windowDays: 7,
    trendWeeks: weeksByStart.size,
    totals,
    weeks: [...weeksByStart.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    topRepositories: repositories
      .map((repo) => ({
        name: repo.name,
        path: repo.path,
        detailPath: repo.detailPath,
        commits: repo.weekly?.last7Days?.commits || 0,
        additions: repo.weekly?.last7Days?.additions || 0,
        deletions: repo.weekly?.last7Days?.deletions || 0,
        netLines: repo.weekly?.last7Days?.netLines || 0,
        filesChanged: repo.weekly?.last7Days?.filesChanged || 0,
        activeAuthors: repo.weekly?.last7Days?.activeAuthors || 0
      }))
      .filter((repo) => repo.commits > 0 || repo.additions > 0 || repo.deletions > 0)
      .sort((a, b) => b.commits - a.commits || (b.additions + b.deletions) - (a.additions + a.deletions))
  };
}

function aggregateReleases(repositories) {
  const latest = [];
  const perRepository = [];

  for (const repo of repositories) {
    const releases = repo.releases || {};

    perRepository.push({
      name: repo.name,
      path: repo.path,
      detailPath: repo.detailPath,
      tags: releases.tags || 0,
      semverTags: releases.semverTags || 0,
      tagsLast30Days: releases.tagsLast30Days || 0,
      tagsLast90Days: releases.tagsLast90Days || 0,
      tagsLast365Days: releases.tagsLast365Days || 0,
      latestTag: releases.latestTag || null,
      daysSinceLatestTag: releases.daysSinceLatestTag ?? null,
      commitsSinceLatestTag: releases.commitsSinceLatestTag ?? 0,
      filesChangedSinceLatestTag: releases.filesChangedSinceLatestTag ?? 0,
      unreleasedWork: releases.unreleasedWork || null,
      changelog: repo.changelog || null
    });

    for (const tag of releases.recentTags || []) {
      latest.push({
        repo: repo.name,
        path: repo.path,
        detailPath: repo.detailPath,
        changelog: repo.changelog || null,
        name: tag.name,
        date: tag.date,
        semver: SEMVER_TAG.test(tag.name)
      });
    }
  }

  latest.sort(sortReleaseRows);
  perRepository.sort((a, b) => {
    const aTime = Date.parse(a.latestTag?.date || '');
    const bTime = Date.parse(b.latestTag?.date || '');
    const aRank = Number.isFinite(aTime) ? aTime : 0;
    const bRank = Number.isFinite(bTime) ? bTime : 0;
    return bRank - aRank || b.tags - a.tags || a.name.localeCompare(b.name);
  });

  return {
    totals: {
      tags: sum(repositories, (repo) => repo.releases.tags),
      semverTags: sum(repositories, (repo) => repo.releases.semverTags),
      tagsLast30Days: sum(repositories, (repo) => repo.releases.tagsLast30Days || 0),
      tagsLast90Days: sum(repositories, (repo) => repo.releases.tagsLast90Days || 0),
      tagsLast365Days: sum(repositories, (repo) => repo.releases.tagsLast365Days || 0),
      reposWithTags: repositories.filter((repo) => (repo.releases.tags || 0) > 0).length,
      reposWithoutTags: repositories.filter((repo) => (repo.releases.tags || 0) === 0).length
    },
    latest: latest.slice(0, 50),
    repositories: perRepository
  };
}

function aggregateReleaseReadiness(repositories, thresholds) {
  const rows = repositories.map((repo) => releaseReadinessRow(repo, thresholds));

  for (const row of rows) {
    const repo = repositories.find((item) => item.path === row.path);
    if (repo) {
      repo.releaseReadiness = row;
    }
  }

  rows.sort(sortReleaseReadinessRows);

  return {
    thresholds,
    totals: {
      fresh: rows.filter((row) => row.status === 'fresh').length,
      watch: rows.filter((row) => row.status === 'watch').length,
      releaseDue: rows.filter((row) => row.status === 'release due').length,
      stale: rows.filter((row) => row.status === 'stale').length,
      needsAttention: rows.filter((row) => row.status !== 'fresh').length,
      missingChangelog: rows.filter((row) => !row.changelogFound).length
    },
    repositories: rows
  };
}

function releaseReadinessRow(repo, thresholds) {
  const latestTag = repo.releases?.latestTag || null;
  const days = latestTag?.date ? daysSince(latestTag.date) : null;
  const commitsSinceLatestTag = repo.releases?.commitsSinceLatestTag ?? repo.commits?.total ?? 0;
  const filesChangedSinceLatestTag = repo.releases?.filesChangedSinceLatestTag ?? 0;
  const unreleasedWork = repo.releases?.unreleasedWork || null;
  const changelogFound = Boolean(repo.changelog?.detailPath);
  const reasons = [];

  if (!latestTag) {
    reasons.push('no local tags');
  } else if (days !== null) {
    reasons.push(`${formatNumber(days)}d since latest tag`);
  }

  if (commitsSinceLatestTag > 0) {
    reasons.push(`${formatNumber(commitsSinceLatestTag)} commits since tag`);
  }

  if (filesChangedSinceLatestTag > 0) {
    reasons.push(`${formatNumber(filesChangedSinceLatestTag)} files changed since tag`);
  }

  reasons.push(changelogFound ? 'changelog found' : 'changelog missing');

  if (repo.isDirty) {
    reasons.push(`${formatNumber(repo.dirtyFileCount)} dirty files`);
  }

  const status = releaseReadinessStatus({
    latestTag,
    days,
    commitsSinceLatestTag,
    filesChangedSinceLatestTag,
    unreleasedWork,
    changelogFound,
    isDirty: repo.isDirty
  }, thresholds);

  return {
    name: repo.name,
    path: repo.path,
    detailPath: repo.detailPath,
    status,
    latestTag,
    daysSinceLatestTag: days,
    commitsSinceLatestTag,
    filesChangedSinceLatestTag,
    unreleasedWork,
    changelogFound,
    changelog: repo.changelog || null,
    isDirty: repo.isDirty,
    dirtyFileCount: repo.dirtyFileCount || 0,
    reasons
  };
}

function releaseReadinessStatus(row, thresholds) {
  if (!row.latestTag || row.days >= thresholds.staleAfterDays) {
    return 'stale';
  }

  if (row.commitsSinceLatestTag >= thresholds.releaseDueAfterCommits) {
    return 'release due';
  }

  if (
    row.days >= thresholds.watchAfterDays
    || row.commitsSinceLatestTag > 0
    || row.filesChangedSinceLatestTag > 0
    || !row.changelogFound
    || row.isDirty
  ) {
    return 'watch';
  }

  return 'fresh';
}

function sortReleaseReadinessRows(a, b) {
  return releaseReadinessRank(b) - releaseReadinessRank(a)
    || releaseReadinessAgeRank(b) - releaseReadinessAgeRank(a)
    || b.commitsSinceLatestTag - a.commitsSinceLatestTag
    || b.filesChangedSinceLatestTag - a.filesChangedSinceLatestTag
    || Number(b.isDirty) - Number(a.isDirty)
    || a.name.localeCompare(b.name);
}

function releaseReadinessRank(row) {
  return RELEASE_READINESS_RANK.get(row.status) || 0;
}

function releaseReadinessAgeRank(row) {
  return row.daysSinceLatestTag === null ? Number.MAX_SAFE_INTEGER : row.daysSinceLatestTag;
}

function aggregateContributors(repositories) {
  const contributorsByName = new Map();

  for (const repo of repositories) {
    for (const contributor of repo.contributors?.all || repo.contributors?.top || []) {
      const name = contributor.name || 'Unknown';
      const current = contributorsByName.get(name) || {
        name,
        commits: 0,
        repoCount: 0,
        repositories: []
      };

      current.commits += contributor.commits || 0;
      current.repoCount += 1;
      current.repositories.push({
        name: repo.name,
        path: repo.path,
        detailPath: repo.detailPath,
        commits: contributor.commits || 0
      });
      contributorsByName.set(name, current);
    }
  }

  const contributors = [...contributorsByName.values()]
    .map((contributor) => ({
      ...contributor,
      repositories: contributor.repositories.sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name))
    }))
    .sort((a, b) => b.commits - a.commits || b.repoCount - a.repoCount || a.name.localeCompare(b.name));

  return {
    totals: {
      uniqueContributors: contributors.length,
      topContributor: contributors[0] || null,
      multiRepoContributors: contributors.filter((contributor) => contributor.repoCount > 1).length
    },
    contributors
  };
}

function aggregateAiAgents(repositories) {
  const agentsById = new Map();

  for (const definition of AI_AGENT_DEFINITIONS) {
    agentsById.set(definition.id, {
      id: definition.id,
      name: definition.name,
      iconUrl: definition.iconUrl,
      homepage: definition.homepage,
      fallback: definition.fallback,
      repoCount: 0,
      signalCount: 0,
      repositories: []
    });
  }

  for (const repo of repositories) {
    for (const agent of repo.aiAgents || []) {
      const current = agentsById.get(agent.id);
      if (!current) {
        continue;
      }

      current.repoCount += 1;
      current.signalCount += agent.signalCount;
      current.repositories.push({
        name: repo.name,
        path: repo.path,
        signalCount: agent.signalCount,
        signals: agent.signals
      });
    }
  }

  const agents = [...agentsById.values()]
    .filter((agent) => agent.repoCount > 0)
    .sort((a, b) => b.repoCount - a.repoCount || b.signalCount - a.signalCount || a.name.localeCompare(b.name));

  return {
    totals: {
      agentsDetected: agents.length,
      reposWithAgents: repositories.filter((repo) => (repo.aiAgents || []).length > 0).length,
      signals: sum(agents, (agent) => agent.signalCount),
      topAgent: agents[0] || null
    },
    agents
  };
}

function aggregateFileTypes(repositories) {
  const fileTypes = new Map();

  for (const repo of repositories) {
    for (const item of repo.fileTypes.byType) {
      const current = fileTypes.get(item.type) || {
        type: item.type,
        files: 0,
        bytes: 0,
        textFiles: 0,
        binaryFiles: 0,
        oversizedFiles: 0,
        textLines: 0,
        nonEmptyTextLines: 0
      };

      current.files += item.files;
      current.bytes += item.bytes;
      current.textFiles += item.textFiles;
      current.binaryFiles += item.binaryFiles;
      current.oversizedFiles += item.oversizedFiles;
      current.textLines += item.textLines;
      current.nonEmptyTextLines += item.nonEmptyTextLines;
      fileTypes.set(item.type, current);
    }
  }

  return [...fileTypes.values()].sort(sortFileTypes);
}

function renderMarkdown(report) {
  const lines = [];

  lines.push('# Project Watcher Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Config: ${report.configPath}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Repositories: ${formatNumber(report.totals.repositories)}`);
  lines.push(`- Dirty repositories: ${formatNumber(report.totals.dirtyRepositories)}`);
  lines.push(`- Lines of code: ${formatNumber(report.totals.codeLines)}`);
  lines.push(`- Comment lines: ${formatNumber(report.totals.commentLines || 0)}`);
  lines.push(`- Files counted: ${formatNumber(report.totals.files)}`);
  lines.push(`- Physical files after excludes: ${formatNumber(report.totals.physicalFiles || 0)}`);
  lines.push(`- Physical bytes after excludes: ${formatBytes(report.totals.physicalBytes || 0)}`);
  lines.push(`- Commits: ${formatNumber(report.totals.commits)}`);
  lines.push(`- Commits last 7 days: ${formatNumber(report.totals.commitsLast7Days || 0)}`);
  lines.push(`- Commits last 30 days: ${formatNumber(report.totals.commitsLast30Days)}`);
  lines.push(`- Tags/releases: ${formatNumber(report.totals.tags)}`);
  lines.push(`- SemVer tags: ${formatNumber(report.totals.semverTags)}`);
  lines.push(`- Repos with docs: ${formatNumber(report.totals.docsRepositories || 0)}`);
  lines.push(`- Markdown docs: ${formatNumber(report.totals.docsMarkdownFiles || 0)}`);
  lines.push(`- Releases last 90 days: ${formatNumber(report.releases.totals.tagsLast90Days)}`);
  lines.push(`- Repos without tags: ${formatNumber(report.releases.totals.reposWithoutTags)}`);
  lines.push(`- Release readiness needs attention: ${formatNumber(report.releaseReadiness.totals.needsAttention)}`);
  lines.push(`- Release due: ${formatNumber(report.releaseReadiness.totals.releaseDue)}`);
  lines.push(`- Stale releases: ${formatNumber(report.releaseReadiness.totals.stale)}`);
  lines.push(`- Unique contributors: ${formatNumber(report.contributors.totals.uniqueContributors)}`);
  lines.push(`- Multi-repo contributors: ${formatNumber(report.contributors.totals.multiRepoContributors)}`);
  lines.push(`- AI agents detected: ${formatNumber(report.aiAgents.totals.agentsDetected)}`);
  lines.push(`- Repos with AI agent files: ${formatNumber(report.aiAgents.totals.reposWithAgents)}`);
  lines.push(`- Most used AI agent: ${markdownCell(report.aiAgents.totals.topAgent?.name || 'none')}`);
  lines.push(`- LOC tools: ${markdownCell([...new Set(report.repositories.map((repo) => repo.loc.tool || 'unknown'))].join(', '))}`);
  lines.push(`- Duplicate policy: ${markdownCell([...new Set(report.repositories.map((repo) => repo.loc.duplicatePolicy || 'unknown'))].join(', '))}`);
  lines.push(`- File scope: ${markdownCell([...new Set(report.repositories.map((repo) => repo.loc.fileScope || 'unknown'))].join(', '))}`);
  lines.push('');
  lines.push('## AI Agent Footprint');
  lines.push('');

  if (report.aiAgents.agents.length > 0) {
    lines.push('| Agent | Repos | Signals | Repositories |');
    lines.push('| --- | ---: | ---: | --- |');
    for (const agent of report.aiAgents.agents) {
      lines.push(`| ${markdownCell(agent.name)} | ${formatNumber(agent.repoCount)} | ${formatNumber(agent.signalCount)} | ${markdownCell(agent.repositories.map((repo) => repo.name).join(', '))} |`);
    }
    lines.push('');
  } else {
    lines.push('No tracked AI agent instruction/config files detected.');
    lines.push('');
  }

  lines.push('## Release Activity');
  lines.push('');
  lines.push(`- Tags last 30 days: ${formatNumber(report.releases.totals.tagsLast30Days)}`);
  lines.push(`- Tags last 90 days: ${formatNumber(report.releases.totals.tagsLast90Days)}`);
  lines.push(`- Tags last 365 days: ${formatNumber(report.releases.totals.tagsLast365Days)}`);
  lines.push('');

  if (report.releases.latest.length > 0) {
    lines.push('| Repo | Tag | Date | SemVer |');
    lines.push('| --- | --- | --- | --- |');
    for (const release of report.releases.latest.slice(0, 15)) {
      lines.push(`| ${markdownCell(release.repo)} | ${markdownCell(release.name)} | ${markdownCell(release.date || '')} | ${release.semver ? 'yes' : 'no'} |`);
    }
    lines.push('');
  } else {
    lines.push('No local tags found.');
    lines.push('');
  }

  lines.push('## Release Readiness');
  lines.push('');
  lines.push(`- Watch after: ${formatNumber(report.releaseReadiness.thresholds.watchAfterDays)} days`);
  lines.push(`- Stale after: ${formatNumber(report.releaseReadiness.thresholds.staleAfterDays)} days`);
  lines.push(`- Release due after: ${formatNumber(report.releaseReadiness.thresholds.releaseDueAfterCommits)} commits since latest tag`);
  lines.push('');

  if (report.releaseReadiness.repositories.length > 0) {
    lines.push('| Repo | Status | Latest tag | Days | Commits since tag | Files changed | Recent commits | Changelog | Dirty |');
    lines.push('| --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: |');
    for (const repo of report.releaseReadiness.repositories.slice(0, 15)) {
      const recentCommits = (repo.unreleasedWork?.commits || [])
        .slice(0, 3)
        .map((commit) => `${commit.shortHash} ${commit.subject}`)
        .join('; ');
      lines.push(`| ${markdownCell(repo.name)} | ${markdownCell(repo.status)} | ${markdownCell(repo.latestTag?.name || 'none')} | ${repo.daysSinceLatestTag ?? ''} | ${formatNumber(repo.commitsSinceLatestTag)} | ${formatNumber(repo.filesChangedSinceLatestTag)} | ${markdownCell(recentCommits)} | ${repo.changelogFound ? 'yes' : 'no'} | ${formatNumber(repo.dirtyFileCount)} |`);
    }
    lines.push('');
  }

  lines.push('## Contributors');
  lines.push('');

  if (report.contributors.contributors.length > 0) {
    lines.push('| Contributor | Commits | Repos | Top repositories |');
    lines.push('| --- | ---: | ---: | --- |');
    for (const contributor of report.contributors.contributors.slice(0, 15)) {
      const repos = contributor.repositories.slice(0, 5).map((repo) => `${repo.name} (${formatNumber(repo.commits)})`).join(', ');
      lines.push(`| ${markdownCell(contributor.name)} | ${formatNumber(contributor.commits)} | ${formatNumber(contributor.repoCount)} | ${markdownCell(repos)} |`);
    }
    lines.push('');
  } else {
    lines.push('No contributors found.');
    lines.push('');
  }

  lines.push('## Weekly Activity');
  lines.push('');
  lines.push(`- Commits: ${formatNumber(report.weekly.totals.commits)}`);
  lines.push(`- Active repositories: ${formatNumber(report.weekly.totals.activeRepos)}`);
  lines.push(`- Files changed: ${formatNumber(report.weekly.totals.filesChanged)}`);
  lines.push(`- Additions: ${formatNumber(report.weekly.totals.additions)}`);
  lines.push(`- Deletions: ${formatNumber(report.weekly.totals.deletions)}`);
  lines.push(`- Net lines: ${formatSignedNumber(report.weekly.totals.netLines)}`);
  lines.push('');

  if (report.weekly.topRepositories.length > 0) {
    lines.push('| Repo | Commits | Additions | Deletions | Net | Files changed |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const repo of report.weekly.topRepositories.slice(0, 15)) {
      lines.push(`| ${markdownCell(repo.name)} | ${formatNumber(repo.commits)} | ${formatNumber(repo.additions)} | ${formatNumber(repo.deletions)} | ${formatSignedNumber(repo.netLines)} | ${formatNumber(repo.filesChanged)} |`);
    }
    lines.push('');
  }

  lines.push('## Since Previous Scan');
  lines.push('');

  if (report.delta?.available) {
    lines.push(`Compared with: ${report.delta.previousGeneratedAt}`);
    lines.push('');
    lines.push(`- LOC: ${formatSignedNumber(report.delta.totals.codeLines.delta)}`);
    lines.push(`- Physical files: ${formatSignedNumber(report.delta.totals.physicalFiles.delta)}`);
    lines.push(`- Commits: ${formatSignedNumber(report.delta.totals.commits.delta)}`);
    lines.push(`- Tags/releases: ${formatSignedNumber(report.delta.totals.tags.delta)}`);
    lines.push(`- Dirty repositories: ${formatSignedNumber(report.delta.totals.dirtyRepositories.delta)}`);
    lines.push('');

    if (report.delta.repositories.changed.length > 0) {
      lines.push('| Repo | LOC delta | File delta | Commit delta | Tag delta | Dirty file delta |');
      lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
      for (const repo of report.delta.repositories.changed.slice(0, 15)) {
        lines.push(`| ${markdownCell(repo.name)} | ${formatSignedNumber(repo.codeLines.delta)} | ${formatSignedNumber(repo.physicalFiles.delta)} | ${formatSignedNumber(repo.commits.delta)} | ${formatSignedNumber(repo.tags.delta)} | ${formatSignedNumber(repo.dirtyFileCount.delta)} |`);
      }
      lines.push('');
    }
  } else {
    lines.push(report.delta?.reason || 'No previous comparable snapshot.');
    lines.push('');
  }

  lines.push('## Repositories');
  lines.push('');
  lines.push('| Repo | Branch | LOC | Commits | 30d | Contributors | Tags | Docs | Latest tag | Last commit | Dirty |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |');

  for (const repo of report.repositories) {
    const lastCommit = repo.lastCommit ? `${repo.lastCommit.date.slice(0, 10)} ${repo.lastCommit.hash}` : '';
    lines.push([
      markdownCell(repo.name),
      markdownCell(repo.branch || ''),
      formatNumber(repo.loc.codeLines),
      formatNumber(repo.commits.total),
      formatNumber(repo.commits.last30Days),
      formatNumber(repo.contributors.total),
      formatNumber(repo.releases.tags),
      formatNumber(repo.docs?.markdownFiles || 0),
      markdownCell(repo.releases.latestTag?.name || ''),
      markdownCell(lastCommit),
      repo.isDirty ? `${repo.dirtyFileCount}` : ''
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push('');
  lines.push('## Languages');
  lines.push('');
  lines.push('| Language | LOC | Comments | Files |');
  lines.push('| --- | ---: | ---: | ---: |');

  for (const language of report.languages) {
    lines.push(`| ${markdownCell(language.language)} | ${formatNumber(language.codeLines)} | ${formatNumber(language.commentLines || 0)} | ${formatNumber(language.files)} |`);
  }

  lines.push('');
  lines.push('## File Types');
  lines.push('');
  lines.push('| Type | Files | Size | Text lines | Binary | Oversized |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');

  for (const fileType of report.fileTypes.slice(0, 40)) {
    lines.push(`| ${markdownCell(fileType.type)} | ${formatNumber(fileType.files)} | ${formatBytes(fileType.bytes)} | ${formatNumber(fileType.textLines)} | ${formatNumber(fileType.binaryFiles)} | ${formatNumber(fileType.oversizedFiles)} |`);
  }

  lines.push('');
  lines.push('## Roots');
  lines.push('');
  for (const root of report.roots) {
    lines.push(`- ${root}`);
  }

  lines.push('');
  lines.push('## CSV Exports');
  lines.push('');
  lines.push('- csv/repositories.csv');
  lines.push('- csv/languages.csv');
  lines.push('- csv/file-types.csv');
  lines.push('- csv/weekly-repositories.csv');
  lines.push('- csv/ai-agents.csv');
  lines.push('- csv/releases.csv');
  lines.push('- csv/release-readiness.csv');
  lines.push('- csv/unreleased-work.csv');
  lines.push('- csv/contributors.csv');

  lines.push('');
  lines.push('## Repository Drilldowns');
  lines.push('');
  for (const repo of report.repositories) {
    lines.push(`- ${markdownCell(repo.name)}: ${repo.detailPath}`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function writeCsvExports(outputDir, report) {
  const csvDir = path.join(outputDir, 'csv');
  await fsp.mkdir(csvDir, { recursive: true });

  const files = new Map([
    ['repositories.csv', csvRepositories(report)],
    ['languages.csv', csvLanguages(report)],
    ['file-types.csv', csvFileTypes(report)],
    ['weekly-repositories.csv', csvWeeklyRepositories(report)],
    ['ai-agents.csv', csvAiAgents(report)],
    ['releases.csv', csvReleases(report)],
    ['release-readiness.csv', csvReleaseReadiness(report)],
    ['unreleased-work.csv', csvUnreleasedWork(report)],
    ['contributors.csv', csvContributors(report)]
  ]);

  await Promise.all([...files.entries()].map(([fileName, rows]) => (
    fsp.writeFile(path.join(csvDir, fileName), renderCsv(rows), 'utf8')
  )));
}

function csvRepositories(report) {
  return [
    [
      'name',
      'path',
      'remoteUrl',
      'branch',
      'codeLines',
      'commentLines',
      'physicalFiles',
      'physicalBytes',
      'commits',
      'commitsLast7Days',
      'commitsLast30Days',
      'commitsLast90Days',
      'contributors',
      'tags',
      'semverTags',
      'tagsLast365Days',
      'docsMarkdownFiles',
      'latestTag',
      'daysSinceLatestTag',
      'releaseStatus',
      'commitsSinceLatestTag',
      'filesChangedSinceLatestTag',
      'changelogFound',
      'dirtyFileCount',
      'locTool',
      'fileScope'
    ],
    ...report.repositories.map((repo) => [
      repo.name,
      repo.path,
      repo.remoteUrl || '',
      repo.branch || '',
      repo.loc.codeLines,
      repo.loc.commentLines || 0,
      repo.fileTypes.files,
      repo.fileTypes.bytes,
      repo.commits.total,
      repo.commits.last7Days || 0,
      repo.commits.last30Days,
      repo.commits.last90Days,
      repo.contributors.total,
      repo.releases.tags,
      repo.releases.semverTags,
      repo.releases.tagsLast365Days || 0,
      repo.docs?.markdownFiles || 0,
      repo.releases.latestTag?.name || '',
      repo.releases.daysSinceLatestTag ?? '',
      repo.releaseReadiness?.status || '',
      repo.releases.commitsSinceLatestTag ?? 0,
      repo.releases.filesChangedSinceLatestTag ?? 0,
      repo.changelog?.detailPath ? 'true' : 'false',
      repo.dirtyFileCount,
      repo.loc.tool || '',
      repo.loc.fileScope || ''
    ])
  ];
}

function csvLanguages(report) {
  return [
    ['language', 'files', 'codeLines', 'commentLines', 'blankLines', 'totalLines'],
    ...report.languages.map((language) => [
      language.language,
      language.files,
      language.codeLines,
      language.commentLines || 0,
      language.blankLines,
      language.lines
    ])
  ];
}

function csvFileTypes(report) {
  return [
    ['type', 'files', 'bytes', 'textFiles', 'binaryFiles', 'oversizedFiles', 'textLines', 'nonEmptyTextLines'],
    ...report.fileTypes.map((fileType) => [
      fileType.type,
      fileType.files,
      fileType.bytes,
      fileType.textFiles,
      fileType.binaryFiles,
      fileType.oversizedFiles,
      fileType.textLines,
      fileType.nonEmptyTextLines
    ])
  ];
}

function csvWeeklyRepositories(report) {
  return [
    ['name', 'path', 'commits', 'additions', 'deletions', 'netLines', 'filesChanged', 'activeAuthors'],
    ...report.weekly.topRepositories.map((repo) => [
      repo.name,
      repo.path,
      repo.commits,
      repo.additions,
      repo.deletions,
      repo.netLines,
      repo.filesChanged,
      repo.activeAuthors
    ])
  ];
}

function csvAiAgents(report) {
  return [
    ['agent', 'repoCount', 'signalCount', 'repositories'],
    ...report.aiAgents.agents.map((agent) => [
      agent.name,
      agent.repoCount,
      agent.signalCount,
      agent.repositories.map((repo) => `${repo.name} (${repo.signalCount})`).join('; ')
    ])
  ];
}

function csvReleases(report) {
  return [
    ['repo', 'path', 'tag', 'date', 'semver'],
    ...report.releases.latest.map((release) => [
      release.repo,
      release.path,
      release.name,
      release.date || '',
      release.semver ? 'true' : 'false'
    ])
  ];
}

function csvReleaseReadiness(report) {
  return [
    [
      'repo',
      'path',
      'status',
      'latestTag',
      'daysSinceLatestTag',
      'commitsSinceLatestTag',
      'filesChangedSinceLatestTag',
      'changelogFound',
      'dirtyFileCount',
      'unreleasedCommand',
      'reasons'
    ],
    ...report.releaseReadiness.repositories.map((repo) => [
      repo.name,
      repo.path,
      repo.status,
      repo.latestTag?.name || '',
      repo.daysSinceLatestTag ?? '',
      repo.commitsSinceLatestTag,
      repo.filesChangedSinceLatestTag,
      repo.changelogFound ? 'true' : 'false',
      repo.dirtyFileCount,
      repo.unreleasedWork?.command || '',
      repo.reasons.join('; ')
    ])
  ];
}

function csvUnreleasedWork(report) {
  return [
    [
      'repo',
      'path',
      'latestTag',
      'range',
      'commitsSinceLatestTag',
      'filesChangedSinceLatestTag',
      'authors',
      'topChangedFiles',
      'recentCommits',
      'command'
    ],
    ...report.releaseReadiness.repositories.map((repo) => {
      const work = repo.unreleasedWork || {};
      return [
        repo.name,
        repo.path,
        repo.latestTag?.name || '',
        work.range || '',
        repo.commitsSinceLatestTag,
        repo.filesChangedSinceLatestTag,
        (work.authors || []).map((author) => `${author.name} (${formatNumber(author.commits)})`).join('; '),
        (work.changedFiles || []).map((file) => `${file.path} (+${formatNumber(file.additions)}/-${formatNumber(file.deletions)})`).join('; '),
        (work.commits || []).map((commit) => `${commit.shortHash} ${commit.subject}`).join('; '),
        work.command || ''
      ];
    })
  ];
}

function csvContributors(report) {
  return [
    ['contributor', 'commits', 'repoCount', 'repositories'],
    ...report.contributors.contributors.map((contributor) => [
      contributor.name,
      contributor.commits,
      contributor.repoCount,
      contributor.repositories.map((repo) => `${repo.name} (${repo.commits})`).join('; ')
    ])
  ];
}

function renderCsv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function csvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function okCheck(name, detail) {
  return { status: 'OK', name, detail };
}

function warnCheck(name, detail) {
  return { status: 'WARN', name, detail };
}

function failCheck(name, detail) {
  return { status: 'FAIL', name, detail };
}

function checkConfigIgnored(configPath) {
  const repoRoot = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (!repoRoot) {
    return warnCheck('Config ignore', 'not inside a Git repository');
  }

  const relativePath = path.relative(repoRoot, configPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return warnCheck('Config ignore', 'config is outside this Git repository');
  }

  if (relativePath === 'project-watcher.config.example.json' || relativePath === 'test/ci.config.json') {
    return okCheck('Config ignore', `${relativePath} is a commit-safe config`);
  }

  const status = gitStatus(repoRoot, ['check-ignore', '-q', relativePath]);
  if (status === 0) {
    return okCheck('Config ignore', `${relativePath} is ignored`);
  }

  return warnCheck('Config ignore', `${relativePath} is not ignored; local machine paths may be committed`);
}

async function writeRepositoryPages(outputDir, report) {
  const reposDir = path.join(outputDir, 'repos');
  await fsp.rm(reposDir, { recursive: true, force: true });
  await fsp.mkdir(reposDir, { recursive: true });

  const writes = report.repositories.map((repo) => (
    fsp.writeFile(path.join(outputDir, repo.detailPath), renderRepositoryHtml(report, repo), 'utf8')
  ));

  for (const repo of report.repositories) {
    for (const doc of repo.docs?.files || []) {
      writes.push(writeRepositoryDocPage(outputDir, report, repo, doc));
    }

    const docDetailPaths = new Set((repo.docs?.files || []).map((doc) => doc.detailPath));
    if (repo.changelog?.detailPath && !docDetailPaths.has(repo.changelog.detailPath)) {
      writes.push(writeRepositoryDocPage(outputDir, report, repo, repo.changelog));
    }
  }

  await Promise.all(writes);
}

async function writeRepositoryDocPage(outputDir, report, repo, doc) {
  const outputPath = path.join(outputDir, doc.detailPath);
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  let markdown = '';
  let readError = null;
  try {
    markdown = await fsp.readFile(path.join(repo.path, doc.path), 'utf8');
  } catch (error) {
    readError = error;
  }

  await fsp.writeFile(outputPath, renderRepositoryDocHtml(report, repo, doc, markdown, readError), 'utf8');
}

function renderRepositoryHtml(report, repo) {
  const topLanguages = repo.loc.byLanguage.slice(0, 8);
  const topFileTypes = repo.fileTypes.byType.slice(0, 12);
  const weeklySvg = sparkline(repo.weekly?.weeks || [], 'commits', 720, 180, '#2563eb');
  const maxLanguageLoc = Math.max(1, ...topLanguages.map((language) => language.codeLines));
  const maxFileTypeFiles = Math.max(1, ...topFileTypes.map((fileType) => fileType.files));
  const title = `${repo.name} - Project Watcher`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(`Local Git drilldown for ${repo.name}.`)}">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#1f1a14">
  <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
  <style>${repositoryPageCss()}</style>
</head>
<body>
  <main class="shell">
    <header class="masthead">
      <div>
        <p class="eyebrow"><a href="../report.html">Project Watcher</a> / Repository</p>
        <h1>${escapeHtml(repo.name)}</h1>
        <p class="path">${escapeHtml(repo.path)}</p>
      </div>
      <div class="masthead-stats">
        ${mastheadStatHtml('LOC', repo.loc.codeLines, `${repo.loc.tool || 'unknown'} / ${repo.loc.fileScope || 'unknown'}`)}
        ${mastheadStatHtml('Commits', repo.commits.total, `${formatNumber(repo.commits.last30Days)} in 30d`)}
        ${mastheadStatHtml('Tags', repo.releases.tags, repo.releases.latestTag?.name || 'no latest tag')}
        ${mastheadStatHtml('Dirty files', repo.dirtyFileCount, repo.isDirty ? 'local changes present' : 'clean working tree')}
      </div>
    </header>

    <div class="grid">
      <section>
        <div class="section-title">
          <h2>Weekly commits</h2>
          <p class="note">${formatNumber(repo.weekly?.last7Days?.commits || 0)} commits in 7d</p>
        </div>
        <div class="trend">${weeklySvg}</div>
      </section>

      <section>
        <div class="section-title">
          <h2>Repository state</h2>
          <p class="note">local Git metadata</p>
        </div>
        <dl class="facts">
          ${factHtml('Branch', repo.branch || 'unknown')}
          ${factHtml('Remote', repo.remoteUrl || 'none')}
          ${factHtml('Last commit', repo.lastCommit ? `${repo.lastCommit.date.slice(0, 10)} ${repo.lastCommit.hash}` : 'none')}
          ${factHtml('Last subject', repo.lastCommit?.subject || '')}
          ${factHtml('Contributors', formatNumber(repo.contributors.total))}
          ${factHtml('Local branches', formatNumber(repo.branches.local))}
          ${factHtml('Release status', repo.releaseReadiness?.status || 'unknown')}
          ${factHtml('Commits since tag', formatNumber(repo.releases.commitsSinceLatestTag || 0))}
          ${factHtml('Files since tag', formatNumber(repo.releases.filesChangedSinceLatestTag || 0))}
          ${factHtml('Unreleased command', repo.releases.unreleasedWork?.command || 'git log --oneline')}
          ${factHtml('Changelog', repo.changelog?.path || 'missing')}
        </dl>
      </section>
    </div>

    <div class="grid">
      <section>
        <div class="section-title">
          <h2>Languages</h2>
          <p class="note">classified code lines</p>
        </div>
        <div class="bars">
          ${topLanguages.map((language) => barRowHtml(language.language, language.codeLines, maxLanguageLoc)).join('') || '<p class="empty">No language stats.</p>'}
        </div>
      </section>

      <section>
        <div class="section-title">
          <h2>File types</h2>
          <p class="note">${formatBytes(repo.fileTypes.bytes || 0)} after excludes</p>
        </div>
        <div class="bars">
          ${topFileTypes.map((fileType) => fileTypeRowHtml(fileType, maxFileTypeFiles)).join('') || '<p class="empty">No file stats.</p>'}
        </div>
      </section>
    </div>

    <div class="grid">
      <section>
        <div class="section-title">
          <h2>Releases</h2>
          <p class="note">local tags</p>
        </div>
        <div class="repo-list">
          ${(repo.releases.recentTags || []).map((tag) => tagHtml(tag)).join('') || '<p class="empty">No local tags.</p>'}
        </div>
      </section>

      <section>
        <div class="section-title">
          <h2>Contributors</h2>
          <p class="note">top commit authors</p>
        </div>
        <div class="repo-list">
          ${(repo.contributors.all || repo.contributors.top || []).slice(0, 12).map((contributor) => localContributorHtml(contributor)).join('') || '<p class="empty">No contributors.</p>'}
        </div>
      </section>
    </div>

    <div class="grid" id="docs">
      <section class="span-all">
        <div class="section-title">
          <h2>Docs</h2>
          <p class="note">${formatNumber(repo.docs?.markdownFiles || 0)} Markdown files under /docs</p>
        </div>
        ${repositoryDocsHtml(repo)}
      </section>
    </div>

    <div class="grid">
      <section>
        <div class="section-title">
          <h2>AI agents</h2>
          <p class="note">repo footprint, not telemetry</p>
        </div>
        <div class="repo-list">
          ${(repo.aiAgents || []).map(repoAgentHtml).join('') || '<p class="empty">No tracked AI agent files.</p>'}
        </div>
      </section>

      <section>
        <div class="section-title">
          <h2>Scan details</h2>
          <p class="note">${escapeHtml(formatDateTime(report.generatedAt))}</p>
        </div>
        <dl class="facts">
          ${factHtml('Duplicate policy', repo.loc.duplicatePolicy || 'unknown')}
          ${factHtml('Files counted by LOC', formatNumber(repo.loc.files))}
          ${factHtml('Physical files', formatNumber(repo.fileTypes.files))}
          ${factHtml('Text lines', formatNumber(repo.fileTypes.textLines))}
          ${factHtml('Binary files', formatNumber(repo.fileTypes.binaryFiles))}
          ${factHtml('Oversized files', formatNumber(repo.fileTypes.oversizedFiles))}
        </dl>
      </section>
    </div>
  </main>
</body>
</html>
`;
}

function renderRepositoryDocHtml(report, repo, doc, markdown, readError) {
  const sectionName = doc.kind === 'changelog' ? 'Changelog' : 'Docs';
  const title = `${doc.title} - ${repo.name} ${sectionName.toLowerCase()}`;
  const repoHref = relativeReportPath(doc.detailPath, repo.detailPath);
  const reportHref = relativeReportPath(doc.detailPath, 'report.html');
  const docContent = readError
    ? `<p class="empty">Could not read ${escapeHtml(doc.path)}: ${escapeHtml(readError.message)}</p>`
    : renderMarkdownDocument(markdown, {
      sourcePath: doc.path,
      outputPath: doc.detailPath,
      docPathBySource: repositoryDocMap(repo)
    });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(`${doc.path} from ${repo.name}.`)}">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#1f1a14">
  <link rel="icon" href="${escapeHtml(relativeReportPath(doc.detailPath, 'assets/favicon.svg'))}" type="image/svg+xml">
  <style>${repositoryPageCss()}</style>
</head>
<body>
  <main class="shell">
    <header class="masthead">
      <div>
        <p class="eyebrow"><a href="${escapeHtml(reportHref)}">Project Watcher</a> / <a href="${escapeHtml(repoHref)}">${escapeHtml(repo.name)}</a> / ${escapeHtml(sectionName)}</p>
        <h1>${escapeHtml(doc.title)}</h1>
        <p class="path">${escapeHtml(doc.path)}</p>
      </div>
      <div class="masthead-stats">
        ${mastheadStatHtml('Lines', doc.lines || 0, 'Markdown source')}
        ${mastheadStatHtml('Size', doc.bytes || 0, 'bytes')}
        ${mastheadStatHtml('Docs', repo.docs?.markdownFiles || 0, 'files in /docs')}
        ${mastheadStatHtml('Updated', doc.modifiedAt ? daysSince(doc.modifiedAt) : 0, 'days since modified')}
      </div>
    </header>

    <div class="doc-layout">
      <aside class="doc-nav">
        <div class="section-title">
          <h2>${escapeHtml(sectionName)}</h2>
          <p class="note">${doc.kind === 'changelog' ? 'release notes' : `${formatNumber(repo.docs?.markdownFiles || 0)} files`}</p>
        </div>
        ${doc.kind === 'changelog' ? changelogNavHtml(repo, doc.detailPath) : docListHtml(repo, doc.detailPath, doc.detailPath)}
      </aside>
      <article class="markdown-body">
        ${docContent}
      </article>
    </div>
  </main>
</body>
</html>
`;
}

function repositoryDocsHtml(repo) {
  if (!repo.docs?.exists) {
    return '<p class="empty">No top-level docs folder detected.</p>';
  }

  if ((repo.docs.files || []).length === 0) {
    return '<p class="empty">Docs folder found, but no Markdown files were readable under /docs.</p>';
  }

  return docListHtml(repo, repo.detailPath);
}

function docListHtml(repo, fromPath, activePath = '') {
  return `<div class="doc-list">
    ${(repo.docs?.files || []).map((doc) => docFileHtml(doc, fromPath, activePath)).join('')}
  </div>`;
}

function changelogNavHtml(repo, fromPath) {
  return `<div class="doc-list">
    <a class="doc-link active" style="--depth: 0" href="${escapeHtml(relativeReportPath(fromPath, repo.changelog.detailPath))}">
      <strong>changelog.md</strong>
      <span>${escapeHtml(repo.changelog.path)} · ${formatNumber(repo.changelog.lines || 0)} lines · ${formatBytes(repo.changelog.bytes || 0)}</span>
    </a>
    <a class="doc-link" style="--depth: 0" href="${escapeHtml(relativeReportPath(fromPath, repo.detailPath))}">
      <strong>${escapeHtml(repo.name)}</strong>
      <span>repository overview</span>
    </a>
  </div>`;
}

function docFileHtml(doc, fromPath, activePath) {
  const activeClass = doc.detailPath === activePath ? ' active' : '';
  const depth = Math.max(0, doc.path.split('/').length - 2);
  return `<a class="doc-link${activeClass}" style="--depth: ${depth}" href="${escapeHtml(relativeReportPath(fromPath, doc.detailPath))}">
    <strong>${escapeHtml(doc.title)}</strong>
    <span>${escapeHtml(doc.path)} · ${formatNumber(doc.lines || 0)} lines · ${formatBytes(doc.bytes || 0)}</span>
  </a>`;
}

function repositoryDocMap(repo) {
  return new Map((repo.docs?.files || []).map((doc) => [doc.path, doc]));
}

function renderMarkdownDocument(markdown, context) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listType = null;
  let inFence = false;
  let fenceLanguage = '';
  let fenceLines = [];

  const closeParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }

    html.push(`<p>${renderInlineMarkdown(paragraph.join(' '), context)}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listType) {
      return;
    }

    html.push(`</${listType}>`);
    listType = null;
  };

  const closeBlocks = () => {
    closeParagraph();
    closeList();
  };

  for (const line of lines) {
    if (inFence) {
      if (/^```/.test(line.trim())) {
        html.push(`<pre><code${fenceLanguage ? ` class="language-${escapeHtml(fenceLanguage)}"` : ''}>${escapeHtml(fenceLines.join('\n'))}</code></pre>`);
        inFence = false;
        fenceLanguage = '';
        fenceLines = [];
      } else {
        fenceLines.push(line);
      }
      continue;
    }

    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      closeBlocks();
      inFence = true;
      fenceLanguage = trimmed.slice(3).trim().split(/\s+/)[0] || '';
      continue;
    }

    if (trimmed.length === 0) {
      closeBlocks();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeBlocks();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2], context)}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeBlocks();
      html.push('<hr>');
      continue;
    }

    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    if (unordered) {
      closeParagraph();
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${renderInlineMarkdown(unordered[1], context)}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      closeParagraph();
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${renderInlineMarkdown(ordered[1], context)}</li>`);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      closeBlocks();
      html.push(`<blockquote><p>${renderInlineMarkdown(quote[1], context)}</p></blockquote>`);
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      closeBlocks();
      html.push(`<pre><code>${escapeHtml(line)}</code></pre>`);
      continue;
    }

    closeList();
    paragraph.push(trimmed);
  }

  if (inFence) {
    html.push(`<pre><code${fenceLanguage ? ` class="language-${escapeHtml(fenceLanguage)}"` : ''}>${escapeHtml(fenceLines.join('\n'))}</code></pre>`);
  }

  closeBlocks();

  return html.join('\n') || '<p class="empty">This Markdown file is empty.</p>';
}

function renderInlineMarkdown(text, context) {
  const codeBlocks = [];
  const links = [];
  let working = String(text).replace(/`([^`]+)`/g, (_match, code) => {
    const marker = `PWC0DEMARK${codeBlocks.length}END`;
    codeBlocks.push(`<code>${escapeHtml(code)}</code>`);
    return marker;
  });

  working = working.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, label, href) => {
    const marker = `PWL1NKMARK${links.length}END`;
    const safeHref = resolveMarkdownHref(href, context);
    links.push(`<a href="${escapeHtml(safeHref)}">${escapeHtml(label)}</a>`);
    return marker;
  });

  working = escapeHtml(working)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');

  for (let index = 0; index < links.length; index += 1) {
    working = working.replace(`PWL1NKMARK${index}END`, links[index]);
  }

  for (let index = 0; index < codeBlocks.length; index += 1) {
    working = working.replace(`PWC0DEMARK${index}END`, codeBlocks[index]);
  }

  return working;
}

function resolveMarkdownHref(href, context) {
  const trimmed = href.trim();

  if (!trimmed || trimmed.startsWith('//')) {
    return '#';
  }

  if (trimmed.startsWith('#')) {
    return trimmed;
  }

  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme) {
    return ['http', 'https', 'mailto'].includes(scheme) ? trimmed : '#';
  }

  const hashIndex = trimmed.indexOf('#');
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const queryIndex = withoutHash.indexOf('?');
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : '';
  const linkPath = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const extension = path.posix.extname(linkPath).toLowerCase();

  if (MARKDOWN_EXTENSIONS.has(extension) && context?.sourcePath && context?.outputPath && context?.docPathBySource) {
    const sourceDir = path.posix.dirname(context.sourcePath);
    const targetSourcePath = normalizeDocLinkPath(path.posix.join(sourceDir, linkPath));
    const targetDoc = context.docPathBySource.get(targetSourcePath);

    if (targetDoc?.detailPath) {
      return `${relativeReportPath(context.outputPath, targetDoc.detailPath)}${query}${hash}`;
    }
  }

  return trimmed;
}

function normalizeDocLinkPath(value) {
  const normalized = path.posix.normalize(normalizeReportPath(value)).replace(/^(\.\.\/)+/, '');
  return normalized.startsWith(`${DOCS_DIR}/`) ? normalized : `${DOCS_DIR}/${normalized}`;
}

function repositoryPageCss() {
  return `
    :root { --paper: #f6f0e5; --paper-strong: #fffaf0; --ink: #1f1a14; --muted: #766b5d; --line: rgba(31,26,20,.14); --accent: #d97706; --accent-blue: #2563eb; --danger: #b42318; --shadow: rgba(43,31,18,.12); }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--ink); background: linear-gradient(120deg, rgba(217,119,6,.10), transparent 34rem), radial-gradient(circle at 80% 0%, rgba(37,99,235,.10), transparent 28rem), repeating-linear-gradient(90deg, rgba(31,26,20,.035) 0, rgba(31,26,20,.035) 1px, transparent 1px, transparent 72px), var(--paper); font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif; }
    a { color: inherit; }
    .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 36px 0 54px; }
    .masthead { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(280px, .95fr); gap: 44px; align-items: end; border-bottom: 1px solid var(--line); padding-bottom: 30px; }
    .eyebrow { margin: 0 0 16px; color: var(--muted); font-size: .78rem; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
    h1 { max-width: 760px; margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: clamp(3rem, 8vw, 7rem); line-height: .88; letter-spacing: -.07em; }
    .path { color: var(--muted); font-size: .82rem; word-break: break-all; }
    .masthead-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--line); border: 1px solid var(--line); box-shadow: 0 20px 60px var(--shadow); }
    .masthead-stat { min-height: 112px; background: rgba(255,250,240,.70); padding: 18px; }
    .masthead-stat span { display: block; color: var(--muted); font-size: .72rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .masthead-stat strong { display: block; margin-top: 10px; font-family: Georgia, "Times New Roman", serif; font-size: clamp(1.8rem, 4vw, 3.4rem); font-weight: 400; letter-spacing: -.05em; line-height: .95; }
    .masthead-stat small { display: block; margin-top: 8px; color: var(--muted); font-size: .8rem; line-height: 1.25; overflow-wrap: anywhere; }
    .grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(280px, .75fr); gap: 34px; margin-top: 34px; }
    .span-all { grid-column: 1 / -1; }
    .section-title { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; margin-bottom: 18px; border-bottom: 1px solid var(--line); padding-bottom: 12px; }
    h2 { margin: 0; font-size: .86rem; letter-spacing: .14em; text-transform: uppercase; }
    .note, .empty { margin: 0; color: var(--muted); font-size: .9rem; }
    .trend { min-height: 220px; background: linear-gradient(180deg, rgba(255,250,240,.72), rgba(255,250,240,.28)); border: 1px solid var(--line); box-shadow: 0 20px 60px var(--shadow); padding: 18px; overflow: hidden; }
    .trend svg { width: 100%; height: auto; display: block; }
    .bars, .repo-list { display: grid; gap: 13px; }
    .doc-list { display: grid; gap: 9px; }
    .doc-link { display: block; border: 1px solid var(--line); background: rgba(255,250,240,.58); padding: 13px 14px 13px calc(14px + (var(--depth, 0) * 18px)); text-decoration: none; transition: background 160ms ease, transform 160ms ease; }
    .doc-link:hover, .doc-link.active { background: rgba(217,119,6,.10); transform: translateX(3px); }
    .doc-link strong { display: block; }
    .doc-link span { display: block; margin-top: 4px; color: var(--muted); font-size: .82rem; overflow-wrap: anywhere; }
    .doc-layout { display: grid; grid-template-columns: minmax(220px, .34fr) minmax(0, 1fr); gap: 34px; margin-top: 34px; align-items: start; }
    .doc-nav { position: sticky; top: 18px; }
    .markdown-body { min-width: 0; border: 1px solid var(--line); background: rgba(255,250,240,.70); box-shadow: 0 20px 60px var(--shadow); padding: clamp(20px, 4vw, 44px); font-size: 1.02rem; line-height: 1.65; }
    .markdown-body > *:first-child { margin-top: 0; }
    .markdown-body > *:last-child { margin-bottom: 0; }
    .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { margin: 1.55em 0 .55em; font-family: Georgia, "Times New Roman", serif; letter-spacing: -.04em; line-height: 1.05; text-transform: none; }
    .markdown-body h1 { font-size: clamp(2.2rem, 5vw, 4.2rem); }
    .markdown-body h2 { font-size: clamp(1.7rem, 3vw, 2.7rem); }
    .markdown-body h3 { font-size: 1.45rem; }
    .markdown-body p, .markdown-body ul, .markdown-body ol, .markdown-body blockquote, .markdown-body pre { margin: 0 0 1.05em; }
    .markdown-body code { border: 1px solid var(--line); background: rgba(31,26,20,.06); padding: .1em .32em; font-family: "SFMono-Regular", Consolas, monospace; font-size: .92em; }
    .markdown-body pre { overflow-x: auto; border: 1px solid var(--line); background: rgba(31,26,20,.88); color: #fffaf0; padding: 16px; }
    .markdown-body pre code { border: 0; background: transparent; color: inherit; padding: 0; }
    .markdown-body blockquote { border-left: 4px solid var(--accent); margin-left: 0; padding-left: 16px; color: var(--muted); }
    .markdown-body hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
    .bar-row, .repo-line { display: grid; grid-template-columns: minmax(110px, .7fr) minmax(140px, 1.3fr) 82px; gap: 12px; align-items: center; font-size: .95rem; }
    .repo-line { grid-template-columns: minmax(0, 1fr) 110px; border-bottom: 1px solid var(--line); padding: 11px 0; }
    .repo-line strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .repo-line span { color: var(--muted); font-size: .84rem; }
    .bar-track { height: 11px; background: rgba(31,26,20,.08); overflow: hidden; }
    .bar-fill { display: block; width: calc(var(--value) * 1%); height: 100%; background: var(--accent); }
    .facts { display: grid; grid-template-columns: 1fr; gap: 1px; margin: 0; background: var(--line); border: 1px solid var(--line); }
    .facts div { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 14px; background: rgba(255,250,240,.66); padding: 12px; }
    dt { color: var(--muted); font-size: .72rem; font-weight: 800; letter-spacing: .10em; text-transform: uppercase; }
    dd { margin: 0; overflow-wrap: anywhere; }
    @media (max-width: 820px) { .shell { width: min(100% - 22px, 1180px); padding-top: 22px; } .masthead, .grid, .doc-layout { grid-template-columns: 1fr; } .doc-nav { position: static; } .bar-row { grid-template-columns: 1fr; gap: 6px; } .masthead-stats { grid-template-columns: 1fr 1fr; } }
  `;
}

function factHtml(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function tagHtml(tag) {
  const pieces = [
    tag.date ? formatDateTime(tag.date) : 'unknown date',
    SEMVER_TAG.test(tag.name) ? 'SemVer' : 'tag'
  ];
  return `<div class="repo-line"><div><strong>${escapeHtml(tag.name)}</strong><span>${escapeHtml(pieces.join(' · '))}</span></div><span>${SEMVER_TAG.test(tag.name) ? 'release' : 'tag'}</span></div>`;
}

function localContributorHtml(contributor) {
  return `<div class="repo-line"><div><strong>${escapeHtml(contributor.name)}</strong><span>commit author</span></div><span>${formatNumber(contributor.commits || 0)}</span></div>`;
}

function repoAgentHtml(agent) {
  const signals = agent.signals.map((signal) => `${signal.label} (${formatNumber(signal.count)})`).join(' · ');
  return `<div class="repo-line"><div><strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(signals)}</span></div><span>${formatNumber(agent.signalCount)}</span></div>`;
}

async function readSnapshots(snapshotsDir) {
  let entries;
  try {
    entries = await fsp.readdir(snapshotsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const snapshots = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    try {
      const raw = await fsp.readFile(path.join(snapshotsDir, entry.name), 'utf8');
      const parsed = JSON.parse(raw);

      if (parsed && parsed.generatedAt && parsed.totals && Array.isArray(parsed.repositories)) {
        snapshots.push(parsed);
      }
    } catch {
      // Ignore corrupt snapshots so one bad historical file does not block scans.
    }
  }

  return snapshots.sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
}

async function pruneSnapshots(snapshotsDir, maxSnapshots) {
  if (!Number.isInteger(maxSnapshots) || maxSnapshots <= 0) {
    return;
  }

  let entries;
  try {
    entries = await fsp.readdir(snapshotsDir, { withFileTypes: true });
  } catch {
    return;
  }

  const snapshots = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  const stale = snapshots.slice(maxSnapshots);
  await Promise.all(stale.map((fileName) => fsp.rm(path.join(snapshotsDir, fileName), { force: true })));
}

function buildHistory(reports) {
  const unique = new Map();

  for (const report of reports) {
    unique.set(report.generatedAt, report);
  }

  const snapshots = [...unique.values()]
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))
    .map((report) => ({
      generatedAt: report.generatedAt,
      repositories: report.totals.repositories,
      dirtyRepositories: report.totals.dirtyRepositories,
      codeLines: report.totals.codeLines,
      commentLines: report.totals.commentLines || 0,
      files: report.totals.files,
      physicalFiles: report.totals.physicalFiles || 0,
      physicalBytes: report.totals.physicalBytes || 0,
      commits: report.totals.commits,
      commitsLast7Days: report.totals.commitsLast7Days || 0,
      commitsLast30Days: report.totals.commitsLast30Days,
      tags: report.totals.tags,
      semverTags: report.totals.semverTags
    }));

  return {
    snapshotCount: snapshots.length,
    firstGeneratedAt: snapshots[0]?.generatedAt || null,
    lastGeneratedAt: snapshots.at(-1)?.generatedAt || null,
    snapshots
  };
}

function buildDelta(previousSnapshots, current) {
  const previous = findPreviousComparableSnapshot(previousSnapshots, current);

  if (!previous) {
    return {
      available: false,
      reason: 'No previous comparable snapshot'
    };
  }

  return {
    available: true,
    previousGeneratedAt: previous.generatedAt,
    currentGeneratedAt: current.generatedAt,
    totals: diffTotals(previous.totals, current.totals),
    repositories: diffRepositories(previous.repositories, current.repositories),
    languages: diffNamedRows(previous.languages || [], current.languages || [], 'language', ['codeLines', 'commentLines', 'files']),
    fileTypes: diffNamedRows(previous.fileTypes || [], current.fileTypes || [], 'type', ['files', 'bytes', 'textLines', 'binaryFiles'])
  };
}

function findPreviousComparableSnapshot(previousSnapshots, current) {
  const currentFingerprint = snapshotFingerprint(current);

  return [...previousSnapshots]
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .find((snapshot) => snapshotFingerprint(snapshot) === currentFingerprint) || null;
}

function snapshotFingerprint(report) {
  const scopes = uniqueSorted(report.repositories.map((repo) => repo.loc?.fileScope || 'unknown'));
  const duplicatePolicies = uniqueSorted(report.repositories.map((repo) => repo.loc?.duplicatePolicy || 'unknown'));
  return `scope=${scopes.join(',')}|duplicates=${duplicatePolicies.join(',')}`;
}

function diffTotals(previousTotals, currentTotals) {
  const keys = [
    'repositories',
    'dirtyRepositories',
    'codeLines',
    'commentLines',
    'physicalFiles',
    'physicalBytes',
    'commits',
    'commitsLast7Days',
    'commitsLast30Days',
    'tags',
    'semverTags'
  ];
  const result = {};

  for (const key of keys) {
    result[key] = metricDelta(previousTotals[key], currentTotals[key]);
  }

  return result;
}

function diffRepositories(previousRepos, currentRepos) {
  const previousByPath = new Map(previousRepos.map((repo) => [repo.path, repo]));
  const currentByPath = new Map(currentRepos.map((repo) => [repo.path, repo]));
  const added = [];
  const removed = [];
  const changed = [];

  for (const repo of currentRepos) {
    if (!previousByPath.has(repo.path)) {
      added.push(repoSummary(repo));
    }
  }

  for (const repo of previousRepos) {
    if (!currentByPath.has(repo.path)) {
      removed.push(repoSummary(repo));
    }
  }

  for (const repo of currentRepos) {
    const previous = previousByPath.get(repo.path);
    if (!previous) {
      continue;
    }

    const row = {
      name: repo.name,
      path: repo.path,
      detailPath: repo.detailPath,
      codeLines: metricDelta(previous.loc?.codeLines, repo.loc?.codeLines),
      physicalFiles: metricDelta(previous.fileTypes?.files, repo.fileTypes?.files),
      commits: metricDelta(previous.commits?.total, repo.commits?.total),
      tags: metricDelta(previous.releases?.tags, repo.releases?.tags),
      dirtyFileCount: metricDelta(previous.dirtyFileCount, repo.dirtyFileCount)
    };

    if (hasAnyDelta(row, ['codeLines', 'physicalFiles', 'commits', 'tags', 'dirtyFileCount'])) {
      changed.push(row);
    }
  }

  changed.sort((a, b) => deltaWeight(b, ['codeLines', 'physicalFiles', 'commits', 'tags']) - deltaWeight(a, ['codeLines', 'physicalFiles', 'commits', 'tags']));

  return {
    added,
    removed,
    changed
  };
}

function diffNamedRows(previousRows, currentRows, keyField, metricKeys) {
  const previousByKey = new Map(previousRows.map((row) => [row[keyField], row]));
  const currentByKey = new Map(currentRows.map((row) => [row[keyField], row]));
  const keys = uniqueSorted([...previousByKey.keys(), ...currentByKey.keys()]);
  const rows = [];

  for (const key of keys) {
    const previous = previousByKey.get(key) || {};
    const current = currentByKey.get(key) || {};
    const row = { [keyField]: key };

    for (const metricKey of metricKeys) {
      row[metricKey] = metricDelta(previous[metricKey], current[metricKey]);
    }

    if (hasAnyDelta(row, metricKeys)) {
      rows.push(row);
    }
  }

  rows.sort((a, b) => deltaWeight(b, metricKeys) - deltaWeight(a, metricKeys));
  return rows;
}

function repoSummary(repo) {
  return {
    name: repo.name,
    path: repo.path,
    detailPath: repo.detailPath,
    codeLines: repo.loc?.codeLines || 0,
    physicalFiles: repo.fileTypes?.files || 0,
    commits: repo.commits?.total || 0,
    tags: repo.releases?.tags || 0
  };
}

function metricDelta(previousValue, currentValue) {
  const previous = numberOrZero(previousValue);
  const current = numberOrZero(currentValue);
  const delta = current - previous;

  return {
    previous,
    current,
    delta,
    percent: previous === 0 ? null : delta / previous
  };
}

function hasAnyDelta(row, metricKeys) {
  return metricKeys.some((key) => row[key]?.delta !== 0);
}

function deltaWeight(row, metricKeys) {
  return metricKeys.reduce((total, key) => total + Math.abs(row[key]?.delta || 0), 0);
}

async function writeDashboardAssets(outputDir, report) {
  const assetsDir = path.join(outputDir, 'assets');
  const agentAssetsDir = path.join(assetsDir, 'agents');
  await fsp.mkdir(assetsDir, { recursive: true });
  await fsp.mkdir(agentAssetsDir, { recursive: true });

  await Promise.all([
    fsp.writeFile(path.join(assetsDir, 'favicon.svg'), renderFaviconSvg(), 'utf8'),
    fsp.writeFile(path.join(agentAssetsDir, 'claude.svg'), renderClaudeAgentIconSvg(), 'utf8'),
    fsp.writeFile(path.join(assetsDir, 'manifest.webmanifest'), renderWebManifest(report), 'utf8'),
    fsp.writeFile(path.join(outputDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8')
  ]);
}

function renderFaviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#1f1a14"/>
  <path d="M14 43V17h16c6.2 0 10 3.7 10 9.2 0 5.7-4 9.3-10.3 9.3h-6.4V43H14Zm9.3-15h5.2c2 0 3.1-.8 3.1-2.5 0-1.6-1.1-2.5-3.1-2.5h-5.2v5Z" fill="#fffaf0"/>
  <path d="M39 43 33.7 17h8.5l2.1 14.6L48 17h6.9l3.6 14.6L60.7 17H64l-5.2 26h-7.3l-4-14.8L43.4 43H39Z" fill="#d97706"/>
</svg>
`;
}

function renderClaudeAgentIconSvg() {
  return `<svg width="248" height="248" viewBox="0 0 248 248" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M52.4285 162.873L98.7844 136.879L99.5485 134.602L98.7844 133.334H96.4921L88.7237 132.862L62.2346 132.153L39.3113 131.207L17.0249 130.026L11.4214 128.844L6.2 121.873L6.7094 118.447L11.4214 115.257L18.171 115.847L33.0711 116.911L55.485 118.447L71.6586 119.392L95.728 121.873H99.5485L100.058 120.337L98.7844 119.392L97.7656 118.447L74.5877 102.732L49.4995 86.1905L36.3823 76.62L29.3779 71.7757L25.8121 67.2858L24.2839 57.3608L30.6515 50.2716L39.3113 50.8623L41.4763 51.4531L50.2636 58.1879L68.9842 72.7209L93.4357 90.6804L97.0015 93.6343L98.4374 92.6652L98.6571 91.9801L97.0015 89.2625L83.757 65.2772L69.621 40.8192L63.2534 30.6579L61.5978 24.632C60.9565 22.1032 60.579 20.0111 60.579 17.4246L67.8381 7.49965L71.9133 6.19995L81.7193 7.49965L85.7946 11.0443L91.9074 24.9865L101.714 46.8451L116.996 76.62L121.453 85.4816L123.873 93.6343L124.764 96.1155H126.292V94.6976L127.566 77.9197L129.858 57.3608L132.15 30.8942L132.915 23.4505L136.608 14.4708L143.994 9.62643L149.725 12.344L154.437 19.0788L153.8 23.4505L150.998 41.6463L145.522 70.1215L141.957 89.2625H143.994L146.414 86.7813L156.093 74.0206L172.266 53.698L179.398 45.6635L187.803 36.802L193.152 32.5484H203.34L210.726 43.6549L207.415 55.1159L196.972 68.3492L188.312 79.5739L175.896 96.2095L168.191 109.585L168.882 110.689L170.738 110.53L198.755 104.504L213.91 101.787L231.994 98.7149L240.144 102.496L241.036 106.395L237.852 114.311L218.495 119.037L195.826 123.645L162.07 131.592L161.696 131.893L162.137 132.547L177.36 133.925L183.855 134.279H199.774L229.447 136.524L237.215 141.605L241.8 147.867L241.036 152.711L229.065 158.737L213.019 154.956L175.45 145.977L162.587 142.787H160.805V143.85L171.502 154.366L191.242 172.089L215.82 195.011L217.094 200.682L213.91 205.172L210.599 204.699L188.949 188.394L180.544 181.069L161.696 165.118H160.422V166.772L164.752 173.152L187.803 207.771L188.949 218.405L187.294 221.832L181.308 223.959L174.813 222.777L161.187 203.754L147.305 182.486L136.098 163.345L134.745 164.2L128.075 235.42L125.019 239.082L117.887 241.8L111.902 237.31L108.718 229.984L111.902 215.452L115.722 196.547L118.779 181.541L121.58 162.873L123.291 156.636L123.14 156.219L121.773 156.449L107.699 175.752L86.304 204.699L69.3663 222.777L65.291 224.431L58.2867 220.768L58.9235 214.27L62.8713 208.48L86.304 178.705L100.44 160.155L109.551 149.507L109.462 147.967L108.959 147.924L46.6977 188.512L35.6182 189.93L30.7788 185.44L31.4156 178.115L33.7079 175.752L52.4285 162.873Z" fill="#D97757"/>
</svg>
`;
}

function renderWebManifest(report) {
  return `${JSON.stringify({
    name: 'Project Watcher',
    short_name: 'Watcher',
    description: dashboardDescription(report),
    start_url: './report.html',
    display: 'standalone',
    background_color: '#f6f0e5',
    theme_color: '#1f1a14',
    icons: [
      {
        src: './assets/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable'
      }
    ]
  }, null, 2)}\n`;
}

function dashboardDescription(report) {
  return `Local Git health report for ${formatNumber(report.totals.repositories)} repositories, ${formatNumber(report.totals.codeLines)} code lines, and ${formatNumber(report.totals.physicalFiles || 0)} tracked files.`;
}

function renderHtml(report) {
  const topLanguages = report.languages.slice(0, 8);
  const topFileTypes = report.fileTypes.slice(0, 12);
  const topRepos = report.repositories.slice(0, 12);
  const topRepoDeltas = report.delta?.repositories?.changed?.slice(0, 8) || [];
  const topWeeklyRepos = report.weekly?.topRepositories?.slice(0, 8) || [];
  const topAiAgents = report.aiAgents?.agents?.slice(0, 6) || [];
  const releases = report.releases?.latest || [];
  const releaseGaps = releaseGapRows(report.repositories).slice(-8);
  const releaseReadiness = report.releaseReadiness?.repositories?.slice(0, 12) || [];
  const topContributors = report.contributors?.contributors?.slice(0, 8) || [];
  const dirtyRepos = report.repositories.filter((repo) => repo.isDirty);
  const staleRepos = report.repositories
    .filter((repo) => repo.lastCommit && daysSince(repo.lastCommit.date) > 90)
    .sort((a, b) => a.lastCommit.date.localeCompare(b.lastCommit.date));
  const history = report.history?.snapshots || [];
  const historySvg = sparkline(history, 'codeLines', 720, 180, '#d97706');
  const commitsSvg = sparkline(history, 'commitsLast30Days', 360, 120, '#2563eb');
  const weeklyCommitsSvg = sparkline(report.weekly?.weeks || [], 'commits', 720, 180, '#2563eb');
  const weeklyChurnSvg = sparkline((report.weekly?.weeks || []).map((week) => ({
    ...week,
    churn: week.additions + week.deletions
  })), 'churn', 360, 120, '#d97706');
  const maxLanguageLoc = Math.max(1, ...topLanguages.map((language) => language.codeLines));
  const maxFileTypeFiles = Math.max(1, ...topFileTypes.map((fileType) => fileType.files));
  const maxRepoLoc = Math.max(1, ...topRepos.map((repo) => repo.loc.codeLines));
  const maxAgentRepoCount = Math.max(1, ...topAiAgents.map((agent) => agent.repoCount));
  const title = 'Project Watcher Report';
  const description = dashboardDescription(report);
  const imageAlt = 'Project Watcher local repository health dashboard';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#1f1a14">
  <meta name="application-name" content="Project Watcher">
  <meta name="apple-mobile-web-app-title" content="Project Watcher">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Project Watcher">
  <meta property="og:image:alt" content="${escapeHtml(imageAlt)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <link rel="icon" href="./assets/favicon.svg" type="image/svg+xml">
  <link rel="manifest" href="./assets/manifest.webmanifest">
  <style>
    :root {
      --paper: #f6f0e5;
      --paper-strong: #fffaf0;
      --ink: #1f1a14;
      --muted: #766b5d;
      --line: rgba(31, 26, 20, 0.14);
      --accent: #d97706;
      --accent-blue: #2563eb;
      --danger: #b42318;
      --ok: #16794c;
      --shadow: rgba(43, 31, 18, 0.12);
    }

    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      color: var(--ink);
      background:
        linear-gradient(120deg, rgba(217, 119, 6, 0.10), transparent 34rem),
        radial-gradient(circle at 80% 0%, rgba(37, 99, 235, 0.10), transparent 28rem),
        repeating-linear-gradient(90deg, rgba(31, 26, 20, 0.035) 0, rgba(31, 26, 20, 0.035) 1px, transparent 1px, transparent 72px),
        var(--paper);
      font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
      animation: page-in 420ms ease-out both;
    }

    a {
      color: inherit;
    }

    .shell {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: 36px 0 54px;
    }

    .masthead {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
      gap: 44px;
      align-items: end;
      min-height: 320px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 30px;
    }

    .eyebrow {
      margin: 0 0 16px;
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    h1 {
      max-width: 760px;
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(3.4rem, 9vw, 8.5rem);
      line-height: 0.86;
      letter-spacing: -0.07em;
    }

    .masthead-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--line);
      border: 1px solid var(--line);
      box-shadow: 0 20px 60px var(--shadow);
    }

    .masthead-stat {
      min-height: 112px;
      background: rgba(255, 250, 240, 0.70);
      padding: 18px;
      animation: rise 500ms ease-out both;
    }

    .masthead-stat span {
      display: block;
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .masthead-stat strong {
      display: block;
      margin-top: 10px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(1.8rem, 4vw, 3.4rem);
      font-weight: 400;
      letter-spacing: -0.05em;
      line-height: 0.95;
    }

    .masthead-stat small {
      display: block;
      margin-top: 8px;
      color: var(--muted);
      font-size: 0.8rem;
      line-height: 1.25;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      border-bottom: 1px solid var(--line);
    }

    .metric {
      padding: 28px 24px 26px 0;
      border-right: 1px solid var(--line);
      animation: rise 500ms ease-out both;
    }

    .metric:nth-child(2) { animation-delay: 60ms; }
    .metric:nth-child(3) { animation-delay: 120ms; }
    .metric:nth-child(4) { animation-delay: 180ms; border-right: 0; }

    .metric span {
      display: block;
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .metric strong {
      display: block;
      margin-top: 9px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(2rem, 4vw, 4.3rem);
      font-weight: 400;
      letter-spacing: -0.05em;
    }

    .delta-strip {
      margin-top: 34px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 26px;
    }

    .readiness-strip {
      margin-top: 34px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 26px;
    }

    .delta-metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1px;
      background: var(--line);
      border: 1px solid var(--line);
    }

    .delta-metric {
      background: rgba(255, 250, 240, 0.64);
      padding: 18px;
    }

    .delta-metric span {
      display: block;
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .delta-metric strong {
      display: block;
      margin-top: 8px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 2.1rem;
      font-weight: 400;
      letter-spacing: -0.04em;
    }

    .delta-metric.positive strong {
      color: var(--ok);
    }

    .delta-metric.negative strong {
      color: var(--danger);
    }

    .delta-list {
      margin-top: 18px;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
      gap: 34px;
      margin-top: 34px;
    }

    section {
      min-width: 0;
    }

    [id] {
      scroll-margin-top: 18px;
    }

    .section-title {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: baseline;
      margin-bottom: 18px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 12px;
    }

    h2 {
      margin: 0;
      font-size: 0.86rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .note {
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .quick-nav {
      margin-top: 28px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--line);
    }

    .quick-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .quick-link {
      border: 1px solid var(--line);
      background: rgba(255, 250, 240, 0.55);
      color: var(--ink);
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      padding: 9px 11px;
      text-decoration: none;
      text-transform: uppercase;
      transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
    }

    .quick-link:hover {
      background: rgba(217, 119, 6, 0.11);
      border-color: rgba(217, 119, 6, 0.42);
      transform: translateY(-1px);
    }

    .trend {
      min-height: 220px;
      background: linear-gradient(180deg, rgba(255, 250, 240, 0.72), rgba(255, 250, 240, 0.28));
      border: 1px solid var(--line);
      box-shadow: 0 20px 60px var(--shadow);
      padding: 18px;
      overflow: hidden;
    }

    .trend svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .bars {
      display: grid;
      gap: 13px;
    }

    .bar-row {
      display: grid;
      grid-template-columns: minmax(110px, 0.7fr) minmax(140px, 1.3fr) 82px;
      gap: 12px;
      align-items: center;
      font-size: 0.95rem;
    }

    .bar-track {
      height: 11px;
      background: rgba(31, 26, 20, 0.08);
      overflow: hidden;
    }

    .bar-fill {
      display: block;
      width: calc(var(--value) * 1%);
      height: 100%;
      background: var(--accent);
      transform-origin: left center;
      animation: scale-x 620ms ease-out both;
    }

    .repo-list {
      display: grid;
      gap: 10px;
    }

    .release-overflow {
      border-bottom: 1px solid var(--line);
      padding: 2px 0 10px;
    }

    .release-overflow summary {
      cursor: pointer;
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 800;
      letter-spacing: 0.10em;
      list-style: none;
      text-transform: uppercase;
    }

    .release-overflow summary::-webkit-details-marker {
      display: none;
    }

    .release-overflow summary::after {
      content: "+";
      float: right;
      color: var(--ink);
      font-size: 1rem;
    }

    .release-overflow[open] summary::after {
      content: "-";
    }

    .release-overflow .repo-list {
      margin-top: 10px;
    }

    .release-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(82px, auto);
      gap: 14px;
      align-items: center;
      padding: 14px 0;
      border-bottom: 1px solid var(--line);
    }

    .release-project {
      display: block;
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .release-changelog {
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 700;
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
    }

    .release-meta {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-size: 0.86rem;
    }

    .unreleased-work {
      margin-top: 10px;
      color: var(--muted);
      font-size: 0.83rem;
    }

    .unreleased-work summary {
      cursor: pointer;
      display: inline-flex;
      color: var(--ink);
      font-weight: 800;
      letter-spacing: 0.08em;
      list-style: none;
      text-transform: uppercase;
    }

    .unreleased-work summary::-webkit-details-marker {
      display: none;
    }

    .unreleased-work summary::after {
      content: "+";
      margin-left: 8px;
    }

    .unreleased-work[open] summary::after {
      content: "-";
    }

    .unreleased-work ul {
      display: grid;
      gap: 4px;
      margin: 8px 0 0;
      padding-left: 18px;
    }

    .unreleased-work code {
      color: var(--ink);
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.78rem;
    }

    .unreleased-command {
      display: block;
      margin-top: 8px;
      word-break: break-word;
    }

    .release-badge {
      justify-self: end;
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .release-badge.stale {
      color: var(--danger);
    }

    .release-badge.warm {
      color: var(--accent);
    }

    .release-badge.due {
      color: var(--accent);
    }

    .release-badge.fresh {
      color: var(--ok);
    }

    .link-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .export-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 48px;
      border: 1px solid var(--line);
      background: rgba(255, 250, 240, 0.58);
      padding: 0 13px;
      text-decoration: none;
    }

    .export-link span {
      color: var(--muted);
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .agent-list {
      display: grid;
      gap: 12px;
    }

    .agent-row {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) minmax(34px, auto);
      gap: 14px;
      align-items: start;
      padding: 11px 0;
      border-bottom: 1px solid var(--line);
    }

    .agent-mark {
      position: relative;
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
    }

    .agent-icon,
    .agent-fallback {
      width: 38px;
      height: 38px;
      border-radius: 11px;
      background: rgba(31, 26, 20, 0.08);
      border: 1px solid var(--line);
    }

    .agent-icon {
      object-fit: contain;
      padding: 6px;
    }

    .agent-mark [hidden] {
      display: none !important;
    }

    .agent-fallback {
      display: grid;
      place-items: center;
      color: var(--ink);
      font-weight: 800;
      letter-spacing: -0.04em;
    }

    .agent-copy {
      min-width: 0;
    }

    .agent-row strong {
      display: block;
    }

    .agent-row span {
      display: block;
      color: var(--muted);
      font-size: 0.84rem;
    }

    .agent-row small {
      display: block;
      max-width: 100%;
      margin-top: 2px;
      color: var(--muted);
      font-size: 0.8rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .agent-count {
      justify-self: end;
      color: var(--ink) !important;
      font-weight: 700;
    }

    .repo-line {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 90px;
      gap: 14px;
      align-items: center;
      padding: 11px 0;
      border-bottom: 1px solid var(--line);
    }

    .repo-line strong {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .repo-line span {
      color: var(--muted);
      font-size: 0.84rem;
    }

    .health {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }

    .health-block {
      border-top: 4px solid var(--ink);
      padding-top: 16px;
    }

    .health-block.danger {
      border-color: var(--danger);
    }

    .health-number {
      display: block;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 3.4rem;
      line-height: 1;
      letter-spacing: -0.05em;
    }

    .health-word {
      display: block;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(2rem, 4.2vw, 3.4rem);
      line-height: 0.92;
      letter-spacing: -0.06em;
      overflow-wrap: anywhere;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 18px 0;
    }

    input[type="search"] {
      flex: 1 1 260px;
      min-height: 44px;
      border: 1px solid var(--line);
      background: rgba(255, 250, 240, 0.82);
      color: var(--ink);
      padding: 0 14px;
      font: inherit;
      outline: 0;
    }

    label.toggle {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      min-height: 44px;
      color: var(--muted);
      font-size: 0.9rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
    }

    th {
      color: var(--muted);
      font-size: 0.72rem;
      letter-spacing: 0.12em;
      text-align: left;
      text-transform: uppercase;
    }

    th,
    td {
      border-bottom: 1px solid var(--line);
      padding: 12px 10px 12px 0;
      vertical-align: top;
    }

    td.numeric,
    th.numeric {
      text-align: right;
    }

    tbody tr {
      transition: background 160ms ease, transform 160ms ease;
    }

    tbody tr:hover {
      background: rgba(217, 119, 6, 0.08);
    }

    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 0 9px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      font-size: 0.78rem;
      white-space: nowrap;
    }

    .pill.dirty {
      border-color: rgba(180, 35, 24, 0.35);
      color: var(--danger);
    }

    .path {
      color: var(--muted);
      font-size: 0.78rem;
      word-break: break-all;
    }

    .empty {
      color: var(--muted);
      padding: 22px 0;
    }

    @keyframes page-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes rise {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes scale-x {
      from { transform: scaleX(0); }
      to { transform: scaleX(1); }
    }

    @media (max-width: 820px) {
      .shell {
        width: min(100% - 22px, 1180px);
        padding-top: 22px;
      }

      .masthead,
      .grid,
      .health {
        grid-template-columns: 1fr;
      }

      .metrics {
        grid-template-columns: 1fr 1fr;
      }

      .delta-metrics {
        grid-template-columns: 1fr 1fr;
      }

      .link-list {
        grid-template-columns: 1fr;
      }

      .metric:nth-child(2) {
        border-right: 0;
      }

      .bar-row {
        grid-template-columns: 1fr;
        gap: 6px;
      }

      table {
        display: block;
        overflow-x: auto;
        white-space: nowrap;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="masthead">
      <div>
        <p class="eyebrow">Project Watcher</p>
        <h1>Local repo health.</h1>
      </div>
      <div class="masthead-stats">
        ${mastheadStatHtml('7d commits', report.weekly.totals.commits, 'committed in tracked repos')}
        ${mastheadStatHtml('7d churn', report.weekly.totals.additions + report.weekly.totals.deletions, 'added + deleted lines')}
        ${mastheadStatHtml('Active repos', report.weekly.totals.activeRepos, 'with commits this week')}
        ${mastheadStatHtml('Dirty repos', dirtyRepos.length, 'uncommitted local changes')}
      </div>
    </header>

    <div class="metrics">
      ${metricHtml('Repositories', report.totals.repositories)}
      ${metricHtml('Code lines', report.totals.codeLines)}
      ${metricHtml('Files', report.totals.physicalFiles || 0)}
      ${metricHtml('Commits', report.totals.commits)}
    </div>

    <section class="quick-nav" aria-labelledby="quick-links-title">
      <div class="section-title">
        <h2 id="quick-links-title">Quick links</h2>
        <p class="note">jump to dashboard sections</p>
      </div>
      <nav class="quick-links" aria-label="Dashboard sections">
        ${dashboardQuickLinksHtml()}
      </nav>
    </section>

    <div class="grid">
      <section id="release-activity">
        <div class="section-title">
          <h2>Release activity</h2>
          <p class="note">${formatNumber(report.releases?.totals?.tagsLast365Days || 0)} tags in 365d</p>
        </div>
        ${releaseActivityHtml(releases)}
      </section>

      <section id="release-gaps">
        <div class="section-title">
          <h2>Release gaps</h2>
          <p class="note">oldest or missing latest tag last</p>
        </div>
        <div class="repo-list">
          ${releaseGaps.map(releaseGapHtml).join('') || '<p class="empty">No repositories found.</p>'}
        </div>
      </section>
    </div>

    <section id="release-readiness" class="readiness-strip">
      <div class="section-title">
        <h2>Release readiness</h2>
        <p class="note">${formatNumber(report.releaseReadiness?.totals?.needsAttention || 0)} need attention · stale after ${formatNumber(report.releaseReadiness?.thresholds?.staleAfterDays || 0)}d</p>
      </div>
      <div class="repo-list">
        ${releaseReadiness.map(releaseReadinessHtml).join('') || '<p class="empty">No repositories found.</p>'}
      </div>
    </section>

    <section id="since-previous-scan" class="delta-strip">
      <div class="section-title">
        <h2>Since previous scan</h2>
        <p class="note">${report.delta?.available ? `Compared with ${escapeHtml(formatDateTime(report.delta.previousGeneratedAt))}` : escapeHtml(report.delta?.reason || 'No previous comparable snapshot')}</p>
      </div>
      <div class="delta-metrics">
        ${deltaMetricHtml('LOC', report.delta?.totals?.codeLines)}
        ${deltaMetricHtml('Files', report.delta?.totals?.physicalFiles)}
        ${deltaMetricHtml('Commits', report.delta?.totals?.commits)}
        ${deltaMetricHtml('Tags', report.delta?.totals?.tags)}
      </div>
      ${topRepoDeltas.length > 0 ? `<div class="repo-list delta-list">${topRepoDeltas.map(repoDeltaHtml).join('')}</div>` : ''}
    </section>

    <div class="grid">
      <section id="weekly-commits">
        <div class="section-title">
          <h2>Weekly commits</h2>
          <p class="note">last ${formatNumber(report.weekly.trendWeeks)} weeks</p>
        </div>
        <div class="trend">${weeklyCommitsSvg}</div>
      </section>

      <section id="weekly-churn">
        <div class="section-title">
          <h2>Weekly churn</h2>
          <p class="note">${formatNumber(report.weekly.totals.filesChanged)} files touched in 7d</p>
        </div>
        <div class="trend">${weeklyChurnSvg}</div>
      </section>
    </div>

    <div class="grid">
      <section id="contributors">
        <div class="section-title">
          <h2>Contributors</h2>
          <p class="note">${formatNumber(report.contributors?.totals?.uniqueContributors || 0)} unique authors</p>
        </div>
        <div class="repo-list">
          ${topContributors.map(contributorHtml).join('') || '<p class="empty">No contributors found.</p>'}
        </div>
      </section>

      <section id="release-coverage">
        <div class="section-title">
          <h2>Release coverage</h2>
          <p class="note">local tag footprint</p>
        </div>
        <div class="health">
          <div class="health-block">
            <span class="health-number">${formatNumber(report.releases?.totals?.reposWithTags || 0)}</span>
            <p class="note">repositories with tags</p>
          </div>
          <div class="health-block danger">
            <span class="health-number">${formatNumber(report.releases?.totals?.reposWithoutTags || 0)}</span>
            <p class="note">repositories without releases</p>
          </div>
        </div>
      </section>
    </div>

    <div class="grid">
      <section id="active-this-week">
        <div class="section-title">
          <h2>Active this week</h2>
          <p class="note">commits and line churn, last 7 days</p>
        </div>
        <div class="repo-list">
          ${topWeeklyRepos.map(weeklyRepoHtml).join('') || '<p class="empty">No commits in the last 7 days.</p>'}
        </div>
      </section>

      <section id="weekly-totals">
        <div class="section-title">
          <h2>Weekly totals</h2>
          <p class="note">committed changes only</p>
        </div>
        <div class="health">
          <div class="health-block">
            <span class="health-number">${formatNumber(report.weekly.totals.additions)}</span>
            <p class="note">lines added</p>
          </div>
          <div class="health-block danger">
            <span class="health-number">${formatNumber(report.weekly.totals.deletions)}</span>
            <p class="note">lines deleted</p>
          </div>
        </div>
      </section>
    </div>

    <div class="grid">
      <section id="loc-trend">
        <div class="section-title">
          <h2>LOC trend</h2>
          <p class="note">${formatNumber(report.history?.snapshotCount || 1)} snapshots</p>
        </div>
        <div class="trend">${historySvg}</div>
      </section>

      <section id="thirty-day-commits">
        <div class="section-title">
          <h2>30-day commits</h2>
          <p class="note">current scan window</p>
        </div>
        <div class="trend">${commitsSvg}</div>
      </section>
    </div>

    <div class="grid">
      <section id="languages">
        <div class="section-title">
          <h2>Languages</h2>
          <p class="note">by classified code lines</p>
        </div>
        <div class="bars">
          ${topLanguages.map((language) => barRowHtml(language.language, language.codeLines, maxLanguageLoc)).join('')}
        </div>
      </section>

      <section id="file-types">
        <div class="section-title">
          <h2>File types</h2>
          <p class="note">${formatBytes(report.totals.physicalBytes || 0)} after excludes</p>
        </div>
        <div class="bars">
          ${topFileTypes.map((fileType) => fileTypeRowHtml(fileType, maxFileTypeFiles)).join('')}
        </div>
      </section>
    </div>

    <div class="grid">
      <section id="most-active-repositories">
        <div class="section-title">
          <h2>Most active repositories</h2>
          <p class="note">weekly commits, 30d commits, then LOC</p>
        </div>
        <div class="repo-list">
          ${topRepos.map((repo) => repoLineHtml(repo, maxRepoLoc)).join('') || '<p class="empty">No repositories found.</p>'}
        </div>
      </section>

      <section id="attention">
        <div class="section-title">
          <h2>Attention</h2>
          <p class="note">local state only</p>
        </div>
        <div class="health">
          <div class="health-block danger">
            <span class="health-number">${formatNumber(dirtyRepos.length)}</span>
            <p class="note">repositories with uncommitted changes</p>
          </div>
          <div class="health-block">
            <span class="health-number">${formatNumber(staleRepos.length)}</span>
            <p class="note">repositories with no commit in 90+ days</p>
          </div>
        </div>
      </section>
    </div>

    <div class="grid">
      <section id="repository-table">
        <div class="section-title">
          <h2>Repository table</h2>
          <p class="note">filter by name, path, branch, or language</p>
        </div>
        <div class="toolbar">
          <input id="repo-search" type="search" placeholder="Filter repositories">
          <label class="toggle"><input id="dirty-only" type="checkbox"> Dirty only</label>
        </div>
        <table>
          <thead>
            <tr>
              <th>Repo</th>
              <th>Branch</th>
              <th class="numeric">LOC</th>
              <th class="numeric">Commits</th>
              <th class="numeric">30d</th>
              <th class="numeric">Tags</th>
              <th class="numeric">Docs</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="repo-rows">
            ${report.repositories.map(repoTableRowHtml).join('')}
          </tbody>
        </table>
      </section>

      <section id="roots">
        <div class="section-title">
          <h2>Roots</h2>
          <p class="note">configured scan targets</p>
        </div>
        ${report.roots.map((root) => `<p class="path">${escapeHtml(root)}</p>`).join('')}
        <div id="csv-exports" class="section-title" style="margin-top: 32px;">
          <h2>CSV exports</h2>
          <p class="note">spreadsheet-ready files</p>
        </div>
        <div class="link-list">
          ${csvExportLinksHtml()}
        </div>
      </section>
    </div>

    <div class="grid">
      <section id="ai-agents">
        <div class="section-title">
          <h2>AI agents</h2>
          <p class="note">tracked instruction/config files</p>
        </div>
        <div class="agent-list">
          ${topAiAgents.map((agent) => agentRowHtml(agent, maxAgentRepoCount)).join('') || '<p class="empty">No tracked AI agent files detected.</p>'}
        </div>
      </section>

      <section id="agent-coverage">
        <div class="section-title">
          <h2>Agent coverage</h2>
          <p class="note">repo footprint, not telemetry</p>
        </div>
        <div class="health">
          <div class="health-block">
            <span class="health-number">${formatNumber(report.aiAgents?.totals?.reposWithAgents || 0)}</span>
            <p class="note">repos with agent files</p>
          </div>
          <div class="health-block">
            <span class="health-word">${escapeHtml(report.aiAgents?.totals?.topAgent?.name || 'none')}</span>
            <p class="note">most used by repo count</p>
          </div>
        </div>
      </section>
    </div>
  </main>
  <script>
    const search = document.querySelector('#repo-search');
    const dirtyOnly = document.querySelector('#dirty-only');
    const rows = [...document.querySelectorAll('#repo-rows tr')];

    function applyFilters() {
      const query = search.value.trim().toLowerCase();
      const onlyDirty = dirtyOnly.checked;

      for (const row of rows) {
        const matchesQuery = !query || row.dataset.search.includes(query);
        const matchesDirty = !onlyDirty || row.dataset.dirty === 'true';
        row.hidden = !matchesQuery || !matchesDirty;
      }
    }

    search.addEventListener('input', applyFilters);
    dirtyOnly.addEventListener('change', applyFilters);
  </script>
</body>
</html>
`;
}

function metricHtml(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong></div>`;
}

function mastheadStatHtml(label, value, detail, options = {}) {
  const formatted = options.signed ? formatSignedNumber(value) : formatNumber(value);
  return `<div class="masthead-stat"><span>${escapeHtml(label)}</span><strong>${formatted}</strong><small>${escapeHtml(detail)}</small></div>`;
}

function dashboardQuickLinksHtml() {
  const links = [
    ['Release activity', 'release-activity'],
    ['Release gaps', 'release-gaps'],
    ['Release readiness', 'release-readiness'],
    ['Since previous scan', 'since-previous-scan'],
    ['Weekly commits', 'weekly-commits'],
    ['Weekly churn', 'weekly-churn'],
    ['Contributors', 'contributors'],
    ['Release coverage', 'release-coverage'],
    ['Active this week', 'active-this-week'],
    ['Weekly totals', 'weekly-totals'],
    ['LOC trend', 'loc-trend'],
    ['30-day commits', 'thirty-day-commits'],
    ['Languages', 'languages'],
    ['File types', 'file-types'],
    ['Most active repositories', 'most-active-repositories'],
    ['Attention', 'attention'],
    ['Repository table', 'repository-table'],
    ['Roots', 'roots'],
    ['CSV exports', 'csv-exports'],
    ['AI agents', 'ai-agents'],
    ['Agent coverage', 'agent-coverage']
  ];

  return links
    .map(([label, id]) => `<a class="quick-link" href="#${escapeHtml(id)}">${escapeHtml(label)}</a>`)
    .join('');
}

function deltaMetricHtml(label, delta) {
  if (!delta) {
    return `<div class="delta-metric"><span>${escapeHtml(label)}</span><strong>n/a</strong></div>`;
  }

  const className = delta.delta > 0 ? ' positive' : delta.delta < 0 ? ' negative' : '';
  return `<div class="delta-metric${className}"><span>${escapeHtml(label)}</span><strong>${formatSignedNumber(delta.delta)}</strong></div>`;
}

function barRowHtml(label, value, maxValue) {
  const percent = maxValue > 0 ? Math.max(2, Math.round((value / maxValue) * 100)) : 0;
  return `<div class="bar-row"><strong>${escapeHtml(label)}</strong><span class="bar-track"><span class="bar-fill" style="--value: ${percent}"></span></span><span>${formatNumber(value)}</span></div>`;
}

function fileTypeRowHtml(fileType, maxValue) {
  const percent = maxValue > 0 ? Math.max(2, Math.round((fileType.files / maxValue) * 100)) : 0;
  const label = `${fileType.type} · ${formatBytes(fileType.bytes)}`;
  return `<div class="bar-row"><strong>${escapeHtml(fileType.type)}</strong><span class="bar-track"><span class="bar-fill" style="--value: ${percent}"></span></span><span title="${escapeHtml(label)}">${formatNumber(fileType.files)}</span></div>`;
}

function repoLineHtml(repo, maxValue) {
  const percent = maxValue > 0 ? Math.max(2, Math.round((repo.loc.codeLines / maxValue) * 100)) : 0;
  return `<div class="repo-line"><div><strong>${repoLinkHtml(repo)}</strong><span>${escapeHtml(repo.branch || 'unknown branch')} · ${escapeHtml(repo.loc.tool || 'unknown')}</span><span class="bar-track" style="display:block;margin-top:8px;"><span class="bar-fill" style="--value: ${percent}"></span></span></div><span>${formatNumber(repo.loc.codeLines)}</span></div>`;
}

function agentRowHtml(agent, maxValue) {
  const percent = maxValue > 0 ? Math.max(2, Math.round((agent.repoCount / maxValue) * 100)) : 0;
  const repos = agent.repositories.map((repo) => repo.name).join(', ');
  return `<div class="agent-row">
    ${agentIconHtml(agent)}
    <div class="agent-copy">
      <strong>${escapeHtml(agent.name)}</strong>
      <span>${formatNumber(agent.repoCount)} repos · ${formatNumber(agent.signalCount)} signals</span>
      <small title="${escapeHtml(repos)}">${escapeHtml(repos)}</small>
      <span class="bar-track" style="display:block;margin-top:8px;"><span class="bar-fill" style="--value: ${percent}"></span></span>
    </div>
    <span class="agent-count">${formatNumber(agent.repoCount)}</span>
  </div>`;
}

function agentIconHtml(agent) {
  const visibleFallback = `<span class="agent-fallback">${escapeHtml(agent.fallback || agent.name.slice(0, 1))}</span>`;
  if (!agent.iconUrl) {
    return `<span class="agent-mark">${visibleFallback}</span>`;
  }

  const hiddenFallback = `<span class="agent-fallback" hidden>${escapeHtml(agent.fallback || agent.name.slice(0, 1))}</span>`;
  return `<span class="agent-mark"><img class="agent-icon" src="${escapeHtml(agent.iconUrl)}" alt="${escapeHtml(agent.name)} icon" referrerpolicy="no-referrer" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">${hiddenFallback}</span>`;
}

function repoDeltaHtml(repo) {
  const pieces = [
    `LOC ${formatSignedNumber(repo.codeLines.delta)}`,
    `files ${formatSignedNumber(repo.physicalFiles.delta)}`,
    `commits ${formatSignedNumber(repo.commits.delta)}`
  ];

  return `<div class="repo-line"><div><strong>${repoLinkHtml(repo)}</strong><span>${escapeHtml(pieces.join(' · '))}</span></div><span>${formatSignedNumber(repo.tags.delta)} tags</span></div>`;
}

function weeklyRepoHtml(repo) {
  const churn = repo.additions + repo.deletions;
  const pieces = [
    `${formatNumber(repo.commits)} commits`,
    `${formatNumber(churn)} churn`,
    `${formatNumber(repo.filesChanged)} files`
  ];

  return `<div class="repo-line"><div><strong>${repoLinkHtml(repo)}</strong><span>${escapeHtml(pieces.join(' · '))}</span></div><span>${formatSignedNumber(repo.netLines)} net</span></div>`;
}

function releaseActivityHtml(releases) {
  if (releases.length === 0) {
    return '<div class="repo-list"><p class="empty">No local tags found.</p></div>';
  }

  const visible = releases.slice(0, 5);
  const overflow = releases.slice(5);

  return `<div class="repo-list">
    ${visible.map(releaseHtml).join('')}
    ${overflow.length > 0 ? `<details class="release-overflow">
      <summary>Show ${formatNumber(overflow.length)} older releases</summary>
      <div class="repo-list">${overflow.map(releaseHtml).join('')}</div>
    </details>` : ''}
  </div>`;
}

function releaseHtml(release) {
  const pieces = [
    release.name,
    release.date ? formatDateTime(release.date) : 'unknown date',
    release.semver ? 'SemVer' : 'tag'
  ];

  return `<div class="release-row"><div><strong class="release-project">${releaseProjectHtml({ name: release.repo, detailPath: release.detailPath, changelog: release.changelog })}</strong><span class="release-meta">${escapeHtml(pieces.join(' · '))}</span></div><span class="release-badge">${release.semver ? 'release' : 'tag'}</span></div>`;
}

function releaseGapRows(repositories) {
  return repositories
    .map((repo) => {
      const latestTag = repo.releases?.latestTag || null;
      const days = latestTag?.date ? daysSince(latestTag.date) : null;
      return {
        name: repo.name,
        detailPath: repo.detailPath,
        changelog: repo.changelog || null,
        tags: repo.releases?.tags || 0,
        latestTag,
        days
      };
    })
    .sort((a, b) => releaseGapRank(a) - releaseGapRank(b) || a.name.localeCompare(b.name));
}

function releaseGapRank(row) {
  if (!row.latestTag) {
    return Number.POSITIVE_INFINITY;
  }

  if (row.days === null) {
    return Number.MAX_SAFE_INTEGER;
  }

  return row.days;
}

function releaseGapHtml(row) {
  const project = releaseProjectHtml(row);
  if (!row.latestTag) {
    return `<div class="release-row"><div><strong class="release-project">${project}</strong><span class="release-meta">No local tags found</span></div><span class="release-badge stale">never</span></div>`;
  }

  const label = row.days === null ? 'unknown' : `${formatNumber(row.days)}d`;
  const badgeClass = row.days === null || row.days >= 180
    ? 'stale'
    : row.days >= 60
      ? 'warm'
      : 'fresh';
  const meta = [
    row.latestTag.name,
    row.latestTag.date ? formatDateTime(row.latestTag.date) : 'unknown date',
    `${formatNumber(row.tags)} total tags`
  ];

  return `<div class="release-row"><div><strong class="release-project">${project}</strong><span class="release-meta">${escapeHtml(meta.join(' · '))}</span></div><span class="release-badge ${badgeClass}">${escapeHtml(label)}</span></div>`;
}

function releaseReadinessHtml(row) {
  const project = releaseProjectHtml(row);
  const age = row.daysSinceLatestTag === null ? 'never released' : `${formatNumber(row.daysSinceLatestTag)}d since release`;
  const meta = [
    row.latestTag?.name || 'no tag',
    age,
    `${formatNumber(row.commitsSinceLatestTag)} commits since tag`,
    `${formatNumber(row.filesChangedSinceLatestTag)} files changed`,
    row.changelogFound ? 'changelog' : 'no changelog',
    row.isDirty ? `${formatNumber(row.dirtyFileCount)} dirty` : 'clean'
  ];

  return `<div class="release-row"><div><strong class="release-project">${project}</strong><span class="release-meta">${escapeHtml(meta.join(' · '))}</span>${unreleasedWorkHtml(row)}</div><span class="release-badge ${readinessBadgeClass(row.status)}">${escapeHtml(row.status)}</span></div>`;
}

function unreleasedWorkHtml(row) {
  const work = row.unreleasedWork || {};
  const commits = work.commits || [];
  if (commits.length === 0) {
    return '';
  }

  const changedFiles = work.changedFiles || [];
  const authors = work.authors || [];
  const commitItems = commits.slice(0, 3).map((commit) => (
    `<li><code>${escapeHtml(commit.shortHash)}</code> ${escapeHtml(commit.subject)} <span class="release-meta">${escapeHtml(commit.author || 'unknown author')}</span></li>`
  )).join('');
  const fileItems = changedFiles.slice(0, 3).map((file) => (
    `<li><code>${escapeHtml(file.path)}</code> ${formatSignedNumber(file.additions)} / -${formatNumber(file.deletions)}</li>`
  )).join('');
  const authorSummary = authors.slice(0, 3).map((author) => `${author.name} ${formatNumber(author.commits)}`).join(' · ');

  return `<details class="unreleased-work">
    <summary>Unreleased work</summary>
    <ul>${commitItems}</ul>
    ${changedFiles.length > 0 ? `<ul>${fileItems}</ul>` : ''}
    ${authorSummary ? `<span class="release-meta">${escapeHtml(authorSummary)}</span>` : ''}
    ${work.command ? `<code class="unreleased-command">${escapeHtml(work.command)}</code>` : ''}
  </details>`;
}

function readinessBadgeClass(status) {
  if (status === 'stale') {
    return 'stale';
  }

  if (status === 'release due') {
    return 'due';
  }

  if (status === 'watch') {
    return 'warm';
  }

  return 'fresh';
}

function releaseProjectHtml(repo) {
  const project = repoLinkHtml(repo);
  if (!repo.changelog?.detailPath) {
    return project;
  }

  return `${project} <a class="release-changelog" href="./${escapeHtml(repo.changelog.detailPath)}">(changelog.md)</a>`;
}

function contributorHtml(contributor) {
  const topRepos = contributor.repositories
    .slice(0, 3)
    .map((repo) => `${repo.name} ${formatNumber(repo.commits)}`)
    .join(' · ');

  return `<div class="repo-line"><div><strong>${escapeHtml(contributor.name)}</strong><span>${escapeHtml(topRepos)}</span></div><span>${formatNumber(contributor.commits)}</span></div>`;
}

function csvExportLinksHtml() {
  const links = [
    ['Repos', './csv/repositories.csv'],
    ['Languages', './csv/languages.csv'],
    ['File types', './csv/file-types.csv'],
    ['Weekly', './csv/weekly-repositories.csv'],
    ['Agents', './csv/ai-agents.csv'],
    ['Releases', './csv/releases.csv'],
    ['Unreleased', './csv/unreleased-work.csv'],
    ['Contributors', './csv/contributors.csv'],
    ['JSON', './report.json'],
    ['Markdown', './report.md']
  ];

  return links.map(([label, href]) => `<a class="export-link" href="${href}"><strong>${escapeHtml(label)}</strong><span>open</span></a>`).join('');
}

function repoLinkHtml(repo) {
  if (!repo.detailPath) {
    return escapeHtml(repo.name);
  }

  return `<a href="./${escapeHtml(repo.detailPath)}">${escapeHtml(repo.name)}</a>`;
}

function relativeReportPath(fromPath, toPath) {
  const relative = path.posix.relative(path.posix.dirname(fromPath), toPath);
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function repoTableRowHtml(repo) {
  const languages = repo.loc.byLanguage.slice(0, 4).map((language) => language.language).join(' ');
  const docs = repo.docs?.files || [];
  const search = [repo.name, repo.path, repo.branch, languages, docs.map((doc) => `${doc.path} ${doc.title}`).join(' ')].join(' ').toLowerCase();
  const status = repo.isDirty
    ? `<span class="pill dirty">${formatNumber(repo.dirtyFileCount)} dirty</span>`
    : '<span class="pill">clean</span>';
  const docsCount = repo.docs?.markdownFiles || 0;
  const docsCell = docsCount > 0 && repo.detailPath
    ? `<a href="./${escapeHtml(repo.detailPath)}#docs">${formatNumber(docsCount)}</a>`
    : formatNumber(docsCount);

  return `<tr data-search="${escapeHtml(search)}" data-dirty="${repo.isDirty ? 'true' : 'false'}">
    <td><strong>${repoLinkHtml(repo)}</strong><div class="path">${escapeHtml(repo.path)}</div></td>
    <td>${escapeHtml(repo.branch || '')}</td>
    <td class="numeric">${formatNumber(repo.loc.codeLines)}</td>
    <td class="numeric">${formatNumber(repo.commits.total)}</td>
    <td class="numeric">${formatNumber(repo.commits.last30Days)}</td>
    <td class="numeric">${formatNumber(repo.releases.tags)}</td>
    <td class="numeric">${docsCell}</td>
    <td>${status}</td>
  </tr>`;
}

function sparkline(items, key, width, height, color) {
  if (items.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="No trend data"><text x="24" y="${height / 2}" fill="#766b5d">No trend data yet</text></svg>`;
  }

  const padding = 20;
  const values = items.map((item) => numberOrZero(item[key]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = items.length === 1 ? width / 2 : padding + (index / (items.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return [x, y];
  });
  const polyline = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${padding},${height - padding} ${polyline} ${width - padding},${height - padding}`;
  const last = points.at(-1);

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(key)} trend">
    <defs>
      <linearGradient id="area-${escapeHtml(key)}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.26"></stop>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="rgba(31,26,20,0.20)"></line>
    <polygon points="${area}" fill="url(#area-${escapeHtml(key)})"></polygon>
    <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    <circle cx="${last[0].toFixed(2)}" cy="${last[1].toFixed(2)}" r="6" fill="${color}"></circle>
    <text x="${padding}" y="22" fill="#766b5d" font-size="14">${formatNumber(values[0])}</text>
    <text x="${width - padding}" y="22" fill="#1f1a14" font-size="14" text-anchor="end">${formatNumber(values.at(-1))}</text>
  </svg>`;
}

function git(repoPath, args) {
  const result = spawnSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.status !== 0) {
    return '';
  }

  return result.stdout.trim();
}

function gitRaw(repoPath, args) {
  const result = spawnSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024
  });

  if (result.status !== 0) {
    return '';
  }

  return result.stdout;
}

function gitStatus(cwd, args) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'ignore'
  }).status;
}

function listFromGit(repoPath, args) {
  const output = git(repoPath, args);
  return output ? output.split('\n').filter(Boolean) : [];
}

function listTrackedFiles(repoPath) {
  const result = spawnSync('git', ['-C', repoPath, 'ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.status !== 0 || !result.stdout) {
    return [];
  }

  return result.stdout.split('\0').filter(Boolean);
}

function numberFromGit(repoPath, args) {
  const output = git(repoPath, args);
  const parsed = Number.parseInt(output, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    stdio: 'ignore'
  });

  return !result.error;
}

function regexUnion(values) {
  const cleaned = values.filter(Boolean);
  if (cleaned.length === 0) {
    return '';
  }

  return `^(${cleaned.map(escapeRegExp).join('|')})$`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(text)) {
    return text;
  }

  return `'${text.replace(/'/g, "'\\''")}'`;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sortLocLanguages(a, b) {
  return b.codeLines - a.codeLines || a.language.localeCompare(b.language);
}

function sortFileTypes(a, b) {
  return b.files - a.files || b.bytes - a.bytes || a.type.localeCompare(b.type);
}

function sortReleaseRows(a, b) {
  const aTime = Date.parse(a.date || '');
  const bTime = Date.parse(b.date || '');
  const aRank = Number.isFinite(aTime) ? aTime : 0;
  const bRank = Number.isFinite(bTime) ? bTime : 0;
  return bRank - aRank || a.repo.localeCompare(b.repo) || compareTagNamesDesc(a.name, b.name);
}

function sortTagRows(a, b) {
  const aTime = Date.parse(a.date || '');
  const bTime = Date.parse(b.date || '');
  const aRank = Number.isFinite(aTime) ? aTime : 0;
  const bRank = Number.isFinite(bTime) ? bTime : 0;
  return bRank - aRank || compareTagNamesDesc(a.name, b.name);
}

function compareTagNamesDesc(a, b) {
  const aSemver = semverParts(a);
  const bSemver = semverParts(b);

  if (aSemver && bSemver) {
    for (let index = 0; index < aSemver.length; index += 1) {
      if (aSemver[index] !== bSemver[index]) {
        return bSemver[index] - aSemver[index];
      }
    }
  } else if (aSemver || bSemver) {
    return aSemver ? -1 : 1;
  }

  return String(b).localeCompare(String(a), undefined, { numeric: true, sensitivity: 'base' });
}

function semverParts(value) {
  const match = String(value).match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return match.slice(1).map((part) => Number.parseInt(part, 10));
}

function assignRepositoryDetailPaths(repositories) {
  const used = new Set();

  for (const repo of repositories) {
    const base = slugify(repo.name) || 'repository';
    let slug = base;

    if (used.has(slug)) {
      slug = `${base}-${shortHash(repo.path)}`;
    }

    while (used.has(slug)) {
      slug = `${base}-${shortHash(`${repo.path}-${used.size}`)}`;
    }

    used.add(slug);
    repo.detailPath = `repos/${slug}.html`;
  }
}

function assignRepositoryDocPaths(repositories) {
  for (const repo of repositories) {
    const files = repo.docs?.files || [];
    if (files.length === 0 || !repo.detailPath) {
      continue;
    }

    const repoSlug = path.posix.basename(repo.detailPath, '.html');
    const used = new Set();

    for (const file of files) {
      const withoutRoot = file.path.replace(/^docs\//, '').replace(/\.[^.]+$/, '');
      const segments = withoutRoot
        .split('/')
        .map((segment) => slugify(segment) || 'doc');
      const basePath = segments.join('/') || 'doc';
      let detailPath = `repos/${repoSlug}/docs/${basePath}.html`;

      if (used.has(detailPath)) {
        detailPath = `repos/${repoSlug}/docs/${basePath}-${shortHash(file.path)}.html`;
      }

      used.add(detailPath);
      file.detailPath = detailPath;
    }

    repo.docs.indexPath = files[0]?.detailPath || null;
  }
}

function assignRepositoryChangelogPaths(repositories) {
  for (const repo of repositories) {
    if (!repo.changelog || !repo.detailPath) {
      continue;
    }

    const matchingDoc = (repo.docs?.files || []).find((doc) => doc.path === repo.changelog.path);
    if (matchingDoc?.detailPath) {
      Object.assign(matchingDoc, repo.changelog, {
        detailPath: matchingDoc.detailPath,
        kind: 'changelog'
      });
      repo.changelog = matchingDoc;
      continue;
    }

    const repoSlug = path.posix.basename(repo.detailPath, '.html');
    repo.changelog.detailPath = `repos/${repoSlug}/changelog.html`;
  }
}

function sortRepositoriesByActivity(a, b) {
  return (b.commits.last7Days || 0) - (a.commits.last7Days || 0)
    || (b.commits.last30Days || 0) - (a.commits.last30Days || 0)
    || (b.commits.last90Days || 0) - (a.commits.last90Days || 0)
    || (b.commits.total || 0) - (a.commits.total || 0)
    || (b.loc.codeLines || 0) - (a.loc.codeLines || 0)
    || a.name.localeCompare(b.name)
    || a.path.localeCompare(b.path);
}

function fileTypeFor(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension) {
    return extension;
  }

  if (fileName.startsWith('.')) {
    return fileName;
  }

  if (LANGUAGE_BY_FILENAME.has(fileName)) {
    return fileName;
  }

  return '[no extension]';
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function shortHash(value) {
  let hash = 5381;

  for (const character of String(value)) {
    hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
  }

  return (hash >>> 0).toString(36).slice(0, 6);
}

function shouldIncludeRelativePath(relativePath, config) {
  const parts = relativePath.split(/[\\/]+/).filter(Boolean);
  const fileName = parts.at(-1);

  if (!fileName || config.excludeFiles.has(fileName)) {
    return false;
  }

  return parts.slice(0, -1).every((part) => !config.excludeDirs.has(part));
}

function safeTimestamp(timestamp) {
  return timestamp.replace(/[:.]/g, '-').replace(/[^0-9A-Za-z-]/g, '-');
}

function daysSince(dateString) {
  const time = Date.parse(dateString);
  if (!Number.isFinite(time)) {
    return 0;
  }

  return Math.floor((Date.now() - time) / 86400000);
}

function countTagsSince(tags, days) {
  const cutoff = Date.now() - days * 86400000;
  return tags.filter((tag) => {
    const time = Date.parse(tag.date || '');
    return Number.isFinite(time) && time >= cutoff;
  }).length;
}

function startOfWeekUTC(date) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = result.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  result.setUTCDate(result.getUTCDate() - mondayOffset);
  return result;
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveStaticPath(root, pathname) {
  const rootPath = path.resolve(root);
  const requested = decodeURIComponent(pathname === '/' ? '/report.html' : pathname);
  const filePath = path.resolve(rootPath, requested.replace(/^\/+/, ''));

  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${path.sep}`)) {
    return null;
  }

  return filePath;
}

function normalizeReportPath(value) {
  return String(value).replace(/\\/g, '/');
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
  };

  return types[extension] || 'application/octet-stream';
}

function openUrl(url) {
  const opener = process.platform === 'darwin'
    ? { command: 'open', args: [url] }
    : process.platform === 'win32'
      ? { command: 'cmd', args: ['/c', 'start', '', url] }
      : { command: 'xdg-open', args: [url] };

  const result = spawnSync(opener.command, opener.args, {
    detached: true,
    stdio: 'ignore'
  });

  if (result.error) {
    console.warn(`Could not open browser automatically: ${result.error.message}`);
  }
}

function resolvePath(value, baseDir) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Path values must be non-empty strings');
  }

  const expanded = value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value;
  return path.resolve(baseDir, expanded);
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatHours(value) {
  if (value >= 1) {
    return `${Number.isInteger(value) ? value : trimFixed(value, 2)}h`;
  }

  const minutes = value * 60;
  if (minutes >= 1) {
    return `${trimFixed(minutes, 1)}m`;
  }

  return `${trimFixed(value * 3600, 3)}s`;
}

function trimFixed(value, digits) {
  return value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
}

function formatSignedNumber(value) {
  const number = numberOrZero(value);
  if (number > 0) {
    return `+${formatNumber(number)}`;
  }

  return formatNumber(number);
}

function formatBytes(value) {
  const bytes = numberOrZero(value);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${bytes} B`;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function markdownCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function printHelp() {
  console.log(`Project Watcher

Usage:
  node ./src/cli.js scan [--config path] [--json]
  node ./src/cli.js doctor [--config path]
  node ./src/cli.js serve [--config path] [--host host] [--port port] [--open]
                    [--scan-interval-hours hours] [--no-auto-scan]
  node ./src/cli.js init [path]
  node ./src/cli.js help

Config:
  The config file must include a "paths" array. Each path can be a Git repo or
  a parent directory containing Git repos. LOC uses locTool: auto by default.
  Serve mode runs an immediate scan and rescans every 12h by default.
`);
}

main();
