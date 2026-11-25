# Repository Agent Guide

## Development Workflow

- Do not refactor out of agreed scope.
- Use `npm run build` for TypeScript validation and `npm test` for the AVA unit
  suite. Run one spec with `npm test -- src/path/example.spec.ts`.
- Run the narrowest relevant unit spec first, then `npm run build`. Run the full
  suite when shared scheduler, executor, or processor behavior changes.
- The `e2e:*` scripts require external services and are not part of the default
  validation loop. Do not run them or start runtime processes unless requested.
- Do not inspect local development database data unless the user explicitly
  requests it. The local database may not contain records relevant to the task;
  use entities, migrations, repository contracts, supplied logs, fixtures, and
  tests as the primary evidence for design and debugging.
- Report commands that passed, commands that failed, and checks that could not
  run. Do not repair unrelated failures.

## Runtime Architecture

- This is a multi-process service. `START_AS=JOB_SCHEDULER`,
  `START_AS=JOB_EXECUTOR`, and `START_AS=API_SERVER` select different bindings
  and behavior in [src/main.ts](src/main.ts) and
  [src/WebServer.ts](src/WebServer.ts). Do not treat them as interchangeable.
- `EXEC_MODE=META_MODE` is a specialized executor path. Keep scheduler,
  executor, API, and metadata responsibilities within their existing process
  boundaries.
- Prefer the existing processor pipeline and media runtime types under
  `src/utils/Runtime` instead of introducing a parallel media representation.
- Runtime dependencies include PostgreSQL, RabbitMQ, S3-compatible storage,
  ffmpeg (including ffprobe), and local filesystem paths. Executor identity persists
  under `~/.mira`; do not delete or replace it unless explicitly requested.

## Database And Rule Safety

- Never run `npm run migrate:sync` or `npm run migrate:sync:silent` without
  explicit approval and a confirmed disposable target. Both commands drop all
  tables and data.
- Treat `migrate:generate`, `migrate:init`, and `migrate:upgrade` as explicit
  database tasks, not validation commands.
- For rule behavior, use [docs/rule-guide.md](docs/rule-guide.md). For processor
  profiles, use
  [src/processors/profiles/README.md](src/processors/profiles/README.md).