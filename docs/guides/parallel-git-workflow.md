# Parallel Git Workflow (Worktrees)

Swarm agents now run in dedicated git worktrees.

## What this gives you

- Parallel execution without branch collisions.
- Observable branch/worktree mapping in runtime logs.
- Clean PR path per agent/task branch.

## Runtime behavior

- Worktree root defaults to:
  - `../swarm-city-worktrees` (sibling to this repo)
- Branch naming:
  - `swarm/<taskId>/<role>`
- Per-agent setup event appears in activity feed:
  - `agent_workspace` with `worktreePath`, `branch`, `created`.
- Per-agent PR draft metadata appears in activity feed:
  - `agent_pr_draft` with PR title, draft path, and ready `gh pr create` command.

## Useful commands

```bash
# Show all active worktrees + swarm branches
./scripts/worktree-status.sh

# Native git view
git worktree list
```

## GitHub flow for parallel observable work

1. Let agent/task run create worktrees automatically.
2. For each `swarm/<task>/<role>` branch, use generated metadata:
   - Draft body file: `<worktree>/.swarm/pr-draft.md`
   - `gh pr create` command: emitted via `agent_pr_draft`
3. Push branch and open a PR per agent branch (or squash by task).
4. Merge PRs in dependency order (research -> design -> engineer -> qa -> reviewer).
5. Remove stale worktrees after merge:

```bash
git worktree remove ../swarm-city-worktrees/<taskId>/<role>
git branch -D swarm/<taskId>/<role>
```

## Optional environment variables

- `SWARM_WORKTREE_ROOT` to customize the worktree root directory.
- `SWARM_REPO_ROOT` to force the source repo root.
