#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

git pull --ff-only
ASSET_VERSION="$(git rev-parse --short HEAD)" docker compose up -d --build --wait
docker image prune -f
docker compose ps
