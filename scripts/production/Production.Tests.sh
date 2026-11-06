#!/usr/bin/env bash
set -Eeuo pipefail
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SOURCE_DIR/Production.sh"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT
logfile="$TEST_ROOT/commands"
validate_manifest() { :; }
verify_backup() { printf 'verify\n' >> "$logfile"; }
backup() { printf 'backup\n' >> "$logfile"; }
health() { printf 'health\n' >> "$logfile"; }
compose() { printf '%s\n' "$*" >> "$logfile"; }
mkdir -p "$TEST_ROOT/backup"
printf 'dump\n' > "$TEST_ROOT/backup/database.dump"
status=0
(restore "$TEST_ROOT/backup" WRONG) >/dev/null 2>&1 || status=$?
[[ "$status" != 0 && ! -f "$logfile" ]]
restore "$TEST_ROOT/backup" REPLACE_EGOFOCUS_PRODUCTION
[[ "$(head -n 3 "$logfile")" == $'verify\nbackup\nstop api' ]]
grep -q 'pg_restore.*--single-transaction' "$logfile"
grep -q 'up -d --wait' "$logfile"
if grep -Eq 'caddy|ego-production|gateway' "$logfile"; then echo 'FAIL: neighboring project touched'; exit 1; fi
: > "$logfile"
compose() { printf '%s\n' "$*" >> "$logfile"; [[ "$*" != *pg_restore* ]]; }
set +e
(set -e; restore "$TEST_ROOT/backup" REPLACE_EGOFOCUS_PRODUCTION) >/dev/null 2>&1
status=$?
set -e
[[ "$status" != 0 ]]
if grep -q 'up -d' "$logfile"; then echo 'FAIL: started API after restore failure'; exit 1; fi
: > "$logfile"
backup() { return 45; }
set +e
(set -e; restore "$TEST_ROOT/backup" REPLACE_EGOFOCUS_PRODUCTION) >/dev/null 2>&1
status=$?
set -e
[[ "$status" != 0 ]]
if grep -q 'stop api' "$logfile"; then echo 'FAIL: stopped before safety backup'; exit 1; fi
printf 'PASS: confirmation, backup gate, restore order, error isolation\n'

# Настоящий fast-forward в временном Git-репозитории, Docker подставной.
origin="$TEST_ROOT/origin.git"
author="$TEST_ROOT/author"
APP_DIR="$TEST_ROOT/app"
REPOSITORY="$origin"
BRANCH=main
STATE_DIR="$TEST_ROOT/state"
INSTALL_PATH="$TEST_ROOT/installed"
git init --quiet --bare "$origin"
git init --quiet --initial-branch=main "$author"
git -C "$author" config user.name 'Ops test'
git -C "$author" config user.email 'ops@example.invalid'
mkdir -p "$author/scripts/production" "$STATE_DIR"
printf 'agent\n' > "$author/scripts/production/Production.sh"
git -C "$author" add .
git -C "$author" commit --quiet -m initial
git -C "$author" remote add origin "$origin"
git -C "$author" push --quiet -u origin main
git -c core.autocrlf=false clone --quiet --branch main "$origin" "$APP_DIR"
REPOSITORY="$(git -C "$APP_DIR" remote get-url origin)"
initial="$(git -C "$APP_DIR" rev-parse HEAD)"
printf '%s\n' "$initial" > "$STATE_DIR/deployed-commit"
printf 'new\n' > "$author/version"
git -C "$author" add .
git -C "$author" commit --quiet -m update
git -C "$author" push --quiet
docker() { :; }
compose() { printf '%s\n' "$*" >> "$logfile"; }
backup() { return 45; }
set +e
(set -e; deploy) >/dev/null 2>&1
result=$?
set -e
[[ "$result" != 0 && "$(git -C "$APP_DIR" rev-parse HEAD)" == "$initial" ]]
backup() { printf 'backup\n' >> "$logfile"; }
health() { return 46; }
set +e
(set -e; deploy) >/dev/null 2>&1
result=$?
set -e
[[ "$result" != 0 && "$(cat "$STATE_DIR/deployed-commit")" == "$initial" ]]
health() { :; }
deploy
[[ "$(cat "$STATE_DIR/deployed-commit")" == "$(git -C "$author" rev-parse HEAD)" ]]
[[ "$(cat "$INSTALL_PATH")" == agent ]]
printf 'PASS: pre-update backup failure, failed health marker, retry and agent installation\n'
