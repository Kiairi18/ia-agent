#!/usr/bin/env bash
# Thin wrapper so the CLI matches the workshop's convention:
#   ./your_program.sh -p "your prompt"
# First time only, this needs its executable bit set:
#   chmod +x your_program.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
exec bun run main.ts "$@"
