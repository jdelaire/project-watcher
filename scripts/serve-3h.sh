#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONFIG_PATH="${PROJECT_WATCHER_CONFIG:-${ROOT_DIR}/project-watcher.config.json}"
HOST="${PROJECT_WATCHER_HOST:-127.0.0.1}"
PORT="${PROJECT_WATCHER_PORT:-7341}"
SCAN_INTERVAL_HOURS="${PROJECT_WATCHER_SCAN_INTERVAL_HOURS:-3}"

if [[ ! -f "${CONFIG_PATH}" ]]; then
  echo "Project Watcher config not found: ${CONFIG_PATH}" >&2
  echo "Create one with: cp ${ROOT_DIR}/project-watcher.config.example.json ${ROOT_DIR}/project-watcher.config.json" >&2
  echo "Or set PROJECT_WATCHER_CONFIG=/path/to/project-watcher.config.json" >&2
  exit 1
fi

cd "${ROOT_DIR}"
exec node "${ROOT_DIR}/src/cli.js" serve \
  --config "${CONFIG_PATH}" \
  --host "${HOST}" \
  --port "${PORT}" \
  --scan-interval-hours "${SCAN_INTERVAL_HOURS}" \
  "$@"
