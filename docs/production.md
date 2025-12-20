# Production deployment (small org)

This document describes a production Docker Compose setup that runs:

- **nginx** as the HTTPS reverse proxy for `https://mail.${DOMAIN_NAME}`
- **certbot** to obtain/renew a Let’s Encrypt certificate for `mail.${DOMAIN_NAME}`
- **Stalwart** for SMTP/Submission/IMAP + JMAP (internal-only HTTP for nginx proxy)
- **DuckWebmail UI** served behind nginx

## Prerequisites

- DNS `A/AAAA` record: `mail.${DOMAIN_NAME}` → your server IP
- Firewall opens: **25, 587, 143, 80, 443**
- Docker + Docker Compose plugin installed

## Environment

1. Copy `.env.prod.example` to `.env` and edit it:

```bash
cp .env.prod.example .env
```

## First-time certificate issuance

1. Start nginx (it will answer the ACME HTTP challenge path on port 80):

```bash
docker compose -f docker-compose.prod.yml up -d nginx
```

2. Request the certificate:

```bash
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email \
  -d "mail.$DOMAIN_NAME"
```

3. Copy the cert into the shared TLS directory used by nginx + Stalwart:

```bash
mkdir -p ./stalwart-data/certs
docker compose -f docker-compose.prod.yml run --rm certbot sh -lc \
  'set -eu; d="mail.'\"$DOMAIN_NAME\"'"; \
   cp "/etc/letsencrypt/live/$d/fullchain.pem" /out/certs/tls.crt; \
   cp "/etc/letsencrypt/live/$d/privkey.pem" /out/certs/tls.key; \
   chmod 600 /out/certs/tls.key; \
   ls -la /out/certs'
```

4. Start the full stack:

```bash
docker compose -f docker-compose.prod.yml up -d
```

## Renewal (host cron / systemd timer)

You selected **host-driven renew + reload** (no Docker socket mounted into containers).

Example daily cron (adjust time as you like):

```bash
0 3 * * * cd /opt/duckwebmail && \
  docker compose -f docker-compose.prod.yml run --rm certbot renew --quiet && \
  docker compose -f docker-compose.prod.yml run --rm certbot sh -lc 'set -eu; d="mail.'"$DOMAIN_NAME"'"; cp "/etc/letsencrypt/live/$d/fullchain.pem" /out/certs/tls.crt; cp "/etc/letsencrypt/live/$d/privkey.pem" /out/certs/tls.key; chmod 600 /out/certs/tls.key' && \
  docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload && \
  docker compose -f docker-compose.prod.yml restart stalwart-mail
```

## Backups (minimum)

- Persisted mail data + queues live under `./stalwart-data/` (bind mount).
- The copied TLS material used by nginx + Stalwart lives under `./stalwart-data/certs/` (`tls.crt`, `tls.key`).
- Let’s Encrypt state (ACME account + cert history) is stored in the named volume `letsencrypt`.

### What to back up

- **Must**: `./stalwart-data/`
- **Recommended**: `letsencrypt` volume (helps disaster recovery + avoids re-issuing too often)

### Example backup commands

Back up Stalwart data (bind mount):

```bash
tar -czf "backup-stalwart-data-$(date +%F).tar.gz" ./stalwart-data
```

Back up Let’s Encrypt state (named volume):

```bash
docker run --rm \
  -v duckwebmail_letsencrypt:/src:ro \
  -v "$(pwd)":/dst \
  alpine:3.20 sh -lc \
  'cd /src && tar -czf "/dst/backup-letsencrypt-$(date +%F).tar.gz" .'
```

### Restore notes

- Restore `./stalwart-data/` before starting `stalwart-mail`.
- After restoring/renewing certs, re-copy `fullchain.pem` + `privkey.pem` to `./stalwart-data/certs/tls.crt` + `tls.key`, then:

```bash
docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload
docker compose -f docker-compose.prod.yml restart stalwart-mail
```


