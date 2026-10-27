#!/bin/bash
set -e
cd "$(dirname "$0")"

for tool in java npm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing $tool. Install it, then run this launcher again."
    exit 1
  fi
done

if [ ! -f backend/.env ]; then
  echo "Create backend/.env with your database and Clerk settings first."
  exit 1
fi
set -a
source backend/.env
set +a
for name in SUPABASE_DB_URL SUPABASE_DB_USER SUPABASE_DB_PASSWORD CLERK_ISSUER_URI; do
  value="${!name}"
  if [[ -z "$value" || "$value" == *YOUR_* ]]; then
    echo "Set $name in backend/.env before starting the app."
    exit 1
  fi
done

if [ ! -f frontend/.env.local ]; then
  echo "Create frontend/.env.local using frontend/.env.example first."
  exit 1
fi

# The plan-only model is a private subprocess; it needs no third service/port.
export MGO_RIDGE_ROOT="${MGO_RIDGE_ROOT:-$PWD/ridge-regression-model}"
export MGO_RIDGE_PYTHON="${MGO_RIDGE_PYTHON:-$PWD/.venv/bin/python}"
if [ ! -x "$MGO_RIDGE_PYTHON" ] || ! (cd "$MGO_RIDGE_ROOT" && "$MGO_RIDGE_PYTHON" -c 'import pandas, numpy, sklearn, joblib') ; then
  echo "Install the Ridge runtime: python3 -m venv .venv && .venv/bin/pip install -r ridge-regression-model/requirements.txt"
  exit 1
fi

if [ ! -d frontend/node_modules ]; then
  echo "Installing frontend dependencies..."
  (cd frontend && npm ci)
fi

# Give each service its own process group so shutdown includes child processes.
set -m
backend_pid=""
frontend_pid=""
cleanup() {
  trap - EXIT INT TERM
  echo "Stopping services..."
  for pid in "$backend_pid" "$frontend_pid"; do
    if [ -n "$pid" ]; then
      kill -TERM -- "-$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

(cd backend && exec ./mvnw spring-boot:run) &
backend_pid=$!
(cd frontend && exec npm run dev -- --port "${FRONTEND_PORT:-5173}" --strictPort) &
frontend_pid=$!

echo "Frontend: http://127.0.0.1:${FRONTEND_PORT:-5173}"
echo "Backend:  http://127.0.0.1:${PORT:-8000}"
echo "Starting services. Press Ctrl+C to stop both."
while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done
status=0
if ! kill -0 "$backend_pid" 2>/dev/null; then
  wait "$backend_pid" || status=$?
else
  wait "$frontend_pid" || status=$?
fi
exit "$status"
