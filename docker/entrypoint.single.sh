#!/bin/sh
set -eu

shutdown() {
  if [ -n "${WEB_PID:-}" ]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
  if [ -n "${WORKER_PID:-}" ]; then
    kill "$WORKER_PID" 2>/dev/null || true
  fi
}

trap shutdown INT TERM

bun --cwd apps/web run start &
WEB_PID=$!

bun --cwd apps/worker run start &
WORKER_PID=$!

wait -n "$WEB_PID" "$WORKER_PID"
shutdown
wait || true
