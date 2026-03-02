#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

echo "Repo: $repo_root"
echo
echo "Active worktrees:"
git worktree list
echo
echo "Agent branches (swarm/*):"
git for-each-ref --format='%(refname:short) %(objectname:short) %(committerdate:relative)' refs/heads/swarm || true
