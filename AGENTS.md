# AGENTS.md

## Cursor Cloud specific instructions

### Overview

DuckWebmail is a duck-themed webmail SPA (React/TypeScript/Vite) that communicates with a Stalwart JMAP mail server. For standard commands (dev, test, lint, build) see `CONTRIBUTING.md` and `package.json` scripts.

### Node.js version

CI uses **Node.js 24**. Use `nvm install 24 && nvm use 24` before running any commands.

### Running the full stack (Docker Compose)

```bash
docker compose up --build -d
```

- **webmail-ui**: Vite dev server at `http://localhost:8002` (hot-reload enabled)
- **stalwart-mail**: JMAP server at `https://localhost:10443` (self-signed TLS), admin UI at `http://localhost:8080` (user: `admin`, password: `admin`)
- **stalwart-certgen**: one-shot init container generating self-signed TLS certs

### Stalwart user setup gotcha

Stalwart v0.15.x ships with a granular permission system. Newly created users have **no JMAP permissions** by default. To create a working mail user via the admin API:

1. Create a domain with a real TLD (e.g., `duckmail.com`). Stalwart rejects identity creation for domains like `localhost` or `.local`.
2. Create the user principal.
3. **Assign the `"user"` role** and enable the `"authenticate"` permission:
   ```bash
   curl -u admin:admin -X PATCH http://localhost:8080/api/principal/<username> \
     -H "Content-Type: application/json" \
     -d '[{"action":"set","field":"roles","value":["user"]},{"action":"set","field":"enabledPermissions","value":["authenticate"]}]'
   ```

Without the role and permission, the user can authenticate to Stalwart but the JMAP session will return empty capabilities and Identity/set will fail.

### Vite proxy targets Docker hostnames

`vite.config.ts` proxies `/jmap/*` to `https://stalwart-mail:443` — the Docker Compose service name. When running `npm run dev` **outside** Docker, you must either:
- Start Stalwart via `docker compose up stalwart-certgen stalwart-mail -d` and adjust the proxy target to `https://localhost:10443`, or
- Run the full stack in Docker.
