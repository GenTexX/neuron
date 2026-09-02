# Neuron – Domänensprache (lebendes Dokument)

Diese Begriffe sind verbindlich (Spec §4). Code, DB-Spalten und API-Felder verwenden
exakt diese Wörter – in TS `camelCase`, in SQL/JSON auf dem Draht `snake_case`.

| Begriff            | Bedeutung                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Game**           | Ein Minispiel-Typ, identifiziert durch eine stabile String-ID (`n-back`).                                                             |
| **Config**         | Vollständiger Parametersatz, der die Schwierigkeit eines Runs festlegt. JSON, pro Game eigener Typ.                                   |
| **ConfigHash**     | SHA-256 der kanonisierten Config, erste 16 Hex-Zeichen. Scores sind **nur** innerhalb eines ConfigHash vergleichbar.                  |
| **Seed**           | `u32`. Bestimmt zusammen mit der Config die konkreten Aufgaben eindeutig.                                                             |
| **Trial**          | Eine einzelne Aufgabe innerhalb eines Runs. Vollständig aus `(Rng, Config)` erzeugt.                                                  |
| **Response**       | Die Antwort des Nutzers auf einen Trial.                                                                                              |
| **Judgement**      | Bewertung eines `(Trial, Response)`-Paares: mindestens `{ correct }`.                                                                 |
| **Run**            | Eine gespielte Sitzung eines Games: Config + Seed + Trials + Responses + Score.                                                       |
| **Mode**           | `training` (adaptiv, kein Leaderboard) oder `ranked` (feste Config + Seed pro Runde).                                                 |
| **RankedRound**    | Ein Kalendertag (UTC), in dem für ein Game eine feste Config und ein fester Seed gelten.                                              |
| **Staircase**      | 3-up-1-down-Verfahren, das im Training das Level anpasst (serverseitig).                                                              |
| **Level**          | Ganzzahlige Schwierigkeitsstufe ab 1; `levelToConfig(level)` pro Game.                                                                |
| **Streak**         | Aufeinanderfolgende Kalendertage (Zeitzone des Nutzers) mit ≥ 1 gültigem Run. Abgeleitet, nicht gespeichert.                          |
| **TrialResultRow** | Eine Zeile `trial_result` auf dem Draht: `{idx, response, rt_ms, presented_ms, correct}`. Gemeinsame Eingabe der TS- und Rust-Scorer. |
| **Phase**          | Ein Abschnitt eines Trials mit Soll-Dauer und Input-Flag; Views deklarieren Phasen, der TrialRunner steuert das Timing.               |

## Antwortmodelle

- **Discrete** – pro Trial genau eine Antwort (mental-chain, corsi, stroop, mental-rotation, number-sequence, anagram). Eine `trial_result`-Zeile pro Trial.
- **Continuous** – ein Trial ist ein Reizstrom (n-back, go-nogo) bzw. eine durchgehende Interaktion (schulte, lights-out).
  - n-back und go-nogo: **eine `trial_result`-Zeile pro Stromposition** (`idx` = Position), `trial_count` = Stromlänge. So greift die generische Validierung.
  - schulte und lights-out: ein Trial, eine Zeile, `trial_count = 1`.

## Kanonisierung der Config (ConfigHash)

Schlüssel rekursiv alphabetisch sortiert (Code-Unit-Reihenfolge; Schlüssel sind ASCII),
keine Whitespaces, ganzzahlige Werte ohne Dezimalpunkt (`1.0` → `1`), Strings wie in
`JSON.stringify` / `serde_json`. Einschränkung: Zahlen müssen endlich sein und ohne
Exponentialschreibweise darstellbar (`|x| < 1e21`, `|x| >= 1e-6` oder `0`). Golden-Test:
`packages/engine/test/golden/config-hash.json` (TS und Rust).

## Score

Nicht-negative ganze Zahl, höher ist besser. Der Server berechnet aus den Rohdaten
(`correct`, `rt_ms`, `response`); der Client berechnet denselben Wert nur zur Sofortanzeige.
Cross-Game-Vergleich ausschließlich über Perzentile innerhalb der Ranked-Verteilung.

## Zeit

- Alle Zeitmessung im Client mit `performance.now()`; Stimulus-Dauern über `requestAnimationFrame`.
- `presentedMs` ist die tatsächliche, nicht die gewünschte Präsentationsdauer.
- Ranked-Fenster in UTC; Streak-Tag in `app_user.timezone`.
