# API Ego Focus

Запускать из корня репозитория. Требуются Docker и Compose. Один раз создайте .env на основе .env.example, задайте уникальный POSTGRES_PASSWORD. При этой установке локальный .env уже создан. Храните его отдельно от Git.

```powershell
docker compose up -d --build --wait
Invoke-RestMethod http://localhost:8082/health
docker compose exec -T api npm test
```

API слушает localhost:8082. PostgreSQL доступен только внутри сети Compose. Данные лежат в именованном томе pgdata, сохраняются после docker compose down и последующего up. Переменная API_PORT меняет порт на компьютере, WEB_ORIGIN задаёт разрешённый адрес веб-клиента. При установке на сервер направьте HTTPS через обратный прокси на порт API. SQL-миграции применяются при запуске в транзакции.

## Контракт /v1

| Метод | Путь           | Тело или результат                                                                                                                                     |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST  | /auth/register | username, password, birthday в формате YYYY-MM-DD, необязательный utcOffsetMinutes (минуты восточнее UTC на дату рождения). Возвращает profile и token |
| POST  | /auth/login    | username, password → profile и token                                                                                                                   |
| POST  | /auth/logout   | Завершает текущий сеанс, ответ 204                                                                                                                     |
| POST  | /auth/password | currentPassword, newPassword. Завершает другие сеансы                                                                                                  |
| GET   | /profile       | id, username, email, birthday, bornAt, metric, revision                                                                                                |
| PATCH | /profile       | revision плюс изменяемые поля username, email, metric                                                                                                  |
| GET   | /timeline      | revision и transitions (массив смен состояния по времени)                                                                                              |
| PUT   | /timeline      | revision и полный массив transitions. Возвращает новую revision                                                                                        |

Для защищённых запросов передайте заголовок Authorization со значением Bearer и токеном, разделёнными пробелом. Срок сеанса 30 дней. Пароли хранятся в виде хеша scrypt, токены в виде хеша SHA-256.

Каждое событие содержит id (UUID), at (Unix-время в миллисекундах), mode (unknown, focus или rest). При создании профиля сервер добавляет unknown на начало даты рождения. Статистика клиента может быть рассчитана из этих же переходов. При каждом изменении профиля или истории ревизия увеличивается. Ошибка 409 при записи означает, что клиент должен загрузить свежий снимок и разрешить конфликт. Ошибка 400 означает некорректный запрос; 401 — истёкший или отсутствующий сеанс.

Пример проверки из PowerShell на новом тестовом профиле:

```powershell
$api = 'http://localhost:8082/v1'
$body = @{ username = 'example'; password = 'example-test-password'; birthday = '2000-01-01'; utcOffsetMinutes = 180 } | ConvertTo-Json
$session = Invoke-RestMethod "$api/auth/register" -Method Post -ContentType 'application/json' -Body $body
$headers = @{ Authorization = "Bearer $($session.token)" }
Invoke-RestMethod "$api/timeline" -Headers $headers
```

Интеграционные тесты запускают Fastify с отдельной временной схемой в PostgreSQL. Они проверяют авторизацию, изоляцию профилей, валидацию истории и гонку двух записей одной ревизии.
