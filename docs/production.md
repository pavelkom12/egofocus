# EgoFocus: production на общем VPS

Локальный `compose.yaml` не изменён. Сервер использует отдельный
`compose.production.yaml`, имя проекта `egofocus-production`, собственный
PostgreSQL и volume `egofocus-production_pgdata`. Никакие команды здесь не
останавливают Ego или общий Caddy.

Публичный адрес API: `https://focus.egovivo.online/api/v1`.
Проверка готовности: `https://focus.egovivo.online/api/health`.
Сам API слушает `8080` в контейнере и `127.0.0.1:8082` на VPS. PostgreSQL наружу
не публикуется. Caddy подключается через `ego-gateway-egofocus` с alias
`egofocus-api` и удаляет внешний `/api` перед передачей запросов. Корень домена
не содержит веб-приложения; для веб-публикации Expo нужна отдельная задача.

## Один раз перед установкой

1. Завершите вынос шлюза из Ego по `Ego/docs/operations/shared-gateway.md`.
   Создайте DNS `focus.egovivo.online` на тот же VPS и добавьте домен в gateway.
   Пока API не запущен, 502 на `/api/health` ожидаем; Ego уже должен работать.
2. Проверьте `scripts/production/production-target.psd1`: IP, ветка и адреса.
3. На Windows создайте **отдельные** ключи для чтения репозитория и backup:

   ```powershell
   ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\egofocus_github_deploy"
   ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\egofocus_vps_backup"
   ```

   Для неинтерактивных серверных задач нужны ключи без запроса passphrase либо
   заранее настроенный агент. Зарегистрируйте `egofocus_github_deploy.pub` как
   **read-only Deploy key** репозитория `pavelkom12/egofocus`. Ключ Ego для GitHub
   не переиспользуется. Администратор VPS использует прежний `ego_vps_admin`.
   Host key VPS и GitHub должны быть заранее проверены и внесены в `known_hosts`.
   Bootstrap использует strict host checking и не доверяет неизвестному ключу автоматически.
4. Создайте `.env.production` из `scripts/production/production.env.example`.
   Замените пароль БД случайным секретом, проверьте WEB_ORIGIN. Файл исключён
   из Git. Лимиты 256 MiB API и 512 MiB БД — исходные настройки, а не гарантия
   достаточности VPS: проверьте `free -h`, `df -h`, `docker stats --no-stream`.
   Оставьте запас Ego, ОС и сборкам. Лимиты runtime-контейнеров не ограничивают
   отдельный BuildKit build; при нехватке памяти собирайте образ вне VPS.
5. Закоммитьте и отправьте проверенные файлы в `main`, затем:

   ```powershell
   Set-Location F:\Development\EgoFocus
   .\scripts\production\ManageProduction.ps1 -Action Bootstrap `
     -ProductionEnv .\.env.production `
     -GitHubDeployKey "$env:USERPROFILE\.ssh\egofocus_github_deploy" `
     -BackupPublicKey "$env:USERPROFILE\.ssh\egofocus_vps_backup.pub"
   ```

   Установка требует уже работающих Docker/Compose, git, jq, curl, flock и sudo.
   Она не переустанавливает Docker и не меняет общий firewall. Создаёт отдельного
   backup-пользователя, устанавливает `/usr/local/sbin/egofocus`, запускает API
   и БД и проверяет HTTPS. Секреты устанавливаются root-only. Существующие env
   и deploy key не перезаписываются. При прерванной первой установке проверьте
   их на сервере, затем повторите серверный `Bootstrap.sh` из опубликованного
   набора скриптов; не меняйте пароль уже созданной БД простой правкой env.

## Как обновлять

Из чистого checkout ветки `main` с уже созданным commit:

```powershell
Set-Location F:\Development\EgoFocus
npm run deploy
```

Команда отправляет ветку, загружает deploy-agent из этого commit и запускает
обновление. Сервер проверяет origin, ветку, отсутствие локальных изменений и
fast-forward. При существующих данных перед обновлением или повторной сборкой
делается полный logical dump. Ошибка backup останавливает обновление.
После сборки Compose ждёт healthcheck; сервер проверяет прямой HTTP и публичный
HTTPS, записывает успешный commit и обновляет свою установленную команду.
Windows повторно сверяет checkout, marker и публичный URL.

Если сборка упала, работающие контейнеры не останавливаются специально. Если
миграции или healthcheck упали, успешный marker не обновляется: исправьте
причину и повторите deploy. Автоматического отката к старому коду нет, поскольку
миграции могли уже примениться. Возврат требует согласованного кода и backup.

```powershell
npm run production:status
npm run production:logs
.\scripts\production\ManageProduction.ps1 -Action Health
```

На VPS те же операции: `sudo egofocus deploy`, `egofocus status`,
`egofocus logs`, `egofocus health`. `egofocus stop` останавливает только API/БД
Focus; `egofocus start` запускает их с проверкой здоровья.

Ежедневный backup timer включается после успешного bootstrap. Автоматический
deployment подготовлен, но включается по желанию:

```bash
systemctl enable --now egofocus-deploy.timer
systemctl list-timers egofocus-backup.timer egofocus-deploy.timer
journalctl -u egofocus-deploy.service -n 100
```

Время systemd — часовой пояс VPS: backup около 03:00, deploy около 05:00,
со случайной задержкой до 10 минут. При конкурирующей операции новый запуск
отклоняется одним общим lock, текущая операция продолжается.

## Резервные копии

```powershell
npm run backup
```

Ограниченный пользователь `egofocus-backup` может через sudo выполнить только
`egofocus backup`, а затем скачать готовый набор. Windows проверяет checksum
и публикует копию в `F:\Backups\egofocus\<UTC stamp>`. Неполная загрузка остаётся
в `.partial-*` и не считается готовой копией.

На сервере набор лежит в `/var/backups/egofocus/<UTC stamp>` и содержит
`database.dump`, `inventory.json`, `SHA256SUMS`. Dump включает всю базу:
профили, сессии, историю и журнал миграций. Проверяется читаемость custom dump;
он согласован средствами PostgreSQL без остановки API. Состав данных задаётся
`scripts/production/production-data.json`; появление нового named volume
блокирует backup/deploy, пока контракт не обновлён. Приложение не хранит
пользовательские файлы вне БД на VPS. Будущие bind mounts с данными также
нужно явно включать в контракт и процедуры backup/restore.

Локальные SQLite/IndexedDB на устройствах, ещё не синхронизированные изменения,
секреты env и SSH-ключи в серверный dump не входят. Их сохранность обеспечивается
отдельно. Архивы на самом VPS не защищают от потери сервера: скачивайте копии.
Автоматическая очистка старых архивов не включена; контролируйте свободный диск.

## Восстановление

Восстановление заменяет только данные EgoFocus. Укажите настоящий каталог:

```powershell
.\scripts\production\ManageProduction.ps1 -Action Restore `
  -BackupDirectory F:\Backups\egofocus\20261106T120000Z -ConfirmReplace
```

Сначала проверяются checksum, принадлежность набора EgoFocus и читаемость dump.
Затем создаётся safety backup текущей БД, останавливается API, БД заменяется
и dump восстанавливается одной транзакцией. API запускается со штатными
миграциями текущего кода; проверяются HTTP/HTTPS. Если восстановление оборвалось,
API остаётся остановленным. Не запускайте `start` до успешного повторного
restore или проверки полной базы. Ego и Caddy не останавливаются.

На VPS: `sudo egofocus restore /absolute/backup REPLACE_EGOFOCUS_PRODUCTION`.
Проверка набора без записи: `sudo egofocus verify-backup /absolute/backup`.

## Перенос на другой VPS

1. Подготовьте общий Docker/gateway на новом сервере отдельно; это инфраструктура
   всего хоста. Установите проверенный admin public key и проверьте host key.
2. На старом сервере остановите Focus (`egofocus stop`), затем запустите только
   его `db` через production Compose и сделайте финальный backup. API остаётся
   остановленным до переключения, чтобы данные не расходились. Скачайте набор.
3. Восстановите сертификаты/конфигурацию gateway на новом VPS, затем с теми же
   секретами выполните Bootstrap с `-Server <new-IP>`. Серверная HTTPS-проверка
   обращается к локальному gateway с настоящим доменом и проверкой сертификата;
   она не может случайно принять ответ старого VPS за успешную новую установку.
   Без переноса сертификатов используйте отдельный тестовый домен нового VPS
   или сначала переключите DNS; проверку TLS не отключайте.
4. Restore с `-Server <new-IP>` загружает и проверяет тот же набор на новом узле.
5. Переключите DNS Focus на новый IP, проверьте вход и историю, обновите
   `production-target.psd1` и при необходимости URL в deploy.conf, затем включите
   timers нового узла. Старый API оставьте остановленным до завершения приёмки.

Перенос Ego и сертификатов общего gateway выполняется отдельно по документации
Ego. GitHub deploy key, env и gateway backup не публикуются в Git.

## Клиент и категории изменений

В `frontend/.env.local` задайте
`EXPO_PUBLIC_API_URL=https://focus.egovivo.online/api/v1`; для Release тот же
адрес задаётся переменной GitHub Actions. Это изменение JS-конфигурации (A):
для dev достаточно перезапуска Metro, опубликованный web/IPA должен включить
новое значение при сборке своего JS bundle. Серверные изменения не требуют
новых нативных зависимостей/entitlements (B). Backup/restore меняет серверные
пользовательские данные (C) и не требует компиляции приложения.

## Проверки

`bash -n scripts/production/*.sh`, `bash scripts/production/Production.Tests.sh`,
Pester `scripts/production/Production.Tests.ps1`, `docker compose --env-file
<test-env> -f compose.production.yaml config --quiet`.
Реальная изолированная репетиция PostgreSQL dump/restore и маршрутов Caddy
находится в `Ego/scripts/gateway/TestIsolation.ps1` и принимает `-FocusRoot`.
Она не обращается к VPS и удаляет только созданные ею тестовые ресурсы.
