# RISK-XVII Online Lab (Next.js)

This is a Next.js frontend for interactive VM learning, plus an API wrapper around the existing `vm_riskxvii` C binary.

## What it does

- Build a small instruction program directly in the browser (no `.mi` upload required).
- Execute the program step-by-step (`Step`) or continuously (`Run`).
- Watch register updates and PC movement after each instruction.
- Inspect output logs from `PRINT`, runtime errors, or `HALT`.
- Still supports `/api/run` for `.mi` execution through backend API.

## Local run

From project root:

```bash
make
cd web
npm install
npm run dev
```

Open `http://localhost:3000`.

## API contract

`POST /api/run` as `multipart/form-data`:

- `program`: `.mi` file
- `stdin`: optional text input

Response:

```json
{
  "code": 1,
  "output": "46CPU Halt Requested"
}
```

## Deployment notes

This project depends on a native executable (`vm_riskxvii`).

- If deploying to serverless platforms, ensure native binary execution is supported.
- For stable deployment, use a container platform (Render, Fly.io, Railway, ECS, etc.) and compile `vm_riskxvii` during build.

Example Docker build steps:

1. Install build tools (`gcc`, `make`).
2. Run `make` at repository root.
3. Run `npm ci && npm run build` in `web/`.
4. Start with `npm run start`.
