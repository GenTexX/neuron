# Neuron auf einem Ubuntu-Server — Schritt für Schritt

Diese Anleitung führt von einem frischen Ubuntu-Server (22.04 oder 24.04) zu einer erreichbaren
Installation mit nginx und HTTPS. Jeder Befehl ist zum Kopieren gedacht; nach jedem Abschnitt
steht, woran du erkennst, dass er geklappt hat.

**Was wo läuft:** Docker baut zwei Dinge — das Frontend (SvelteKit) und die API (Rust). Die API
liefert das fertige Frontend selbst aus, es gibt also nur einen Dienst plus Postgres. nginx steht
davor und kümmert sich um HTTPS.

**pnpm, cargo und sqlx-cli brauchst du für diesen Weg nicht.** Docker bringt seine eigenen
Werkzeuge mit. Wenn du lieber ohne Docker direkt auf dem Server baust, siehe
[Variante ohne Docker](#variante-ohne-docker) ganz unten.

---

## 0. Was der Server braucht

|        |                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| RAM    | **2 GB** für den Build. Mit 1 GB wird der Rust-Compiler vom OOM-Killer beendet — siehe [Wenn der Build abbricht](#wenn-der-build-abbricht). |
| Platte | ~3 GB für Images und Build-Zwischenstände                                                                                                   |
| Ports  | 80 und 443 (nginx). Die App selbst bleibt auf `127.0.0.1`.                                                                                  |

Im Betrieb ist Neuron genügsam: API rund 30 MB, Postgres etwa 100 MB.

Für HTTPS brauchst du eine Domain, deren A-Record (und ggf. AAAA-Record) auf die IP deines
Servers zeigt. Ohne Domain geht es auch — dann überspringst du Abschnitt 6 und liest den Kasten
in Abschnitt 3.

---

## 1. Docker installieren

Ubuntus eigenes `docker.io`-Paket ist meist veraltet und bringt das `compose`-Plugin nicht mit.
Nimm das offizielle Repository von Docker:

```sh
# Alte oder abweichende Pakete entfernen, falls vorhanden
for p in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  sudo apt remove -y $p 2>/dev/null
done

sudo apt update
sudo apt install -y ca-certificates curl

# Signaturschlüssel hinterlegen
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Repository eintragen
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Docker ohne `sudo` benutzen:

```sh
sudo usermod -aG docker "$USER"
newgrp docker          # oder einmal ab- und wieder anmelden
```

**Kontrolle:**

```sh
docker --version           # z. B. Docker version 29.x
docker compose version     # z. B. Docker Compose version v2.x
docker run --rm hello-world
```

Der Dienst startet künftig automatisch mit:

```sh
sudo systemctl enable --now docker
```

---

## 2. Projekt klonen

Übliche Orte für selbst betriebene Dienste sind `/opt` und `/srv`. Nimm `/opt/neuron` und mach
dich selbst zum Eigentümer, damit du ohne `sudo` arbeiten kannst:

```sh
sudo apt install -y git
sudo mkdir -p /opt/neuron
sudo chown "$USER:$USER" /opt/neuron
git clone https://github.com/GenTexX/neuron.git /opt/neuron
cd /opt/neuron
git checkout claude/neuron-projekt-aufbauen-qioic7
```

Ab hier gilt: **alle weiteren Befehle laufen in `/opt/neuron`.**

**Kontrolle:** `ls docker-compose.yml` findet die Datei.

---

## 3. Konfiguration anlegen

Docker Compose liest eine Datei namens `.env` aus dem Projektverzeichnis. Die Vorlage dafür ist
`.env.deploy.example` — **nicht** `.env.example`, das ist die Vorlage für die lokale Entwicklung.

```sh
cp .env.deploy.example .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48)|" .env
```

Jetzt `.env` öffnen (`nano .env`) und die restlichen Werte setzen. Für den Betrieb hinter nginx
mit der Domain `neuron.example.org`:

```ini
JWT_SECRET=<der erzeugte Wert – nicht anfassen>

# HTTPS steht über nginx bereit, also darf das Cookie Secure sein
COOKIE_SECURE=true
COOKIE_DOMAIN=neuron.example.org
CORS_ORIGINS=https://neuron.example.org

# nginx meldet die echte Client-IP; ohne das landen alle Nutzer im selben
# Rate-Limit-Topf. Nur zusammen mit Abschnitt 6 einschalten!
TRUST_PROXY_HEADERS=true

RUST_LOG=info,neuron_api=info
```

> ### Zwei Werte, die man leicht falsch setzt
>
> **`COOKIE_SECURE`** — mit HTTPS `true`, **ohne HTTPS zwingend `false`**. Steht er ohne HTTPS auf
> `true`, verwirft der Browser das Refresh-Cookie stillschweigend. Die Anmeldung scheint zu
> klappen, ist aber nach dem nächsten Neuladen weg. Das sieht nicht nach einem Cookie-Problem
> aus, sondern nach einem kaputten Login.
>
> **`TRUST_PROXY_HEADERS`** — nur auf `true`, wenn die App **ausschließlich** über nginx
> erreichbar ist (Abschnitt 6 macht genau das). Sonst kann sich jeder ein eigenes
> `X-Forwarded-For` setzen und das Rate Limiting der Anmeldung aushebeln.
>
> Die API schreibt beim Start in ihr Log, welche Variante gerade gilt.

**Ohne Domain / nur über die IP:** `COOKIE_SECURE=false`, `TRUST_PROXY_HEADERS=false`,
`CORS_ORIGINS=http://<server-ip>:8080` — und in `docker-compose.yml` den Port auf
`'8080:8080'` lassen (siehe Abschnitt 5). Abschnitt 6 überspringst du dann.

**Kontrolle:**

```sh
grep -E '^(JWT_SECRET|COOKIE_SECURE|TRUST_PROXY_HEADERS)=' .env
```

---

## 4. Starten

```sh
docker compose up -d --build
```

Der erste Durchlauf dauert 5–15 Minuten, weil Rust alle Abhängigkeiten übersetzt. Spätere Starts
gehen in Sekunden.

**Kontrolle:**

```sh
docker compose ps          # beide Dienste "running", api zusätzlich "healthy"
curl http://127.0.0.1:8080/api/health        # -> ok
docker compose logs api | tail -20
```

Im Log sollte stehen: `migrations applied`, `ranked rounds rotated`, `neuron-api listening`.

Migrationen und die Ranked-Runden für heute und morgen legt die API beim Start selbst an; du
musst `sqlx migrate` nicht von Hand aufrufen.

---

## 5. Port nur lokal öffnen

Solange nginx davor kommt, soll die App nicht direkt aus dem Netz erreichbar sein. Öffne
`docker-compose.yml` und ändere beim Dienst `api`:

```yaml
ports:
  - '127.0.0.1:8080:8080'
```

```sh
docker compose up -d
```

**Kontrolle:** `curl http://127.0.0.1:8080/api/health` geht weiterhin, `curl http://<server-ip>:8080`
von außen nicht mehr.

Postgres ist bereits nur auf `127.0.0.1` veröffentlicht.

---

## 6. nginx und HTTPS

```sh
sudo apt install -y nginx
```

Konfiguration anlegen — `sudo nano /etc/nginx/sites-available/neuron`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name neuron.example.org;

    # Etwas Luft für Submits mit vielen Trials
    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        # Ohne diese vier Zeilen sieht die API nur nginx: das Rate Limiting
        # der Anmeldung würde alle Nutzer in einen Topf werfen, und die
        # Cookie-Einstellung passt nicht zum tatsächlichen Protokoll.
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 60s;
    }
}
```

Aktivieren, Standardseite abschalten, prüfen, neu laden:

```sh
sudo ln -sf /etc/nginx/sites-available/neuron /etc/nginx/sites-enabled/neuron
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t                 # muss "syntax is ok" und "test is successful" sagen
sudo systemctl reload nginx
```

**Kontrolle:** `curl http://neuron.example.org/api/health` gibt `ok`.

Jetzt das Zertifikat. Certbot trägt die TLS-Konfiguration selbst in die Datei ein:

```sh
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d neuron.example.org
```

Certbot fragt nach einer E-Mail-Adresse und bietet an, HTTP auf HTTPS umzuleiten — das willst du.
Die Erneuerung übernimmt ein mitgelieferter Timer.

**Kontrolle:**

```sh
curl -I https://neuron.example.org        # HTTP/2 200
systemctl list-timers | grep certbot      # Erneuerung ist eingeplant
```

Wenn du `.env` in Abschnitt 3 noch auf `COOKIE_SECURE=false` stehen hattest, jetzt auf `true`
setzen und `docker compose up -d` ausführen.

---

## 7. Firewall

```sh
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Sperr dich nicht aus: `OpenSSH` muss vor `ufw enable` erlaubt sein.

---

## 8. Läuft es nach einem Neustart wieder?

Ja — `restart: unless-stopped` in `docker-compose.yml` sorgt dafür, sobald der Docker-Dienst
selbst aktiviert ist (Abschnitt 1). Prüfen kannst du es ehrlich mit:

```sh
sudo reboot
# nach dem Hochfahren
docker compose -f /opt/neuron/docker-compose.yml ps
curl https://neuron.example.org/api/health
```

---

## 9. Aktualisieren

```sh
cd /opt/neuron
git pull
docker compose up -d --build
```

Die Daten liegen im Docker-Volume `neuron_pgdata` und überleben das. Neue Migrationen laufen beim
Start automatisch.

---

## 10. Sichern

```sh
# Sicherung
docker compose exec -T postgres pg_dump -U neuron neuron | gzip > ~/neuron-$(date +%F).sql.gz

# Wiederherstellung
gunzip -c ~/neuron-2026-09-03.sql.gz | docker compose exec -T postgres psql -U neuron neuron
```

Täglich per cron (`crontab -e`):

```
15 4 * * * cd /opt/neuron && docker compose exec -T postgres pg_dump -U neuron neuron | gzip > ~/backups/neuron-$(date +\%F).sql.gz
```

Vorher `mkdir -p ~/backups`. Denk daran, alte Sicherungen irgendwann zu löschen — und sie
gelegentlich woanders hinzukopieren; eine Sicherung auf derselben Platte ist keine.

---

## 11. Erster Nutzer und Admin

Registriere dich über die Weboberfläche. Für Admin-Rechte (Spiele deaktivieren, Runs für
ungültig erklären) danach:

```sh
docker compose exec postgres psql -U neuron -d neuron \
  -c "UPDATE app_user SET role = 'admin' WHERE email = 'du@example.org';"
```

Nach dem nächsten Anmelden gilt die Rolle.

---

## Fehlersuche

**`JWT_SECRET muss gesetzt sein`** — die `.env` liegt nicht neben `docker-compose.yml`, oder die
Zeile fehlt. Compose liest sie nur aus dem Projektverzeichnis.

**`Konfiguration unvollständig: … fehlt`** — die API nennt beim Start alle fehlenden Variablen.

**Anmeldung hält nicht über das Neuladen hinweg** — fast immer `COOKIE_SECURE=true` ohne HTTPS.
Siehe Kasten in Abschnitt 3.

**`429 Zu viele Versuche` beim Anmelden** — das Rate Limiting greift: 10 Versuche pro IP und
15 Minuten (§8). Wenn mehrere Leute hinter derselben IP sitzen, kannst du in
`docker-compose.yml` beim Dienst `api` `AUTH_RATE_LIMIT_BURST: '30'` ergänzen. Steht der Wert
scheinbar grundlos an, prüfe `TRUST_PROXY_HEADERS` und die vier `proxy_set_header`-Zeilen —
ohne sie sehen alle Nutzer für die API wie eine einzige IP aus.

**502 Bad Gateway von nginx** — die App läuft nicht oder hört woanders.
`docker compose ps` und `docker compose logs api` ansehen.

**`nginx -t` meldet `socket() [::]:80 failed (97: Address family not supported)`** — auf dem
Server ist IPv6 abgeschaltet. Entweder IPv6 aktivieren oder die Zeile `listen [::]:80;` aus der
Konfiguration löschen; die IPv4-Zeile genügt.

**Die Seite lädt, aber Spiele starten nicht** — die API vergibt Seed und Config, ohne sie geht
nichts. Meist ist die Datenbank nicht erreichbar: `docker compose logs api`.

**Logs allgemein:**

```sh
docker compose logs -f api        # Strg-C beendet nur das Mitlesen
sudo journalctl -u nginx -f
```

### Wenn der Build abbricht

Endet der Rust-Build mit `Killed` oder ohne Meldung, fehlt Arbeitsspeicher.

**Swap einrichten** (langsamer, aber kostenlos):

```sh
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

**Oder woanders bauen** und nur das fertige Image übertragen:

```sh
# auf deinem Rechner, im Projektverzeichnis
docker build -t neuron-api .
docker save neuron-api | gzip | ssh benutzer@server 'gunzip | docker load'
```

Dann auf dem Server in `docker-compose.yml` den `build:`-Block durch `image: neuron-api`
ersetzen.

---

## Variante ohne Docker

Du hast pnpm, cargo und sqlx-cli schon — dann geht es auch direkt. Etwas mehr Handarbeit, dafür
kein Docker und ein deutlich sparsamerer Build.

```sh
# Postgres aus den Ubuntu-Paketen
sudo apt install -y postgresql
sudo -u postgres psql -c "CREATE USER neuron WITH PASSWORD 'einsicheres-passwort';"
sudo -u postgres psql -c "CREATE DATABASE neuron OWNER neuron;"

# Bauen
cd /opt/neuron
pnpm install --frozen-lockfile
pnpm --filter @neuron/web build
cargo build --release --manifest-path apps/api/Cargo.toml
```

Konfiguration nach `/opt/neuron/apps/api/.env` (Vorlage: `.env.example`), mit
`STATIC_DIR=/opt/neuron/apps/web/build` und `BIND_ADDR=127.0.0.1:8080`.

systemd-Unit unter `/etc/systemd/system/neuron.service`:

```ini
[Unit]
Description=Neuron API
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=neuron
WorkingDirectory=/opt/neuron/apps/api
ExecStart=/opt/neuron/apps/api/target/release/neuron-api
Restart=on-failure
RestartSec=5s

# Die .env liegt im WorkingDirectory und wird von der API selbst gelesen.
# Etwas Absicherung, kostet nichts:
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/neuron

[Install]
WantedBy=multi-user.target
```

```sh
sudo useradd --system --home /opt/neuron --shell /usr/sbin/nologin neuron
sudo chown -R neuron:neuron /opt/neuron
sudo systemctl daemon-reload
sudo systemctl enable --now neuron
sudo systemctl status neuron
```

nginx davor wie in Abschnitt 6. Beim Aktualisieren: `git pull`, neu bauen,
`sudo systemctl restart neuron`.
