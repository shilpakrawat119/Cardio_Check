#!/usr/bin/env bash
set -euo pipefail

# CardioCheck local runner.
# Creates a project-local virtualenv, installs dependencies, then starts Flask
# on an alternate port so it is less likely to collide with other local apps.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="${VENV_DIR:-.venv}"
START_PORT="${PORT:-7321}"
MAX_PORT="${MAX_PORT:-7399}"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

ensure_macos_openmp() {
  if [ "$(uname -s)" != "Darwin" ]; then
    return 0
  fi

  if [ -f "/opt/homebrew/opt/libomp/lib/libomp.dylib" ] || [ -f "/usr/local/opt/libomp/lib/libomp.dylib" ]; then
    return 0
  fi

  if ! command_exists brew; then
    echo "XGBoost needs libomp on macOS, but Homebrew was not found." >&2
    echo "Install Homebrew, then rerun this script." >&2
    exit 1
  fi

  echo "Installing macOS OpenMP runtime for XGBoost ..."
  brew install libomp
}

port_is_free() {
  local port="$1"

  if command_exists lsof; then
    ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    "$PYTHON_BIN" - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.settimeout(0.2)
    sys.exit(0 if sock.connect_ex(("127.0.0.1", port)) != 0 else 1)
PY
  fi
}

pick_port() {
  local port

  for ((port = START_PORT; port <= MAX_PORT; port++)); do
    if port_is_free "$port"; then
      echo "$port"
      return 0
    fi
  done

  echo "No free port found from $START_PORT to $MAX_PORT." >&2
  echo "Try: PORT=7450 ./run_local.sh" >&2
  return 1
}

if ! command_exists "$PYTHON_BIN"; then
  echo "Could not find $PYTHON_BIN. Install Python 3 or run with PYTHON_BIN=/path/to/python3 ./run_local.sh" >&2
  exit 1
fi

ensure_macos_openmp

if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtual environment in $VENV_DIR ..."
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

echo "Installing Python dependencies ..."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

APP_PORT="$(pick_port)"

echo
echo "Starting CardioCheck locally:"
echo "  http://localhost:$APP_PORT"
echo
echo "Press Ctrl+C to stop the server."

export PORT="$APP_PORT"
export FLASK_ENV="${FLASK_ENV:-development}"

python app.py
