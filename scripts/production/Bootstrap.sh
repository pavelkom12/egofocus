#!/usr/bin/env bash
set -Eeuo pipefail
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ "$(id -u)" == 0 ]] || { echo 'Run as root' >&2; exit 1; }
# Общий Docker и firewall принадлежат хосту; bootstrap второго приложения их не меняет.
for executable in docker git jq curl flock sudo; do command -v "$executable" >/dev/null; done
docker info >/dev/null
docker compose version >/dev/null
docker network inspect ego-gateway-egofocus >/dev/null
[[ -s /etc/egofocus/production.env && -s /root/.ssh/egofocus_github_deploy ]]
chmod 0600 /etc/egofocus/production.env /root/.ssh/egofocus_github_deploy
install -d -m 0700 /etc/egofocus
[[ -f /etc/egofocus/deploy.conf ]] || install -m 0600 "$SOURCE_DIR/deploy.conf.example" /etc/egofocus/deploy.conf
if ! id egofocus-backup >/dev/null 2>&1; then useradd --create-home --shell /bin/bash egofocus-backup; fi
install -d -o root -g egofocus-backup -m 0750 /var/backups/egofocus
install -m 0750 "$SOURCE_DIR/Production.sh" /usr/local/sbin/egofocus
printf 'egofocus-backup ALL=(root) NOPASSWD: /usr/local/sbin/egofocus backup\n' > /etc/sudoers.d/egofocus-backup
chmod 0440 /etc/sudoers.d/egofocus-backup
visudo -cf /etc/sudoers.d/egofocus-backup >/dev/null
printf 'Match User egofocus-backup\n    PasswordAuthentication no\n    KbdInteractiveAuthentication no\n    AllowTcpForwarding no\n    X11Forwarding no\n' > /etc/ssh/sshd_config.d/90-egofocus-backup.conf
/usr/sbin/sshd -t
passwd --delete egofocus-backup >/dev/null
systemctl reload ssh
if [[ -n "${EGOFOCUS_BACKUP_PUBLIC_KEY:-}" ]]; then
    backup_home="$(getent passwd egofocus-backup | cut -d: -f6)"
    install -d -o egofocus-backup -g egofocus-backup -m 0700 "$backup_home/.ssh"
    install -o egofocus-backup -g egofocus-backup -m 0600 "$EGOFOCUS_BACKUP_PUBLIC_KEY" "$backup_home/.ssh/authorized_keys"
fi
install -m 0644 "$SOURCE_DIR/egofocus-deploy.service" /etc/systemd/system/egofocus-deploy.service
install -m 0644 "$SOURCE_DIR/egofocus-deploy.timer" /etc/systemd/system/egofocus-deploy.timer
install -m 0644 "$SOURCE_DIR/egofocus-backup.service" /etc/systemd/system/egofocus-backup.service
install -m 0644 "$SOURCE_DIR/egofocus-backup.timer" /etc/systemd/system/egofocus-backup.timer
systemctl daemon-reload
/usr/local/sbin/egofocus deploy
# Автоматическое обновление включается отдельно оператором; backup включается после первого успеха.
systemctl enable --now egofocus-backup.timer
