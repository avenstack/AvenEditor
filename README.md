# AvenEditor

AvenEditor is a mobile-first Markdown/code editor built with React, TypeScript, and Vite.

Current behavior supports two working modes:
- Local mode: files/folders are persisted in browser storage.
- Server mode: connect to a filesystem workspace via `working directory + access key`.

## Current Features

- Hierarchical file/folder browser with search
- Create, rename, delete files and folders (local or server mode)
- CodeMirror editor with language-aware syntax
- Markdown preview (`remark-gfm` + `rehype-sanitize`)
- Code runner panel for `javascript`, `typescript`, `html`, `python`
- Command palette (`Ctrl+K` / `Cmd+K`)
- Zen mode
- Server workspace connect/reconnect/disconnect dialog
- On-demand server folder listing + lazy file loading
- Remote file cache reuse keyed by `contentHash`
- Optional write history snapshots (`.history`) on server

## Supported File Types

- `markdown` (`.md` and unknown extensions)
- `javascript` (`.js`)
- `typescript` (`.ts`, `.tsx`)
- `html` (`.html`)
- `css` (`.css`)
- `json` (`.json`)
- `python` (`.py`)
- `yaml` (`.yml`, `.yaml`)

## Local Development

### Prerequisites

- Node.js `18+`
- npm

### Install

```bash
npm install
```

### Fullstack Dev (recommended)

```bash
npm run dev
```

- Serves UI + API from one origin
- Default URL: `http://localhost:3000`
- HMR for fullstack dev is controlled by `AVENEDITOR_DEV_HMR` (default `false`)

### Client Only (Vite)

```bash
npm run dev:client
```

- Default URL: `http://localhost:3000` (script sets `--port=3000`)

### API Only

```bash
npm run dev:server
```

- Default URL: `http://localhost:8787` (unless `PORT` is set)
- If `dist/` exists, this process also serves built frontend assets

### Build and Run Production Server

```bash
npm run build
npm run server
```

### Type Check / Test

```bash
npm run lint
npm test
```

`npm test` currently maps to the same TypeScript check as `npm run lint`.

## Environment Variables

Refer to [.env.example](./.env.example) for the full template. Key values:

- `AVENEDITOR_ACCESS_KEY` (required): server auth key for session creation
- `AVENEDITOR_WORKSPACE_ROOT` (optional): restrict allowed workspaces to a root directory
- `AVENEDITOR_SESSION_TTL_SECONDS` (optional, default `604800`)
- `AVENEDITOR_MAX_TREE_ENTRIES` (optional, default `5000`)
- `AVENEDITOR_IGNORE_FILE` (optional, default `.avenignore`): ignore file path/name (relative paths resolve from workspace root)
- `AVENEDITOR_IGNORE_DIRS` (optional, default `node_modules,.git,dist`): always merged with ignore file rules
- `AVENEDITOR_MAX_FILE_SIZE_BYTES` (optional, default `1048576`)
- `AVENEDITOR_ALLOW_ORIGIN` (optional, default `*`)
- `AVENEDITOR_HISTORY_ENABLED` (optional, default `true`)
- `AVENEDITOR_HISTORY_DIR` (optional, default `.history`)
- `AVENEDITOR_READ_ONLY` (optional, default `true`)

Important: write operations are blocked by default because `AVENEDITOR_READ_ONLY=true`.
Set it to `false` when you want create/update/delete in server mode.

## Docker Deployment

### 1) Prepare env

```bash
cp .env.example .env
```

Set at least:
- `AVENEDITOR_ACCESS_KEY`
- `AVENEDITOR_WORKSPACE_HOST_PATH` (host path mounted to container `/workspace`)

If you need write access from the editor:
- `AVENEDITOR_READ_ONLY=false`

### 2) Start

```bash
docker compose up -d --build
```

### 3) Connect from UI

- Open: `http://<server-ip>:<AVENEDITOR_HTTP_PORT>`
- In `Server Workspace` dialog:
  - `API Base URL`: same origin (or leave empty to use current origin)
  - `Working Directory`: `/workspace`
  - `Access Key`: value of `AVENEDITOR_ACCESS_KEY`

## Server Mode Notes

- Access key is checked with constant-time comparison.
- A bearer token is used after session creation.
- Workspace traversal (`..`) is blocked.
- Session token is persisted across page refresh while still valid.
- Session validity is controlled by `AVENEDITOR_SESSION_TTL_SECONDS` (server-side).

This project is still MVP-level security. For production hardening, add rate limiting, stronger auth/rotation, audit logs, and network controls.

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

MIT, see [LICENSE](./LICENSE).

## Project Structure

```text
server/
  apiApp.ts
  dev.ts
  ignore.ts
  index.ts
src/
  App.tsx
  store.ts
  serverApi.ts
  components/
    CodeRunner.tsx
    CommandPalette.tsx
    ConfirmDialog.tsx
    Editor.tsx
    FileList.tsx
    Preview.tsx
    RenameDialog.tsx
    ServerConnectDialog.tsx
    Toolbar.tsx
```
