# Contributor Note: Restricted Environments

Use this workflow when your environment blocks `.git` writes (no `git add`/`git commit`) or disallows local port binding.

## 1) Validate changes without commits

Run checks that do not require committing:

```bash
npm run validate:docs-registry
npm run build
```

If local port binding is blocked, do not run `npm run dev` or Playwright smoke runs that start a local server.

## 2) Capture your change as a patch

If Git metadata is readable, generate a patch from your working tree:

```bash
git diff > restricted-env-changes.patch
```

If Git is not available, create a plain diff instead:

```bash
diff -ruN --exclude node_modules --exclude .next . ./baseline-copy > restricted-env-changes.patch
```

Share the patch file with your validation notes.

## 3) Apply later in a writable environment

Preferred (Git-based):

```bash
git apply restricted-env-changes.patch
```

Fallback:

```bash
patch -p1 < restricted-env-changes.patch
```

Then run validation again and create the commit in that writable environment.
