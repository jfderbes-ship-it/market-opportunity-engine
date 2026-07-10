# Restart Handoff

Use this file first when resuming work.

## Current Snapshot

- Local path: `C:\dev_bollinger_band_invest_tool`
- App URL during development: `http://127.0.0.1:5173/`
- Git branch: `main`
- Last known commit before these notes: `9f77055 Initial market opportunity engine`
- GitHub target: `jfderbes-ship-it/market-opportunity-engine`

## Quick Start

```bash
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:5173/
```

## Verification Commands

```bash
npm test
npm run build
npm audit
```

## Immediate Next Steps

1. Create an empty GitHub repository named `market-opportunity-engine` under `jfderbes-ship-it`.
   - Prefer private while the tool is in prototype stage.
   - Do not initialize it with README, `.gitignore`, or license.
2. Push the local repo:

```bash
git push -u origin main
```

If SSH needs the project key:

```bash
git -c core.sshCommand="C:/Windows/System32/OpenSSH/ssh.exe -i C:/Users/jfder/.ssh/sharkfin_github_ed25519 -o IdentitiesOnly=yes" push -u origin main
```

3. Continue product development:
   - Add a watchlist/symbol universe editor.
   - Improve provider error states and refresh timestamps.
   - Add backend proxy plan for provider keys and Yahoo-like data access.
   - Add tests around scoring and provider normalization.

## Known Constraints

- This is a research and education tool only.
- Free market data is usually delayed, rate-limited, unofficial, or limited by terms of use.
- Vite `VITE_*` env vars are exposed to the browser, so production API calls should move behind a backend.
- Current Yahoo provider is a prototype path through the local dev proxy, not a production-grade provider contract.

