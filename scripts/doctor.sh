#!/usr/bin/env sh
# Checks that the developer prerequisites are installed (docs/11-onboarding.md).
# Usage: make doctor   (or: sh scripts/doctor.sh)
# Exit code 1 if a required tool is missing.

missing=0

check() {
  # $1 command, $2 required version hint, $3 install hint
  if command -v "$1" >/dev/null 2>&1; then
    printf '  [ok]      %-11s %s\n' "$1" "$("$1" --version 2>&1 | head -n 1)"
  else
    printf '  [MISSING] %-11s need %s -> %s\n' "$1" "$2" "$3"
    missing=1
  fi
}

echo "Prerequisites:"
check git        "any recent"       "https://git-scm.com/downloads"
check make       "GNU make >= 4"    "Windows: winget install ezwinports.make | macOS: xcode-select --install"
check uv         ">= 0.5"           "https://docs.astral.sh/uv/getting-started/installation/"
check node       "LTS (>= 22)"      "https://nodejs.org/"
check pnpm       ">= 9"             "corepack enable pnpm  (or: winget install pnpm.pnpm)"
check docker     "Compose v2"       "https://docs.docker.com/get-docker/"
check pre-commit ">= 3"             "uv tool install pre-commit"

# GNU make specifically (the PyPI package 'make' is NOT GNU make).
if command -v make >/dev/null 2>&1 && ! make --version 2>/dev/null | grep -q 'GNU Make'; then
  echo "  [WRONG]   make is not GNU make. If you ran 'pip install make', run 'pip uninstall make'."
  missing=1
fi

# Python 3.12 is provisioned by uv per package; just report what uv will use.
if command -v uv >/dev/null 2>&1; then
  if uv python find 3.12 >/dev/null 2>&1; then
    echo "  [ok]      python3.12  $(uv python find 3.12)"
  else
    echo "  [info]    python3.12  not found; uv will download it on first 'make setup'"
  fi
fi

# Docker daemon is only needed for 'make up' / 'make e2e'.
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  echo "  [warn]    docker daemon not running (needed for make up / make e2e). Start Docker Desktop."
fi

# POSIX shell check (Windows): make recipes need sh, i.e. run make from Git Bash.
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*) echo "  [ok]      shell       Git Bash detected" ;;
esac

if [ "$missing" -ne 0 ]; then
  echo
  echo "Some prerequisites are missing. Windows: powershell -ExecutionPolicy Bypass -File scripts/install-prereqs.ps1"
  exit 1
fi
echo
echo "All prerequisites present."
