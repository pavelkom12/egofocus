#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG_FILE="${EGOFOCUS_CONFIG_FILE:-/etc/egofocus/deploy.conf}"
if [[ -f "$CONFIG_FILE" ]]; then source <(sed 's/\r$//' "$CONFIG_FILE"); fi
APP_DIR="${EGOFOCUS_APP_DIR:-/opt/egofocus}"
REPOSITORY="${EGOFOCUS_REPOSITORY:-git@github.com:pavelkom12/egofocus.git}"
BRANCH="${EGOFOCUS_BRANCH:-main}"
DEPLOY_KEY="${EGOFOCUS_DEPLOY_KEY:-/root/.ssh/egofocus_github_deploy}"
ENV_FILE="${EGOFOCUS_ENV_FILE:-/etc/egofocus/production.env}"
BACKUP_ROOT="${EGOFOCUS_BACKUP_ROOT:-/var/backups/egofocus}"
STATE_DIR="${EGOFOCUS_STATE_DIR:-/var/lib/egofocus-deploy}"
PUBLIC_URL="${EGOFOCUS_PUBLIC_URL:-https://focus.egovivo.online/api/health}"
LOCK_FILE="${EGOFOCUS_LOCK_FILE:-/var/lock/egofocus-production.lock}"
INSTALL_PATH="${EGOFOCUS_INSTALL_PATH:-/usr/local/sbin/egofocus}"

fail() { printf '[egofocus] ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '[egofocus] %s\n' "$*" >&2; }
compose() { docker compose -p egofocus-production --env-file "$ENV_FILE" -f "$APP_DIR/compose.production.yaml" "$@"; }

validate_configuration() {
    [[ "$APP_DIR" == /* && "$APP_DIR" != / && "$BACKUP_ROOT" == /* && "$BACKUP_ROOT" != / ]] || fail "Invalid absolute paths"
    [[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE"
    [[ "$PUBLIC_URL" =~ ^https://[a-z0-9.-]+/api/health$ ]] || fail "Invalid public health URL"
    git check-ref-format --branch "$BRANCH" >/dev/null || fail "Invalid branch"
}

validate_repository() {
    [[ "$(git -C "$APP_DIR" remote get-url origin)" == "$REPOSITORY" ]] || fail "Unexpected origin"
    [[ "$(git -C "$APP_DIR" symbolic-ref --short HEAD)" == "$BRANCH" ]] || fail "Unexpected branch or detached HEAD"
    [[ -z "$(git -C "$APP_DIR" status --porcelain)" ]] || fail "Production checkout has local changes"
}

validate_manifest() {
    jq -e '.formatVersion == 1 and .composeProject == "egofocus-production" and
        .database.composeVolume == "pgdata" and .database.scope == "entire-database" and
        .database.database == "egofocus" and .database.user == "egofocus" and
        .database.composeService == "db" and (.volumes | length) == 0' \
        "$APP_DIR/scripts/production/production-data.json" >/dev/null || fail "Unknown persistence contract"
    compose config --format json | jq -e '
        (.volumes | keys) == ["pgdata"] and .volumes.pgdata.name == "egofocus-production_pgdata" and
        ([.services[].volumes // [] | .[]] | all(.type == "volume" and .source == "pgdata"))' \
        >/dev/null || fail "Unclassified persistent volume or bind mount"
}

backup() (
    validate_manifest
    compose ps --status running --services | grep -qx db || fail "Database is not running"
    umask 077
    install -d -m 0750 -g egofocus-backup "$BACKUP_ROOT"
    local stamp stage final revision
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    stage="$(mktemp -d "$BACKUP_ROOT/.partial-XXXXXX")"
    trap 'rm -rf -- "$stage"' EXIT
    final="$BACKUP_ROOT/$stamp"
    [[ ! -e "$final" ]] || fail "Backup already exists: $final"
    compose exec -T db pg_dump -U egofocus -d egofocus -Fc > "$stage/database.dump"
    compose exec -T db pg_restore --list < "$stage/database.dump" >/dev/null
    revision="$(git -C "$APP_DIR" rev-parse HEAD)"
    jq -n --arg stamp "$stamp" --arg revision "$revision" \
        --slurpfile contract "$APP_DIR/scripts/production/production-data.json" \
        '{formatVersion:1,project:"egofocus-production",stamp:$stamp,sourceCommit:$revision,dataContract:$contract[0]}' > "$stage/inventory.json"
    (cd "$stage" && sha256sum database.dump inventory.json > SHA256SUMS)
    chgrp -R egofocus-backup "$stage"
    chmod 0750 "$stage"
    chmod 0640 "$stage/"*
    mv "$stage" "$final"
    printf '%s\n' "$stamp"
)

verify_backup() {
    local directory="$1" name
    [[ "$directory" == /* && -d "$directory" ]] || fail "Backup must be an absolute directory"
    [[ "$(wc -l < "$directory/SHA256SUMS")" -eq 2 ]] || fail "Invalid checksum list"
    for name in database.dump inventory.json; do
        grep -Eq "^[a-f0-9]{64}  ${name//./[.]}$" "$directory/SHA256SUMS" || fail "Missing checksum: $name"
    done
    (cd "$directory" && sha256sum -c SHA256SUMS >&2)
    jq -e '.formatVersion == 1 and .project == "egofocus-production" and .dataContract.database.scope == "entire-database"' \
        "$directory/inventory.json" >/dev/null || fail "Wrong backup project or contract"
    compose exec -T db pg_restore --list < "$directory/database.dump" >/dev/null
}

health() {
    local address domain
    address="$(compose port api 8080)"
    [[ "$address" =~ ^127\.0\.0\.1:[0-9]+$ ]] || fail "API must be bound to loopback"
    curl --fail --silent --show-error --max-time 15 "http://$address/health" >/dev/null
    domain="${PUBLIC_URL#https://}"; domain="${domain%%/*}"
    curl --fail --silent --show-error --retry 8 --retry-all-errors --retry-delay 3 --max-time 15 \
        --resolve "$domain:443:127.0.0.1" "$PUBLIC_URL" >/dev/null
}

deploy() {
    docker network inspect ego-gateway-egofocus >/dev/null || fail "Install the shared gateway first"
    if [[ "$REPOSITORY" == git@* || "$REPOSITORY" == ssh://* ]]; then
        [[ -s "$DEPLOY_KEY" ]] || fail "Missing read-only repository deploy key"
        export GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes"
    fi
    local current target deployed=""
    if [[ ! -d "$APP_DIR/.git" ]]; then
        [[ ! -e "$APP_DIR" ]] || fail "Application directory already exists without Git"
        git clone --single-branch --branch "$BRANCH" "$REPOSITORY" "$APP_DIR" >&2
    fi
    validate_repository
    current="$(git -C "$APP_DIR" rev-parse HEAD)"
    git -C "$APP_DIR" fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" >&2
    target="$(git -C "$APP_DIR" rev-parse "refs/remotes/origin/$BRANCH")"
    git -C "$APP_DIR" merge-base --is-ancestor "$current" "$target" || fail "Non-fast-forward update"
    if [[ -f "$STATE_DIR/deployed-commit" ]]; then deployed="$(cat "$STATE_DIR/deployed-commit")"; fi
    if [[ "$current" != "$target" || "$deployed" != "$target" ]]; then
        if docker volume inspect egofocus-production_pgdata >/dev/null 2>&1; then
            backup >&2
        fi
    fi
    git -C "$APP_DIR" merge --ff-only "$target" >&2
    compose config --quiet
    validate_manifest
    if [[ "$deployed" != "$target" ]]; then
        compose pull db
        # Сборка не останавливает ни соседние проекты, ни текущий API.
        compose build --pull api
    fi
    compose up -d --wait --wait-timeout 180
    health
    install -d -m 0755 "$STATE_DIR"
    printf '%s\n' "$target" > "$STATE_DIR/deployed-commit.next"
    mv "$STATE_DIR/deployed-commit.next" "$STATE_DIR/deployed-commit"
    install -m 0750 "$APP_DIR/scripts/production/Production.sh" "$INSTALL_PATH.next"
    mv "$INSTALL_PATH.next" "$INSTALL_PATH"
    log "Deployed $target"
}

restore() {
    local directory="${1:-}"
    [[ "${2:-}" == REPLACE_EGOFOCUS_PRODUCTION ]] || fail "Pass backup directory and REPLACE_EGOFOCUS_PRODUCTION"
    validate_manifest
    verify_backup "$directory"
    backup >&2
    compose stop api
    # На ошибке оставляем API остановленным: частичная БД не должна принимать записи.
    compose exec -T db dropdb -U egofocus --if-exists --force egofocus
    compose exec -T db createdb -U egofocus -O egofocus egofocus
    compose exec -T db pg_restore -U egofocus -d egofocus --no-owner --no-privileges --exit-on-error --single-transaction < "$directory/database.dump"
    # Штатный entrypoint применяет миграции текущего checkout до открытия порта.
    compose up -d --wait --wait-timeout 180
    health
    log "Restore complete"
}

main() {
    [[ "$(id -u)" == 0 ]] || fail "Run as root"
    for command in docker git jq flock curl sha256sum; do command -v "$command" >/dev/null || fail "Missing $command"; done
    validate_configuration
    exec 9>"$LOCK_FILE"
    flock -n 9 || fail "Another EgoFocus operation is running"
    case "${1:-status}" in
        deploy) deploy ;;
        backup) backup ;;
        restore) shift; restore "$@" ;;
        verify-backup) verify_backup "${2:-}" ;;
        status) compose ps; [[ ! -f "$STATE_DIR/deployed-commit" ]] || cat "$STATE_DIR/deployed-commit" ;;
        logs) compose logs --tail 100 api db ;;
        health) health ;;
        stop) compose stop api db ;;
        start) compose up -d --wait --wait-timeout 180; health ;;
        *) fail "Commands: deploy, backup, restore, verify-backup, status, logs, health, stop, start" ;;
    esac
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
