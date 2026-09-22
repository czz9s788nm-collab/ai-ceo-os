# AI CEO OS

AI CEO OS is a local-first executive operating system for solo founders and
small teams. It combines business dashboards, tasks, schedules, channel records,
decision tracking, and operational reports in one self-hosted workspace.

## Why this project exists

Most business operating tools are either generic task trackers or large-company
platforms. AI CEO OS explores a smaller, owner-operated model: one workspace that
keeps decisions, evidence, execution, and business context together while the
human owner retains final authority.

## Current capabilities

- Owner account setup and password-based sign-in
- Local SQLite persistence and hashed session tokens
- Task, record, schedule, and business-channel workflows
- Cross-device workspace state synchronization
- Conflict detection for concurrent workspace updates
- Local backup and restore flows
- Public/private presentation modes for sensitive business fields

## Requirements

- Node.js 22.13 or newer

## Run locally

```bash
npm install
npm start
```

Open `http://127.0.0.1:3000`. The first visitor creates the owner account.
Use a unique password; the demo data is fictional and safe to replace.

To store runtime data elsewhere:

```bash
WORKBENCH_DATA_DIR=/path/to/private/data npm start
```

## Development

```bash
npm test
npm run check
```

## Data and privacy

Runtime data lives under `data/` by default and is intentionally ignored by
Git. Never commit production databases, exports, credentials, or customer data.
The included business names, people, metrics, and scenarios are fictional demo
content.

## Project status

This is an early open-source candidate. The immediate roadmap is to modularize
the front end, expand API tests, document deployment behind HTTPS, and improve
accessibility and localization.

## License

MIT. See [LICENSE](LICENSE).

