# AvenEditor

AvenEditor is a mobile-first Markdown and code editor built with React, TypeScript, and Vite.

It supports two modes:
- Local mode: files are stored in browser local storage.
- Server mode: connect to a server workspace using `working directory + key`, then edit real server files.

## Implemented Features

- File/folder browser with search
- Create, rename, delete files and folders
- CodeMirror editor
- Markdown preview (`remark-gfm` + sanitize)
- Code runner panel (`javascript`, `typescript`, `html`, `python`)
- Command palette (`Ctrl+K` / `Cmd+K`)
- Zen mode
- Custom dialogs (delete / rename / server connect)
- Remote server workspace connection with key-based auth (MVP)
- On-demand file loading with local cache reuse (matched by `contentHash`)

## Supported File Types

- `markdown` (`.md` and unknown extensions)
- `javascript` (`.js`)
- `typescript` (`.ts`, `.tsx`)
- `html` (`.html`)
- `css` (`.css`)
- `json` (`.json`)
- `python` (`.py`)

## Run Locally

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Fullstack Dev (Next.js-like single origin)

```bash
npm run dev
```

UI and API share same origin by default:
- `http://localhost:3000`

### Optional: Run UI Only

```bash
npm run dev:client
```

### Optional: Run API Only

```bash
npm run dev:server
```

API-only default URL:
- `http://localhost:8787`

### Type Check

```bash
npm run lint
```

### Test (Current Baseline)

```bash
npm test
```

### Build Frontend

```bash
npm run build
```

## Deploy with Docker

### 1) Prepare env

Copy env template and set at least:
- `AVENEDITOR_ACCESS_KEY` (required)
- `AVENEDITOR_WORKSPACE_HOST_PATH` (host path to edit)
- optional `AVENEDITOR_HTTP_PORT` (default `3000`)

```bash
cp .env.example .env
```

### 2) Start

```bash
docker compose up -d --build
```

### 3) Open

- UI + API same origin: `http://<server-ip>:<AVENEDITOR_HTTP_PORT>`
- In `Server Workspace` dialog:
  - `API Base URL`: same origin, e.g. `http://<server-ip>:3000`
  - `Working Directory`: `/workspace`
  - `Access Key`: your `AVENEDITOR_ACCESS_KEY`

## Server Mode Setup (MVP)

Set env values before starting server:

- `AVENEDITOR_ACCESS_KEY` (required): shared secret used to create session token
- `AVENEDITOR_WORKSPACE_ROOT` (optional): restrict workspaces to a safe root directory
- `AVENEDITOR_SESSION_TTL_MS` (optional): session TTL, default 8h
- `AVENEDITOR_MAX_TREE_ENTRIES` (optional): workspace tree limit, default 5000
- `AVENEDITOR_IGNORE_DIRS` (optional): comma-separated folder names ignored during tree scan (default `node_modules,.git,dist`)
- `AVENEDITOR_MAX_FILE_SIZE_BYTES` (optional): max file read size, default 1MB
- `AVENEDITOR_ALLOW_ORIGIN` (optional): CORS allowed origin, set explicit frontend origin in production
- `AVENEDITOR_HISTORY_ENABLED` (optional): whether to write save diffs into history folder (default `true`)
- `AVENEDITOR_HISTORY_DIR` (optional): history folder name (default `.history`)

Check `.env.example` for full list.

Then in UI:
1. Open menu `...` -> `Server Workspace`
2. Fill `API Base URL`, `Working Directory`, `Access Key`
3. Click `Connect`

When running `npm run dev` or Docker deployment, `API Base URL` can use current origin (or leave empty).

After connecting, all file operations run against server filesystem APIs.
For safer defaults, session tokens are not persisted across page reloads; reconnect after refresh.

## Security Notes (MVP Scope)

- Key is verified with constant-time comparison on server.
- Key is only used to create a session; subsequent calls use bearer token.
- Workspace path traversal is blocked.
- Optional root restriction can confine allowed directories.
- Use HTTPS in production.

This is still MVP security; for production-hardening, add rate limiting, IP controls, audit logs, and stronger auth/rotation.

See [SECURITY.md](./SECURITY.md) for vulnerability reporting guidance.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

MIT, see [LICENSE](./LICENSE).

## Project Structure

```text
server/
  apiApp.ts
  dev.ts
  index.ts
src/
  App.tsx
  store.ts
  serverApi.ts
  components/
    FileList.tsx
    Editor.tsx
    Preview.tsx
    CodeRunner.tsx
    Toolbar.tsx
    CommandPalette.tsx
    ConfirmDialog.tsx
    RenameDialog.tsx
    ServerConnectDialog.tsx
docs/
  architecture.md
  design-spec.md
  tech-stack.md
  visual-design.md
```
