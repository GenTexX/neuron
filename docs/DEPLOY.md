# Neuron auf einem Ubuntu-Server betreiben

Der einfachste Weg: Docker Compose baut beide Teile und startet API und Datenbank. Die API
liefert das fertige Frontend selbst aus, du brauchst also keinen zusätzlichen Webserver.

Getestet gegen Ubuntu 22.04 und 24.04.

## Was der Server braucht

- **2 GB RAM** für den Build. Der Rust-Release-Build ist der Speicherfresser; mit 1 GB läuft er
  in den OOM-Killer. Abhilfe siehe [Wenn der Build abbricht](#wenn-der-build-abbricht).
- **~3 GB Plattenplatz** für Build-Zwischenstände und Images.
- Offener Port für die App (Standard 8080) oder ein Reverse Proxy davor.

Im Betrieb ist Neuron genügsam: die API braucht rund 30 MB, Postgres etwa 100 MB.

## 1. Docker installieren

```sh
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Damit du Docker ohne `sudo` bedienen kannst:

```sh
sudo usermod -aG docker "$USER"
newgrp docker          # oder einmal ab- und wieder anmelden
docker run --rm hello-world
```

## 2. Projekt holen

```sh
sudo apt install -y git
git clone https://github.com/GenTexX/neuron.git
cd neuron
git checkout claude/neuron-projekt-aufbauen-qioic7
```

## 3. Konfiguration anlegen

Compose liest eine `.env` im Projektverzeichnis. Die Vorlage dafür ist `.env.deploy.example`
(nicht `.env.example` – das ist die Vorlage für die lokale Entwicklung).

```sh
cp .env.deploy.example .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48)|" .env
grep '^JWT_SECRET=' .env         # sollte jetzt einen langen Zufallswert zeigen
```

> **Der wichtigste Schalter: `COOKIE_SECURE`.**
> Ohne HTTPS muss er auf `false` stehen. Sonst setzt die API das Refresh-Cookie mit dem
> `Secure`-Flag, der Browser verwirft es stillschweigend, und die Anmeldung hält nur bis zum
> nächsten Neuladen. Mit HTTPS (Abschnitt 6) setzt du ihn auf `true`.
> Die API schreibt beim Start in ihr Log, welche Variante gerade gilt.

## 4. Starten

```sh
docker compose up -d --build
```

Der erste Durchlauf dauert einige Minuten, weil Rust alle Abhängigkeiten übersetzt. Danach:

```sh
docker compose ps          # beide Dienste "running", api "healthy"
docker compose logs -f api # Strg-C beendet nur das Mitlesen
```

Prüfen, ob es läuft:

```sh
curl http://localhost:8080/api/health          # -> ok
curl -s http://localhost:8080/api/games | head -c 120
```

Im Browser: `http://<server-ip>:8080`. Registrieren, ein Spiel starten — fertig.

Die Migrationen laufen beim Start der API automatisch; die Ranked-Runden für heute und morgen
legt sie ebenfalls selbst an.

## 5. Firewall

Wenn `ufw` aktiv ist:

```sh
sudo ufw allow 8080/tcp
```

Postgres ist bewusst nur auf `127.0.0.1` veröffentlicht und damit von außen nicht erreichbar.

## 6. Mit eigener Domain und HTTPS (empfohlen, sobald es öffentlich ist)

Caddy holt und erneuert die Zertifikate von selbst. Erst den A-Record der Domain auf die
Server-IP zeigen lassen, dann:

```sh
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
neuron.example.org {
    reverse_proxy 127.0.0.1:8080
}
```

```sh
sudo systemctl reload caddy
```

Jetzt in `.env` umstellen und neu starten:

```
COOKIE_SECURE=true
COOKIE_DOMAIN=neuron.example.org
CORS_ORIGINS=https://neuron.example.org
```

```sh
docker compose up -d
```

Zusätzlich in `docker-compose.yml` den Port der API auf `'127.0.0.1:8080:8080'` ändern, damit
nur noch Caddy drankommt — und `sudo ufw delete allow 8080/tcp`.

## 7. Aktualisieren

```sh
cd neuron
git pull
docker compose up -d --build
```

Die Daten liegen im Volume `neuron_pgdata` und überleben das.

## 8. Sichern und Wiederherstellen

```sh
# Sicherung
docker compose exec -T postgres pg_dump -U neuron neuron | gzip > neuron-$(date +%F).sql.gz

# Wiederherstellung
gunzip -c neuron-2026-09-03.sql.gz | docker compose exec -T postgres psql -U neuron neuron
```

Für einen Server, der wirklich benutzt wird, gehört das in einen Cron-Eintrag.

## Fehlersuche

**`JWT_SECRET muss gesetzt sein`** — die `.env` liegt nicht im selben Verzeichnis wie
`docker-compose.yml`, oder die Zeile fehlt. Compose liest sie nur aus dem Projektverzeichnis.

**`Konfiguration unvollständig: … fehlt`** — die API nennt die fehlenden Variablen beim Start.
Im Compose-Aufbau kommen sie aus `docker-compose.yml`; nur die Werte aus `.env.deploy.example`
kommen aus deiner `.env`.

**Anmeldung hält nicht über das Neuladen hinweg** — fast immer `COOKIE_SECURE=true` ohne HTTPS.
Siehe den Kasten in Abschnitt 3.

**Die Seite lädt, aber Spiele starten nicht** — die API vergibt Seed und Config, ohne sie geht
nichts. `docker compose logs api` ansehen; meist ist die Datenbank nicht erreichbar.

### Wenn der Build abbricht

Wird der Rust-Build ohne Meldung beendet (`Killed`), fehlt Arbeitsspeicher. Zwei Wege:

**Swap einrichten** (dauert länger, kostet nichts):

```sh
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Oder woanders bauen** und nur das Image übertragen:

```sh
# auf der Entwicklungsmaschine
docker build -t neuron-api .
docker save neuron-api | gzip | ssh benutzer@server 'gunzip | docker load'
```

Dann auf dem Server in `docker-compose.yml` den `build:`-Block durch `image: neuron-api`
ersetzen.
