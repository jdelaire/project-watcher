# Project Watcher

[![CI](https://github.com/jdelaire/project-watcher/actions/workflows/ci.yml/badge.svg)](https://github.com/jdelaire/project-watcher/actions/workflows/ci.yml)

Local reporting for Git repositories on your machine.

The tool reads a config file containing project directories, discovers Git repositories, collects Git and line-count metrics, then writes JSON, Markdown, HTML, and historical snapshots.

## Quick Start

Create a local config first:

```bash
cp project-watcher.config.example.json project-watcher.config.json
```

Then edit `project-watcher.config.json` and run:

```bash
npm run scan
```

Reports are written to:

```text
reports/report.json
reports/report.md
reports/report.html
reports/assets/favicon.svg
reports/assets/manifest.webmanifest
reports/robots.txt
reports/csv/*.csv
reports/repos/*.html
reports/snapshots/*.json
```

Open the dashboard with:

```bash
npm run serve
```

## Config

`project-watcher.config.json` is intentionally ignored by Git because it contains local machine paths. Commit `project-watcher.config.example.json` instead.

Example:

```json
{
  "paths": [
    "~/Projects"
  ],
  "maxDepth": 6,
  "outputDir": "reports",
  "locTool": "auto",
  "countDuplicateFiles": false,
  "fileScope": "tracked",
  "maxSnapshots": 52
}
```

`paths` can contain direct repository paths or parent directories that contain repositories.

`locTool` can be:

- `auto`: prefer `tokei`, then `scc`, then `cloc`, then fallback to the built-in counter
- `cloc`, `tokei`, or `scc`: require that tool if installed, otherwise fallback
- `builtin`: use the internal non-empty-line counter

`countDuplicateFiles` controls `cloc` duplicate handling:

- `false`: count unique source files only; avoids double-counting copied/bundled files
- `true`: count every physical duplicate file too

`fileScope` controls which files are measured:

- `tracked`: only files returned by `git ls-files`; best default for project stats
- `workingTree`: files on disk after excludes; includes untracked local files

Tracked mode uses the tracked file set but reads current working-tree contents, so modified tracked files affect metrics while untracked files do not.

`maxSnapshots` controls retention for historical snapshots. Set it to `0` to keep all snapshots.

## CLI

```bash
node ./src/cli.js scan
node ./src/cli.js scan --config ./project-watcher.config.json
node ./src/cli.js scan --json
node ./src/cli.js doctor
node ./src/cli.js doctor --config ./project-watcher.config.json
node ./src/cli.js serve
node ./src/cli.js serve --port 7341
node ./src/cli.js init
node ./src/cli.js help
```

After linking/installing the package, the same commands are available as:

```bash
project-watcher scan
```

## CSV Exports

Every scan writes spreadsheet-friendly exports under `reports/csv/`:

- `repositories.csv`
- `languages.csv`
- `file-types.csv`
- `weekly-repositories.csv`
- `ai-agents.csv`
- `releases.csv`
- `contributors.csv`

## Repository Drilldowns

Every scan writes one detail page per repository under `reports/repos/`. These pages break down weekly activity, releases, contributors, file types, languages, AI agent files, and scan details for a single repo.

## Doctor

Run `npm run doctor` to validate the local setup before scanning. It checks config parsing, configured paths, output permissions, repository discovery, LOC tools, snapshot retention, and whether the local config file is ignored by Git.

## CI

GitHub Actions runs syntax checks, `doctor` with a CI-safe config, and the smoke test on Node 20 and Node 22.

## Metrics

- Repository name and path
- Origin remote URL
- Current branch
- Dirty working tree count
- Total commits
- Commits in the last 30 and 90 days
- Contributors and top contributors
- Local branch count
- Tags as local release markers
- SemVer tag count
- Latest tag
- Last commit date, hash, and subject
- Classified code, comment, and blank lines by language when `cloc`, `tokei`, or `scc` is available
- Physical file inventory by extension/name after configured excludes
- File counts, bytes, text files, binary files, oversized files, and text line counts by file type
- Historical snapshot trend data
- Delta report versus the previous comparable scan
- Basic dashboard metadata, favicon, web manifest, and privacy-safe robots file
- Weekly Git activity: commits, additions, deletions, churn, changed files, and active repositories
- AI agent footprint by tracked instruction/config files, with agent icons where official favicons are available
- Release activity from local Git tags, including recent tag windows and latest tags
- Contributor totals across repositories, including multi-repo contributors
- CSV exports for repositories, languages, file types, weekly activity, AI agents, releases, and contributors
- Per-repository HTML drilldown pages
- Doctor checks for config, paths, output, LOC tooling, retention, and ignored local config
- Snapshot retention via `maxSnapshots`

## Notes

Line counts are calculated locally and intentionally exclude common generated/heavy files such as lockfiles, build outputs, Python virtualenvs, browser profiles, local archives, temporary folders, and package vendor directories. For reliable LOC, install one of `tokei`, `scc`, or `cloc`; this machine currently has `cloc`, so `locTool: "auto"` will use it. With `cloc`, duplicate files are de-duplicated by default unless `countDuplicateFiles` is `true`. By default only tracked Git files are measured, so untracked local junk does not pollute reports.
