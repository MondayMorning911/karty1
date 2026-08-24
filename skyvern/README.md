# Karty self-hosted Skyvern

This stack is a disabled-by-default fallback for Karty's Playwright publisher.
It is intentionally bound to `127.0.0.1:8010` and does not expose Skyvern publicly.

## Start

The compose file reads `DEEPSEEK_API_KEY` from Karty's existing env file without copying it into this directory:

```bash
cd /root/karty-lab/skyvern
docker compose --env-file /root/karty-lab/karty-core/.env up -d postgres skyvern
docker compose ps
curl http://127.0.0.1:8010/api/v1/heartbeat
```

## Important mounts

- Karty cookies: `/root/karty-lab/karty-core/cookies` -> `/app/cookies` read-only.
- Karty temporary photos: `/root/karty-lab/karty-core/downloads` -> `/app/downloads`.
- Skyvern browser sessions, artifacts and credential vault remain under this directory.

## Do not enable Karty fallback yet

The Karty Node process must not receive `SKYVERN_ENABLED=true` until a smoke test verifies the actual Skyvern task API, session format, file upload and public URL verification for each portal.

The current Karty adapter expects:

- `POST /api/v1/tasks` returning `task_id`;
- `GET /api/v1/tasks/{task_id}` returning `status`;
- completed tasks returning `extracted_information.url`;
- the `x-api-key` header accepted by the self-hosted API.
