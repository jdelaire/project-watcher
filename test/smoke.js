import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
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
assert(html.includes('CSV exports'), 'expected csv export section');
assert(html.includes('Contributors'), 'expected contributor section');
assert(html.includes('href="./repos/'), 'expected repository drilldown links');
assert(html.includes('./assets/agents/claude.svg'), 'expected local Claude icon');
assert(html.indexOf('<h2>AI agents</h2>') > html.indexOf('<h2>CSV exports</h2>'), 'expected AI agents near bottom');
assert(!html.includes('<strong>Config</strong>'), 'expected config path hidden from masthead');
assert(repoDetailHtml.includes('Repository state'), 'expected repo drilldown state section');
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

runScan(configPath);
snapshots = await fsp.readdir(path.join(outputDir, 'snapshots'));
assert(snapshots.length === 2, 'expected snapshot retention to keep two snapshots');

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
