# 勝ちパターンDB（クリエイティブ×記事LP 蓄積・生成ツール）

Internal web app from 「開発仕様書 第1版（2026-11-13）」 and the Figma file "Anchor 記事LP".

- **App**: Next.js 16 (App Router, route handlers under `/api`), deployed to Cloudflare Workers with `@opennextjs/cloudflare`
- **DB**: Turso (libSQL) via Drizzle + raw SQL. `migrations/0001_init.sql` holds the spec ch.5 DDL and is the source of truth
- **Files**: R2 (`FILES` binding), private. Served only through `/api/files/*` to signed-in users
- **AI**: Claude API (`claude-sonnet-5-5` for generation, `claude-haiku-5-5` for tags, article blocks and LP checks). Embeddings: Workers AI `@cf/baai/bge-m3` (1024 dims)
- **Auth**: Cloudflare Access (Google SSO). Every request verifies `Cf-Access-Jwt-Assertion`. Roles are viewer / editor / admin (spec ch.3), enforced in the API

## Local development

```bash
npm install
cp .env.example .env.local        # TURSO_DATABASE_URL=file:local.db, AUTH_MODE=dev
cp .dev.vars.example .dev.vars    # overrides wrangler vars in `next dev`
npm run db:migrate
npm run db:seed -- --sample       # master data + Figma sample cases
npm run dev
```

`AUTH_MODE=dev` signs everyone in as `DEV_USER_EMAIL`. Emails listed in `INITIAL_ADMIN_EMAILS` become admins on first login.

```bash
npm test          # judge logic (spec ch.13 cases), recommendation score, permissions, formatting, file checks
npm run typecheck
```

## Deploy (Cloudflare)

1. Create the buckets: `npx wrangler r2 bucket create anchor-lp-files` (and `anchor-lp-files-staging`)
2. Set the secrets (production; repeat with `--env staging`):
   ```bash
   npx wrangler secret put TURSO_DATABASE_URL
   npx wrangler secret put TURSO_AUTH_TOKEN
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put CF_ACCESS_TEAM_DOMAIN   # your-team.cloudflareaccess.com
   npx wrangler secret put CF_ACCESS_AUD           # Access application AUD tag
   npx wrangler secret put INITIAL_ADMIN_EMAILS
   npx wrangler secret put SERVICE_TOKEN           # random string; used by the cron self-call and DPro method B
   npx wrangler secret put SQUAD_BEYOND_BASE_URL   # optional; defaults to https://public-api.squadbeyond.com/v1
   npx wrangler secret put SQUAD_BEYOND_API_KEY
   npx wrangler secret put NOTIFY_WEBHOOK_URL      # Slack/Chatwork webhook (U-05)
   ```
3. Put a Cloudflare Access application (Google, company domain only) in front of the Worker's hostname.
4. Apply the schema: `npm run db:migrate:remote` (reads `.env.turso`, which is gitignored)
5. Deploy: `npm run deploy` (or `npm run deploy:staging`)

Cron: one hourly trigger (`0 * * * *`). `worker.ts` calls `/api/internal/cron` through the self service binding, and `src/server/jobs.ts` runs jobs by JST hour (J-01 5:00, J-02/J-03 6:00, J-04 7:00, J-07/J-08 8:00, J-09 3:00, J-14/J-15 4:00, J-10 9:00). Admins can re-run any job from 管理画面 → 連携とジョブ.

## Layout

```
migrations/            spec DDL
scripts/               migrate, seed
worker.ts              Worker entry: OpenNext fetch + scheduled()
src/lib/domain/        pure logic shared by server and UI (judge, recommend, permissions, schemas)
src/server/            auth, db, services, jobs, Squad beyond client
src/app/api/           internal API (spec ch.10), standard error envelope
src/app/(app)/         screens
```

## Status against the spec

Phase 1 screens built: S-01 gallery, S-02 detail, S-04 registration wizard (autosaved drafts, live judgment, AI tags and block decomposition), S-05 Squad beyond candidates, S-06 DPro candidates, S-07 generation (recommendations, streamed set generation, partial regeneration, manual edit and versions, Markdown/PDF export, link to a delivered combination), S-08 my generations, plus A-01, A-02, A-05, A-06, A-07 and A-08.

Not done yet or stubbed:
- **Squad beyond API (U-08)**: `src/server/integrations/squad-beyond.ts` now calls the public API (`ab_tests`, `ab_tests/{uid}/articles`, `articles/{uid}/html`, `branch_operations/ab_tests/{uid}/parameter_summary`, up to 30 days per call). 取り込み候補 is filled only by the 「最新にする」 button, which loads the 3 beyond pages with the most page views in the last 30 days (via `ab_tests/rankings`), with 「さらに読み込む」 for the next 3 (`src/server/sb-refresh.ts`); the registration wizard loads any page's Versions, Version HTML (text + first-view images) and the delivery period's ad parameters on demand (`src/server/services/sb-picker.ts`), and accepts a pasted console URL; the daily J-03 syncs the last 7 days only for pages behind registered 自社実績 (`src/server/sb-sync.ts`). MCV is beyond's CT (`click`, so `mcpa = ad_spending / click`) and MCVR is its `ctr`. Not yet verified against live data: the `ad_status` values (unknown values count as active)
- **DPro (U-10)**: method B intake (`POST /api/dpro/candidates` with `x-service-token`) works. Method A (MCP from the server) is not built
- **Screenshots (J-11)**: no Browser Rendering yet. Article capture extracts the text and a preview (OGP, else the first-view images; `src/lib/domain/lp-preview.ts`); full-page screenshots are uploaded by hand
- **Video analysis (F-13)**: the browser plays the video once at 3× (R2 file, or a Google Drive / direct URL streamed through `/api/creatives/source`), samples up to 24 frames and records the audio; `/api/ai/video-analysis` transcribes it with Workers AI Whisper (`@cf/openai/whisper-large-v3-turbo`) and Claude turns frames + transcript into scenes (台本), hook, appeal points and CTA. Without the AI binding it reads on-screen text only. Drive creatives play in Drive's own embed (viewers need access to the file); analysing them needs 「リンクを知っている全員」 sharing
- **Large uploads**: files go through the Worker (videos capped at 95MB). Presigned multipart R2 upload for files up to 500MB is still to do
- **Queues**: J-03 to J-05 loop over pages inline. Moving them onto Cloudflare Queues is still to do
- **Keyword search**: LIKE on `search_text` (allowed by the spec at thousands of rows). FTS5 trigram still needs to be verified on Turso (U-01)
- **S-12 CSV import, combination edit (PATCH), S-03 compare, S-09 approval flow, S-10 trends, S-11 collections, A-03 NG dictionary editor, A-04 DPro conditions**: not built (S-09 shows approved playbooks read-only)
- **Categories**: the 8 major / 33 minor categories follow the 事例一括登録シート「選択肢」 (`migrations/0004`; old placeholders without products are hidden). Edit them in A-01
