# Deploying LearnVim

The app ships as one Docker container (Node.js server + built frontend + SQLite). A reverse proxy on the
host terminates HTTPS and forwards to the container, which only listens on `127.0.0.1`.

```
Internet ──443──▶ nginx (TLS, gzip) ──▶ 127.0.0.1:3100 ──▶ container :3000 ──▶ /data (SQLite volume)
```

All site-specific values live in `.env` on the server — nothing about your domain or mail server is
hard-coded in the image.

## 1. Prerequisites

- A Linux server with Docker Engine and the Compose plugin (`docker compose version`).
- nginx and certbot on the host (or any other reverse proxy that sets `X-Real-IP`).
- DNS `A` (and optionally `AAAA`) records for your domain (and `www.`) pointing to the server:

  ```bash
  dig +short example.com A
  dig +short www.example.com A
  ```

- An SMTP account that may send as your sender address (see [Email](#4-email)).

## 2. Install the app

```bash
sudo mkdir -p /opt/learnvim && sudo chown "$USER" /opt/learnvim
git clone <your-repository-url> /opt/learnvim
cd /opt/learnvim
cp .env.example .env
chmod 600 .env
$EDITOR .env            # APP_URL, SMTP_*, MAIL_FROM
docker compose up -d --build
docker compose ps       # should become "healthy"
curl -s http://127.0.0.1:3100/healthz   # {"status":"ok","database":"ok"}
docker compose logs -f app              # look for "[mail] SMTP connection ... verified"
```

`APP_PORT` in `.env` changes the host port (default `3100`) if it is already taken.

## 3. Reverse proxy (nginx) and HTTPS

The files in `deploy/nginx/` are ready for `vimrocket.com`; for another domain replace the domain names.
The HTTP part is installed first because nginx refuses to start with a missing certificate.

```bash
# 3.1 HTTP vhost: serves Let's Encrypt challenges and redirects to https
sudo cp deploy/nginx/vimrocket.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/vimrocket.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 3.2 Certificate (webroot from /etc/nginx/letsencrypt_path). Drop the www domain if it has no DNS record.
sudo certbot certonly --webroot -w /www/html/sites/letsencrypt -d vimrocket.com -d www.vimrocket.com

# 3.3 HTTPS vhost
sudo cp deploy/nginx/vimrocket.com-ssl.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/vimrocket.com-ssl.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 3.4 Reload nginx after automatic renewals
echo -e '#!/bin/sh\nsystemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo certbot renew --dry-run
```

Check: `curl -sI https://vimrocket.com | grep -i -E "strict-transport|content-security"`.

The container runs with `TRUST_PROXY=true`, so it uses the `X-Real-IP` header from nginx for rate limiting.
Only expose the container on `127.0.0.1` (as in `docker-compose.yml`) so clients cannot forge that header.

## 4. Email

The app sends two kinds of mail: email confirmation after registration and password-reset links.

`.env` settings:

| Variable      | Meaning                                                              |
| ------------- | -------------------------------------------------------------------- |
| `SMTP_HOST`   | SMTP server hostname (must match its TLS certificate)                |
| `SMTP_PORT`   | `587` (STARTTLS, recommended) or `465` (implicit TLS)                |
| `SMTP_SECURE` | `false` for 587, `true` for 465                                      |
| `SMTP_USER`   | Login of the sending mailbox                                         |
| `SMTP_PASS`   | Its password                                                         |
| `MAIL_FROM`   | Sender, e.g. `"LearnVim <no-reply@example.com>"`                     |

Without `SMTP_HOST` the emails are written to the container log (handy for testing:
`docker compose logs app | grep -A6 "\[mail\]"`).

### Sending from your own domain with mailcow

1. **Add the domain** in the mailcow UI (*Configuration → Mail setup → Domains*).
2. **Create a mailbox** such as `no-reply@<domain>`; use it as `SMTP_USER`/`MAIL_FROM`.
3. **DNS records** for the sending domain (mailcow shows the exact values under *DNS* for the domain):
   - SPF: `TXT  @  "v=spf1 mx a:<your-mail-hostname> -all"`
   - DKIM: `TXT  dkim._domainkey  "v=DKIM1;k=rsa;t=s;s=email;p=..."` (generate in *Configuration → ARC/DKIM keys*)
   - DMARC: `TXT  _dmarc  "v=DMARC1; p=quarantine; rua=mailto:postmaster@<domain>"`
   - Optional but recommended: `MX` record pointing to your mail hostname so replies/bounces arrive.
4. The server's reverse DNS (PTR) should resolve to the mail hostname.
5. Test deliverability with <https://www.mail-tester.com> (register an account with the address it shows).

## 5. Search engines

The production build prerenders every lesson into its own HTML page (title, description, canonical URL,
Open Graph tags, structured data and the lesson text) and the server fills in `APP_URL`. It also serves
`/robots.txt` and `/sitemap.xml` generated from `APP_URL`, and answers unknown URLs with a real `404`.

After the first deployment:

1. Open [Google Search Console](https://search.google.com/search-console), add a **Domain property** for
   your domain and verify it with the DNS `TXT` record it shows.
2. Submit `https://<domain>/sitemap.xml` under *Sitemaps*.
3. Check a few pages with *URL Inspection → Test live URL* (rendered HTML should show the lesson text).
4. Optionally do the same in Bing Webmaster Tools (it can import the Search Console property).

Check locally what crawlers get:

```bash
curl -s https://<domain>/lesson/hjkl | grep -E "<title>|canonical|description"
curl -s https://<domain>/sitemap.xml | head
```

## 6. Backups

The database lives in the Docker volume `learnvim-data`. Create consistent online backups with:

```bash
docker compose exec app node server/backup.ts        # writes /data/backups/learnvim-<time>.db, keeps 14
docker compose cp app:/data/backups ./backups         # copy them off the volume
```

Run it nightly via cron and copy the files to another machine (e.g. with `rsync` or `restic`):

```cron
15 3 * * * cd /opt/learnvim && docker compose exec -T app node server/backup.ts >/dev/null
```

Restore: stop the app, copy a backup to `/data/learnvim.db` inside the volume, start again.

## 7. Updating

```bash
cd /opt/learnvim
git pull
docker compose up -d --build     # database migrations run automatically on start
docker image prune -f
```

## 8. Environment reference

| Variable         | Default (container)   | Purpose                                                  |
| ---------------- | --------------------- | -------------------------------------------------------- |
| `APP_URL`        | — (required)          | Public URL; used in email links, enables Secure cookies + HSTS for `https://` |
| `APP_PORT`       | `3100`                | Host port published on `127.0.0.1`                       |
| `TRUST_PROXY`    | `true` (compose)      | Use `X-Real-IP` / `X-Forwarded-For` from the proxy       |
| `SECURE_COOKIES` | derived from APP_URL  | Force cookie `Secure` flag on/off                        |
| `DATABASE_FILE`  | `/data/learnvim.db`   | SQLite file                                              |
| `BACKUP_DIR`     | `/data/backups`       | Target of `server/backup.ts`                             |
| `BACKUP_KEEP`    | `14`                  | Number of backups to keep                                |
| `SMTP_*`, `MAIL_FROM` | —                | See [Email](#4-email)                                    |
