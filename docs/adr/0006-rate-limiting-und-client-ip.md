# ADR 0006 – Rate Limiting der Anmeldung und die Frage, welche IP zählt

**Status:** akzeptiert · **Datum:** 2026-09-03

## Kontext

§8 fordert 10 Anfragen pro IP und 15 Minuten auf `/auth/login` und `/auth/register`. Diese beiden
Endpunkte sind die einzigen, die ohne Anmeldung Argon2id rechnen lassen – absichtlich teuer. Ohne
Bremse sind sie damit zweifach angreifbar: als Brute-Force-Fläche und als CPU-Erschöpfung.

Hinter einem Reverse Proxy ist die Peer-IP immer die des Proxys. Wertet man stattdessen
`X-Forwarded-For` aus, kann jeder, der die API direkt erreicht, sich eine beliebige IP zuschreiben
und die Bremse aushebeln. Beide Varianten sind je nach Aufbau richtig oder falsch – eine feste
Wahl im Code wäre in der Hälfte der Fälle ein Fehler.

## Entscheidung

`TRUST_PROXY_HEADERS` entscheidet zwischen `PeerIpKeyExtractor` und `SmartIpKeyExtractor`.
**Standard ist `false`.** Die beiden Fehlerbilder sind unterschiedlich schlimm: mit falschem
`false` landen hinter einem Proxy alle Nutzer im selben Zähler – laut und sofort sichtbar. Mit
falschem `true` ohne Proxy ist die Bremse still wirkungslos. Der laute Fehler ist der bessere
Standard.

Ein fehlender Schlüssel (`UnableToExtractKey`) führt zu `500`, nicht zum Durchwinken: fail-open
wäre genau das Loch, das die Bremse verhindern soll.

`AUTH_RATE_LIMIT_BURST` (Standard 10, also die Spec-Vorgabe) macht die Schwelle einstellbar. Das
Fenster bleibt bei 15 Minuten, die Nachfüllrate ergibt sich als `900 / burst`. Nötig wurde das
durch die E2E-Suite, die rund 15 Nutzer von derselben IP registriert; nützlich ist es auch für
Installationen, bei denen viele Leute hinter einer NAT-Adresse sitzen.

## Konsequenzen

Die API muss mit `into_make_service_with_connect_info::<SocketAddr>()` ausgeliefert werden, sonst
gibt es keine Peer-IP. Tests, die den Router direkt über `oneshot` ansprechen, müssen die
`ConnectInfo`-Extension selbst setzen – die Test-Hilfe in `tests/common` tut das.

Beim Betrieb hinter nginx gehören `TRUST_PROXY_HEADERS=true`, die vier `proxy_set_header`-Zeilen
und ein auf `127.0.0.1` gebundener Port zusammen. Fehlt eines davon, ist die Bremse entweder
wirkungslos oder trifft alle gemeinsam. `docs/DEPLOY.md` führt die drei Punkte zusammen auf.
