# LearnVim

An interactive course for learning Vim in the browser. Each lesson pairs a short explanation with a
fully working Vim editor and a task that is checked automatically. Guests keep their progress in
`localStorage`; registered users have it stored on the server.

Requires Node.js 23.6 or newer (the server is TypeScript run directly by Node, with the built-in `node:sqlite`).

## Getting started

```bash
npm install
npm run dev        # API server (port 3001) + Vite dev server with /api proxy
npm test           # engine, lesson, UI and API tests
npm run build      # type-check frontend + server and build into dist/
npm start          # production: serves dist/ and the API on port 3001
```

Without `SMTP_HOST` the server prints verification and password-reset emails to the console, so the full
account flow works locally without a mail server.

### Production

See [DEPLOYMENT.md](DEPLOYMENT.md): Docker image, `docker-compose.yml`, nginx + Let's Encrypt, email
(SMTP/mailcow), backups and all environment variables (`.env.example` is the template).

## Structure

- `src/vim/` – the Vim engine (buffer, motions, text objects, command parser, normal/visual/insert modes, ex commands)
- `src/lessons/` – chapters, lessons and chapter tests; every task has a solution that is verified by the tests
- `src/ui/` – editor view, syntax highlighting, pages, sidebar, progress storage and the session/API client
- `src/styles/` – `base`, `sidebar`, `pages`, `editor` and `layout` (incl. responsive rules) stylesheets
- `server/` – HTTP server: accounts with email confirmation and password reset (scrypt hashes, HttpOnly session cookies), progress API, `/healthz`, static files, SQLite migrations and backups
- `src/seo/` – page metadata shared by the app and the build-time prerenderer (one HTML page per lesson, sitemap paths)
- `public/` – favicon, web manifest and the social sharing image
- `deploy/` – nginx configuration for the production domain

To add a lesson, append it to a chapter in `src/lessons/basics.ts`, `advanced.ts` or `practice.ts`
with `text`, a `target` and/or `check`, and a `solution`. The test suite ensures it is solvable.
