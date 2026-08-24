# 4Ceria Portal (4C-Web)

Construction coordination & real-estate marketplace: clients post projects, hire verified professionals (architects, contractors, notaries, interior designers, PMs, structural/MEP engineers), manage milestones, payments (termins), documents (vault) and legal handover — plus a house marketplace and in-app chat.

## Stack

- **Backend**: Laravel 13 (API-only under `/api`), Sanctum tokens, Spatie Permission, Resend mail, Redis-ready (cache/queue/session)
- **Frontend**: React 19 + TypeScript SPA (`resources/js`), Vite 6, Tailwind CSS 3, PWA (workbox)
- **Infra options**: Laravel Octane (FrankenPHP), Docker, Vercel (standalone SPA mode)

## Requirements

- **PHP >= 8.4** (vendor uses Symfony 8 property hooks; PHP 8.2/8.3 CLI will fail to parse vendor code).
  - Laragon: switch PHP, or call the newer binary explicitly, e.g. `C:\laragon\bin\php\php-8.5.x\php.exe artisan serve`
- Composer, Node.js 18+

## Local development

```bash
composer install
npm install

cp .env.example .env         # then fill DB_*, RESEND_API_KEY
php artisan key:generate
php artisan migrate --seed   # seeds demo accounts (see Quick Login below)

php artisan serve --port=9000    # API + app shell on http://localhost:9000
npm run dev                      # Vite dev server on http://localhost:5173
```

> **Local Redis?** If you don't run Redis locally, override the drivers per-process:
> `set SESSION_DRIVER=file&& set CACHE_STORE=file&& set QUEUE_CONNECTION=sync&& php artisan serve`

### Dev-only quick login

A role-based quick-login panel is available during development. It lives in the
**gitignored** `resources/js/pages/dev/QuickLoginPanel.tsx`; fresh clones without that file simply render nothing.

## Build

```bash
npm run build                          # Laravel-integrated build (public/build)
VITE_STANDALONE=true npm run build     # standalone SPA into dist/ (Vercel)
```

## Key environment variables

| Variable | Purpose |
|---|---|
| `APP_URL` | Base URL used for reset links / signed URLs |
| `DB_*` | MySQL connection |
| `SESSION_DRIVER` / `CACHE_STORE` / `QUEUE_CONNECTION` | `redis` in prod; use `file`/`sync` locally without Redis |
| `RESEND_API_KEY` | Transactional email (password reset, notifications) |
| `PUBLIC_STORAGE_DRIVER` | `local` (dev) or `s3` (prod: Railway/Tigris object storage via `AWS_*`) |
| `RAILWAY_STORAGE_*` | Private bucket (contracts/KYC): access key, secret, region, bucket, endpoint |
| `VITE_API_URL` | Axios base URL for standalone SPA builds |
| `VITE_STANDALONE` | `true` builds the frontend without Laravel integration |

## Repository layout notes

- `docs/` — architecture/domain/convention docs (`AGENTS.md` at repo root is the agent entry point), audit reports under `docs/audits/`
- `refinement-tests/` — maintenance & verification scripts used during the final refinement pass
- `_legacy/controllers/` — archived controllers kept out of the autoloader; verified unreferenced before moving. Do not autoload from here.
- `mobile/` — separate Flutter app repository (nested, independently versioned)

## Security notes

- `.mcp.json`, `.claude/`, `.codex/`, local venvs and scratch scripts are gitignored
- Project vault documents require participant authorization (`ProjectDocumentController`)
- Password resets never echo mailer internals; registration errors are generic by design
