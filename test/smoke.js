import { spawn, spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'project-watcher-'));
const repoPath = path.join(tempRoot, 'example-repo');
const configPath = path.join(tempRoot, 'config.json');
const outputDir = path.join(tempRoot, 'reports');

await fsp.mkdir(repoPath, { recursive: true });
run('git', ['init'], repoPath);
run('git', ['config', 'user.email', 'smoke@example.com'], repoPath);
run('git', ['config', 'user.name', 'Smoke Test'], repoPath);
await fsp.writeFile(path.join(repoPath, 'index.js'), 'const value = 1;\n\nconsole.log(value);\n', 'utf8');
await fsp.writeFile(path.join(repoPath, 'CLAUDE.md'), '', 'utf8');
await fsp.writeFile(path.join(repoPath, 'AGENTS.md'), '', 'utf8');
run('git', ['add', '.'], repoPath);
run('git', ['commit', '-m', 'Initial commit'], repoPath);
run('git', ['tag', 'v0.1.0'], repoPath);
await fsp.writeFile(path.join(repoPath, 'untracked.js'), 'console.log("local junk");\n', 'utf8');
await fsp.writeFile(path.join(repoPath, 'CHANGELOG.md'), '# Changelog\n\n## v0.1.0\n\nInitial release.\n', 'utf8');
await fsp.mkdir(path.join(repoPath, 'docs', 'guides'), { recursive: true });
await fsp.writeFile(path.join(repoPath, 'docs', 'README.md'), '# Docs\n\nOpen [Setup](guides/setup.md).\n', 'utf8');
await fsp.writeFile(path.join(repoPath, 'docs', 'guides', 'setup.md'), '## Setup\n\nRun `project-watcher`.\n', 'utf8');

await fsp.writeFile(
  configPath,
  JSON.stringify(
    {
      paths: [tempRoot],
      maxDepth: 2,
      outputDir,
      excludeDirs: ['.git', 'node_modules'],
      excludeFiles: [],
      maxFileBytes: 1048576,
      locTool: 'auto',
      countDuplicateFiles: false,
      fileScope: 'tracked',
      maxSnapshots: 2
    },
    null,
    2
  ),
  'utf8'
);

runDoctor(configPath);
runScan(configPath);

let report = JSON.parse(await fsp.readFile(path.join(outputDir, 'report.json'), 'utf8'));
const html = await fsp.readFile(path.join(outputDir, 'report.html'), 'utf8');
const repoDetailHtml = await fsp.readFile(path.join(outputDir, report.repositories[0].detailPath), 'utf8');
const setupDoc = report.repositories[0].docs.files.find((doc) => doc.path === 'docs/guides/setup.md');
const docsReadme = report.repositories[0].docs.files.find((doc) => doc.path === 'docs/README.md');
const setupDocHtml = await fsp.readFile(path.join(outputDir, setupDoc.detailPath), 'utf8');
const docsReadmeHtml = await fsp.readFile(path.join(outputDir, docsReadme.detailPath), 'utf8');
const changelogHtml = await fsp.readFile(path.join(outputDir, report.repositories[0].changelog.detailPath), 'utf8');
const favicon = await fsp.readFile(path.join(outputDir, 'assets', 'favicon.svg'), 'utf8');
const claudeIcon = await fsp.readFile(path.join(outputDir, 'assets', 'agents', 'claude.svg'), 'utf8');
const manifest = JSON.parse(await fsp.readFile(path.join(outputDir, 'assets', 'manifest.webmanifest'), 'utf8'));
const robots = await fsp.readFile(path.join(outputDir, 'robots.txt'), 'utf8');
const repositoriesCsv = await fsp.readFile(path.join(outputDir, 'csv', 'repositories.csv'), 'utf8');
const releasesCsv = await fsp.readFile(path.join(outputDir, 'csv', 'releases.csv'), 'utf8');
const contributorsCsv = await fsp.readFile(path.join(outputDir, 'csv', 'contributors.csv'), 'utf8');
let snapshots = await fsp.readdir(path.join(outputDir, 'snapshots'));

assert(report.totals.repositories === 1, 'expected one repository');
assert(report.totals.codeLines === 2, 'expected two code lines');
assert(report.totals.physicalFiles === 3, 'expected three physical files');
assert(report.totals.tags === 1, 'expected one tag');
assert(report.totals.docsRepositories === 1, 'expected one repo with docs');
assert(report.totals.docsMarkdownFiles === 2, 'expected two Markdown docs');
assert(report.totals.commitsLast7Days === 1, 'expected one recent commit');
assert(report.releases.totals.tagsLast365Days === 1, 'expected one tag in last year');
assert(report.releases.latest[0].name === 'v0.1.0', 'expected latest release tag');
assert(report.contributors.totals.uniqueContributors === 1, 'expected one contributor');
assert(report.contributors.contributors[0].name === 'Smoke Test', 'expected contributor name');
assert(report.weekly.totals.commits === 1, 'expected one weekly commit');
assert(report.weekly.totals.activeRepos === 1, 'expected one weekly active repo');
assert(report.history.snapshotCount === 1, 'expected one historical snapshot');
assert(report.fileTypes.some((item) => item.type === '.js' && item.files === 1), 'expected js filetype stats');
assert(report.repositories[0].fileTypes.byType.some((item) => item.type === '.js'), 'expected repo filetype stats');
assert(report.aiAgents.totals.agentsDetected === 2, 'expected two detected ai agents');
assert(report.aiAgents.totals.reposWithAgents === 1, 'expected one repo with ai agent files');
assert(report.aiAgents.agents.some((agent) => agent.id === 'claude'), 'expected Claude detection');
assert(report.aiAgents.agents.some((agent) => agent.id === 'codex'), 'expected Codex detection');
assert(report.repositories[0].docs.markdownFiles === 2, 'expected repo docs stats');
assert(setupDoc.detailPath.endsWith('.html'), 'expected docs detail page path');
assert(report.repositories[0].changelog.path === 'CHANGELOG.md', 'expected top-level changelog detection');
assert(report.repositories[0].changelog.detailPath.endsWith('/changelog.html'), 'expected changelog detail path');
assert(report.repositories[0].loc.tool, 'expected loc tool name');
assert(report.repositories[0].loc.duplicatePolicy, 'expected duplicate policy');
assert(report.repositories[0].loc.fileScope === 'tracked', 'expected tracked file scope');
assert(report.repositories[0].commits.total === 1, 'expected one commit');
assert(html.includes('Local repo health'), 'expected dashboard html');
assert(html.includes('name="description"'), 'expected description meta');
assert(html.includes('rel="icon"'), 'expected favicon link');
assert(html.includes('rel="manifest"'), 'expected manifest link');
assert(html.includes('Dirty repos'), 'expected useful masthead stats');
assert(html.includes('Release activity'), 'expected release section');
assert(html.includes('Release gaps'), 'expected release gap overview');
assert(html.includes('class="release-project"'), 'expected prominent release project names');
assert(html.includes('class="release-changelog"'), 'expected changelog link in release section');
assert(html.includes('(changelog.md)'), 'expected changelog label in release section');
assert(!html.includes('<details class="release-overflow">'), 'expected no collapsed releases when only five or fewer releases exist');
assert(html.includes('CSV exports'), 'expected csv export section');
assert(html.includes('<th class="numeric">Docs</th>'), 'expected docs table column');
assert(html.includes('Contributors'), 'expected contributor section');
assert(html.includes('href="./repos/'), 'expected repository drilldown links');
assert(html.includes('./assets/agents/claude.svg'), 'expected local Claude icon');
assert(html.indexOf('<h2>AI agents</h2>') > html.indexOf('<h2>CSV exports</h2>'), 'expected AI agents near bottom');
assert(!html.includes('<strong>Config</strong>'), 'expected config path hidden from masthead');
assert(repoDetailHtml.includes('Repository state'), 'expected repo drilldown state section');
assert(repoDetailHtml.includes('Docs</h2>'), 'expected repo drilldown docs section');
assert(repoDetailHtml.includes('docs/guides/setup.md'), 'expected docs tree links');
assert(setupDocHtml.includes('Run <code>project-watcher</code>.'), 'expected rendered Markdown doc page');
assert(docsReadmeHtml.includes('href="./guides/setup.html"'), 'expected Markdown links rewritten to generated docs pages');
assert(changelogHtml.includes('Initial release.'), 'expected rendered changelog page');
assert(repoDetailHtml.includes('Scan details'), 'expected repo drilldown scan section');
assert(favicon.includes('<svg'), 'expected svg favicon');
assert(claudeIcon.includes('<svg'), 'expected Claude svg asset');
assert(manifest.name === 'Project Watcher', 'expected web manifest');
assert(robots.includes('Disallow: /'), 'expected robots privacy default');
assert(repositoriesCsv.includes('name,path,remoteUrl'), 'expected repositories csv');
assert(releasesCsv.includes('v0.1.0'), 'expected releases csv');
assert(contributorsCsv.includes('Smoke Test'), 'expected contributors csv');
assert(snapshots.length === 1, 'expected one snapshot file');
assert(report.delta.available === false, 'expected no delta for first scan');

await fsp.appendFile(path.join(repoPath, 'index.js'), 'console.log("tracked change");\n', 'utf8');
run('git', ['add', 'index.js'], repoPath);
run('git', ['commit', '-m', 'Add tracked change'], repoPath);
runScan(configPath);

report = JSON.parse(await fsp.readFile(path.join(outputDir, 'report.json'), 'utf8'));
snapshots = await fsp.readdir(path.join(outputDir, 'snapshots'));

assert(report.history.snapshotCount === 2, 'expected two historical snapshots');
assert(snapshots.length === 2, 'expected two snapshot files');
assert(report.delta.available === true, 'expected delta for second scan');
assert(report.delta.totals.codeLines.delta === 1, 'expected one code line delta');
assert(report.delta.totals.commits.delta === 1, 'expected one commit delta');
assert(report.weekly.totals.commits === 2, 'expected two weekly commits after second commit');
assert(report.weekly.topRepositories[0].commits === 2, 'expected top weekly repo commits');

const unreleasedRepoPath = path.join(tempRoot, 'unreleased-repo');
await fsp.mkdir(unreleasedRepoPath, { recursive: true });
run('git', ['init'], unreleasedRepoPath);
run('git', ['config', 'user.email', 'smoke@example.com'], unreleasedRepoPath);
run('git', ['config', 'user.name', 'Smoke Test'], unreleasedRepoPath);
await fsp.writeFile(path.join(unreleasedRepoPath, 'README.md'), '# Unreleased\n', 'utf8');
run('git', ['add', '.'], unreleasedRepoPath);
run('git', ['commit', '-m', 'Initial commit'], unreleasedRepoPath);

for (let index = 1; index <= 5; index += 1) {
  run('git', ['tag', `v0.1.${index}`], repoPath);
}

runScan(configPath);
report = JSON.parse(await fsp.readFile(path.join(outputDir, 'report.json'), 'utf8'));
const releaseHtml = await fsp.readFile(path.join(outputDir, 'report.html'), 'utf8');
snapshots = await fsp.readdir(path.join(outputDir, 'snapshots'));

assert(snapshots.length === 2, 'expected snapshot retention to keep two snapshots');
assert(report.releases.latest.length === 6, 'expected six release tags');
assert(report.releases.latest[0].name === 'v0.1.5', 'expected semver tie sort to show newest tag name first');
assert(releaseHtml.includes('<details class="release-overflow">'), 'expected collapsed release overflow');
assert(releaseHtml.includes('Show 1 older releases'), 'expected one collapsed release');
assert(releaseHtml.includes('unreleased-repo'), 'expected unreleased repo in release gaps');
assert(releaseHtml.includes('<span class="release-badge stale">never</span>'), 'expected never release badge');
assert(releaseHtml.indexOf('example-repo</a></strong><span class="release-meta">v0.1.5') < releaseHtml.indexOf('unreleased-repo'), 'expected oldest or never releases last in release gaps');

const servePort = await getFreePort();
const server = spawn(process.execPath, [
  path.resolve('src/cli.js'),
  'serve',
  '--config',
  configPath,
  '--host',
  '127.0.0.1',
  '--port',
  String(servePort),
  '--scan-interval-hours',
  '0.00003'
], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe']
});
const serverOutput = collectOutput(server);

try {
  await waitForOutput(server, serverOutput, 'Auto-scan:', 'expected serve mode to start auto-scan');
  run('git', ['tag', 'v0.1.6'], repoPath);
  await waitForReport(outputDir, (latestReport) => (
    latestReport.releases.latest.some((release) => release.name === 'v0.1.6')
  ), 'expected scheduled serve scan to refresh releases');
} finally {
  await stopProcess(server);
}

console.log('Smoke test passed');

function runDoctor(configPath) {
  const doctor = spawnSync(process.execPath, [path.resolve('src/cli.js'), 'doctor', '--config', configPath], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  if (doctor.status !== 0) {
    console.error(doctor.stdout);
    console.error(doctor.stderr);
    process.exit(doctor.status ?? 1);
  }
}

function runScan(configPath) {
  const scan = spawnSync(process.execPath, [path.resolve('src/cli.js'), 'scan', '--config', configPath], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  if (scan.status !== 0) {
    console.error(scan.stdout);
    console.error(scan.stderr);
    process.exit(scan.status ?? 1);
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

function collectOutput(child) {
  const output = { value: '' };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output.value += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output.value += chunk;
  });
  return output;
}

async function getFreePort() {
  const server = net.createServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  await new Promise((resolve) => server.close(resolve));

  if (!address || typeof address === 'string') {
    throw new Error('Could not allocate a free port');
  }

  return address.port;
}

async function waitForOutput(child, output, marker, message) {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    if (output.value.includes(marker)) {
      return;
    }

    if (child.exitCode !== null) {
      throw new Error(`${message}\n${output.value}`);
    }

    await sleep(50);
  }

  throw new Error(`${message}\n${output.value}`);
}

async function waitForReport(outputDir, predicate, message) {
  const deadline = Date.now() + 7000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const latestReport = JSON.parse(await fsp.readFile(path.join(outputDir, 'report.json'), 'utf8'));
      if (predicate(latestReport)) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(100);
  }

  throw new Error(lastError ? `${message}: ${lastError.message}` : message);
}

async function stopProcess(child) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(2000).then(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    })
  ]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
