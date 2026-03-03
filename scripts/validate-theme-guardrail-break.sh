#!/usr/bin/env bash
set -euo pipefail

target_file="src/components/TopBar.tsx"
original_class="text-[var(--text-primary)]"
injected_class="text-red-500"
target_test="validates token contracts, semantic surface wiring, and hardcoded color regression fingerprint in dark theme"

if [[ ! -f "$target_file" ]]; then
  echo "Missing target file: $target_file" >&2
  exit 1
fi

tmp_backup="$(mktemp -t topbar-theme-break.XXXXXX)"
cp "$target_file" "$tmp_backup"

restore_file() {
  cp "$tmp_backup" "$target_file"
  rm -f "$tmp_backup"
}
trap restore_file EXIT

if ! grep -Fq "$original_class" "$target_file"; then
  echo "Expected class token not found in $target_file: $original_class" >&2
  exit 1
fi

perl -0pi -e "s/\\Q$original_class\\E/$injected_class/" "$target_file"

if ! grep -Fq "$injected_class" "$target_file"; then
  echo "Intentional break was not applied to $target_file" >&2
  exit 1
fi

echo "[1/3] Running guardrail test expecting failure with intentional hardcoded color..."
set +e
npm run test:theme:guardrails -- --grep "$target_test"
break_status=$?
set -e

if [[ "$break_status" -eq 0 ]]; then
  echo "Guardrail test unexpectedly passed with intentional hardcoded color injection." >&2
  exit 1
fi

echo "[2/3] Reverting intentional break..."
restore_file
trap - EXIT

echo "[3/3] Running full theme guardrail suite expecting clean pass..."
npm run test:theme:guardrails

echo "Theme regression guardrail break validation completed successfully."
