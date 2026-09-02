# ADR 0003 – Score-Parität über gemeinsame Draht-Zeilen

**Status:** akzeptiert · **Datum:** 2026-09-02

## Kontext

Der Client sendet Rohdaten (`trial_result`-Zeilen), der Server berechnet den Score. Der Client
zeigt denselben Score vorab an. Beide Implementierungen müssen übereinstimmen.

## Entscheidung

Jedes `GameModule` definiert `toResultRows(trial, index, outcome)` und `scoreRows(config, rows)`.
`score(ScoreInput)` ist nur eine Komfort-Hülle über beide. Die maßgebliche Formel arbeitet auf
exakt der Form, die der Server empfängt. Paritäts-Fixtures (`packages/games/test/fixtures/
scoring/<game>.json`) werden aus der TS-Seite erzeugt und von `cargo test` gegengeprüft.

## Konsequenzen

Die Rust-Seite braucht keine Kenntnis der Trial-Struktur, nur der Response-Form. Bei
Formeländerung: Fixtures neu erzeugen, beide Tests müssen grün sein.
