# manage-team

## Run with pnpm

```bash
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` runs both backend and frontend in parallel from the repo root.
`pnpm start` builds and serves the minified frontend on port 3005 and runs the
backend API on port 8000. Use `pnpm dev` for the unminified development server.
`pnpm build` builds the frontend bundle.

For a split Cloudflare Tunnel deployment, route the two processes separately:

```yaml
- hostname: report.yumnetwork.vn
  service: http://localhost:3005

- hostname: report-api.yumnetwork.vn
  service: http://127.0.0.1:8000
```

Keep `VITE_API_BASE_URL=/api` so Vite proxies browser API requests to the local
backend. Set `FRONTEND_URL=https://report.yumnetwork.vn` and
`BASE_URL=https://report-api.yumnetwork.vn` in `backend/.env` for CORS and
public OAuth/webhook callbacks.

## Quality checks

Run the same quality gate used by CI before opening a pull request:

```bash
pnpm check
```

The gate runs backend and frontend lint with warnings treated as failures, all
tests, and the production frontend build. To inspect the current test coverage
without enforcing a threshold:

```bash
pnpm test:coverage
```

This project is structured for multi-platform content performance reporting.

## TikTok OAuth

The backend handles TikTok OAuth entirely server-side. Configure `backend/.env` with:

```bash
PORT=8000
FRONTEND_URL=http://localhost:3005
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=http://localhost:8000/api/channels/oauth/tiktok/callback
TIKTOK_SCOPES=user.info.basic
```

Before deploying, set `TIKTOK_TOKEN_ENCRYPTION_KEY` and `SESSION_SECRET` to separate, unique secrets of at least 32 characters. Set `VITE_PRIVACY_CONTACT_EMAIL` in the frontend environment to the monitored address used for privacy and deletion requests.
If you want to override the default bootstrap admin account, set `ADMIN_USERNAME` in `backend/.env`. It can be a plain username like `megumin`; the backend will derive a valid internal email for the admin record automatically.

The public website exposes these direct URLs on the frontend host without authentication:

- `/`
- `/privacy`
- `/terms`
- `/data-deletion`

If you host the frontend on static infrastructure, make sure the server rewrites every unknown path back to `index.html` so deep links like `/privacy` and `/data-deletion` do not 404 on refresh or direct visit.

After TikTok redirects back, the backend exchanges the code, stores/updates the channel, and sends the browser to the frontend channels page with a status message.

### TikTok sandbox login errors

If TikTok shows `non_sandbox_target`, the current TikTok app is still using a sandbox configuration and the TikTok account trying to authorize has not been added as a sandbox target user. In TikTok for Developers, open the same app that owns `TIKTOK_CLIENT_KEY`, switch to Sandbox, add the TikTok account under Sandbox settings > Target users, authorize it for Login Kit, then apply changes. TikTok says target users can take up to an hour to appear after refresh.

Also verify that the Login Kit redirect URI in the TikTok app exactly matches `TIKTOK_REDIRECT_URI`, including protocol, domain, path, and trailing slash. For the current local tunnel, that value should be the ngrok HTTPS callback URL exposed by the backend, not `localhost`.

## Automated data schedules

Schedules are managed from **Admin → Schedule** and stored in PostgreSQL. The page controls whether each job is enabled, its timezone, its run times (up to six per day), manual runs, and recent run history. The backend server starts the database-driven scheduler automatically.

The optional dedicated worker uses the same database configuration, so it does not create a second independent cron definition:

```bash
cd backend
pnpm run sync:tiktok:scheduler
```

Scheduled run records have a unique key, preventing the same job/time from running twice if both the API server and a dedicated worker are active. To run TikTok Channel sync once without the scheduler:

```bash
pnpm run sync:tiktok
```

## Database check

The backend never changes the schema while starting. Apply versioned migrations explicitly; `db:migrate` and `db:rollback` create a PostgreSQL custom-format backup in `backend/backups/` first (override with `DB_BACKUP_DIR`).

```bash
cd backend
pnpm run db:migrate
pnpm run db:rollback
pnpm run db:backup
```

Use `-- --no-backup` only when a backup is handled by deployment infrastructure.

Use the backend DB connection to verify the target database before running migrations:

```bash
cd backend
pnpm run db:check
```

If you use `psql` manually, connect to the `report` database, not `postgres`:

```bash
psql "$DATABASE_URL"
```

Inside `psql`, confirm:

```sql
SELECT current_database(), current_user;
```

If you are already inside `psql` and see `postgres=#`, switch to the right database first:

```sql
\c report
```
