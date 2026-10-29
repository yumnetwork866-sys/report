# Manage Team

Ứng dụng báo cáo hiệu suất nội dung đa nền tảng, gồm React frontend, Express API,
PostgreSQL, Redis và worker xử lý tác vụ nền.

## Yêu cầu

- Node.js 24+
- pnpm 11 (qua Corepack)
- PostgreSQL
- Redis

## Chạy local

```bash
corepack enable
pnpm install
cp backend/.env.example backend/.env
```

Cập nhật tối thiểu các biến sau trong `backend/.env`:

```dotenv
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/report
REDIS_URL=redis://127.0.0.1:6379/1
FRONTEND_URL=http://localhost:3005
ADMIN_USERNAME=admin@example.com
ADMIN_PASSWORD=your_strong_password
SESSION_SECRET=your_unique_secret_of_at_least_32_characters
```

Tạo database trước, sau đó chạy migration và khởi động ứng dụng:

```bash
pnpm --filter backend db:migrate --no-backup
pnpm dev
```

- Frontend: <http://localhost:3005>
- Backend: <http://localhost:8000>
- Health check: `GET /health`
- Readiness check: `GET /ready`

> PowerShell: dùng `Copy-Item backend/.env.example backend/.env` thay cho `cp`.

## Lệnh thường dùng

```bash
pnpm dev             # Chạy frontend, API và worker
pnpm start           # Build frontend rồi chạy production preview
pnpm build           # Build frontend
pnpm check           # Lint, test và build
pnpm test:coverage   # Chạy test kèm coverage
```

Các lệnh backend:

```bash
pnpm --filter backend start:api
pnpm --filter backend start:worker
pnpm --filter backend db:check
pnpm --filter backend db:migrate
pnpm --filter backend db:rollback
pnpm --filter backend db:backup
pnpm --filter backend sync:tiktok
```

Migration và rollback tự tạo backup trong `backend/backups/`. Chỉ dùng
`--no-backup` với database mới hoặc khi hạ tầng đã xử lý backup.

## TikTok

Cấu hình Login Kit và TikTok Shop trong `backend/.env` theo
`backend/.env.example`. Các secret mã hóa token phải khác `SESSION_SECRET` và có
ít nhất 32 ký tự. Redirect URI phải khớp chính xác với URI đã đăng ký trên
TikTok.

Các trang công khai của frontend: `/`, `/privacy`, `/terms` và
`/data-deletion`. Khi deploy dạng static, cấu hình fallback mọi route về
`index.html`.

## Deploy qua Cloudflare Tunnel

```yaml
- hostname: report.yumnetwork.vn
  service: http://localhost:3005

- hostname: report-api.yumnetwork.vn
  service: http://127.0.0.1:8000
```

Giữ `VITE_API_BASE_URL=/api`, đặt `FRONTEND_URL` thành domain frontend và các
OAuth/webhook callback thành domain API. Chỉ chạy một scheduler; có thể chạy
nhiều worker nếu scheduler leader election đã được cấu hình.
