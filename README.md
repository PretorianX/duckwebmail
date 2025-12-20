# DuckWebmail

DuckWebmail is an all-in-one webmail UI designed to run alongside a JMAP-capable mail server (Stalwart is the reference server in this repository).

## Quick start (Docker Compose)

```bash
docker compose up --build
```

- UI: `http://localhost:8002`
- Stalwart Admin UI/API: `http://localhost:8080`
- Stalwart JMAP over HTTPS: `https://localhost:10443` (self-signed TLS by default)

## Configuration

You can set deployment defaults via environment variables (users can still override later in the UI):

- `VITE_DEFAULT_THEME`: `light` | `dark` | `system` (default: `system`)
- `VITE_DEFAULT_SCHEME`: `duck` | `pure-email` | `paper` | `mono` (default: `duck`)
- `VITE_LOGIN_BRANDING`: string shown on the login screen (default: `DuckWebmail`)

## Stalwart compatibility

This repository is designed and tested as an all-in-one webmail experience using the Stalwart server image configured in `docker-compose.yaml`. Other Stalwart versions/tags are not tested here.

## Disclaimer

This repository is provided **as is**, without warranty of any kind.

## Licensing

- Code is licensed under **MIT** (see `LICENSE`).
- The **DuckWebmail** name and branding are covered by the trademark policy (see `TRADEMARK.md`).
- Commercial licensing inquiries: `commercial@mail-duck.com`.


