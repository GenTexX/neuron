# Wortliste `words-de.json`

**Umfang:** 3000 deutsche Substantive im Nominativ Singular, Kleinbuchstaben, ausschließlich
`a`–`z`, Länge 4–9 Zeichen. Keine Eigennamen, keine Umlaute, kein `ß` (§12.9).

## Quelle und Lizenz

|                                                       |                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primärquelle                                          | [`german-words-dict`](https://www.npmjs.com/package/german-words-dict) v3.4.0 (RosaeNLG), Paketlizenz Apache-2.0                                                                                                         |
| Ursprung der Sprachdaten                              | [`german-pos-dict`](https://github.com/languagetool-org/german-pos-dict) (LanguageTool), Export aus [Morphy](http://morphy.wolfganglezius.de/), erweitert durch [korrekturen.de/flexion](https://korrekturen.de/flexion) |
| **Lizenz der Sprachdaten**                            | **CC-BY-SA 4.0** — <https://creativecommons.org/licenses/by-sa/4.0/>                                                                                                                                                     |
| Häufigkeitsdaten (nur zur Auswahl, nicht eingecheckt) | [`hermitdave/FrequencyWords`](https://github.com/hermitdave/FrequencyWords), `content/2018/de/de_50k.txt` (OpenSubtitles-Korpus), CC-BY-SA 4.0                                                                           |

Diese Datei ist eine gefilterte Auswahl (Datenbank-Auszug) aus dem oben genannten Morphy-Datensatz
und steht damit ebenfalls unter **CC-BY-SA 4.0**. Bei Weitergabe müssen Urheberangabe und
Lizenzhinweis erhalten bleiben.

Damit ist die offene Frage aus Spec §18 Punkt 3 („konkrete Quelle und Lizenz für `words-de.json`")
beantwortet: Morphy/german-pos-dict unter CC-BY-SA 4.0.

## Ableitungsschritte

Reproduzierbar aus `german-words-dict@3.4.0/dist/words.json`:

1. Nur Einträge, deren Schlüssel exakt der Form `NOM.SIN` entspricht (Nominativ Singular).
2. Nur Schlüssel, die auf `/^[A-Z][a-z]{3,8}$/` passen — schließt Umlaute, `ß`, Bindestriche,
   Ziffern und reine Abkürzungen (Versalien) aus.
3. Substantivierte Infinitive verworfen (Neutrum, endet auf `n`, kein Plural — „das Gehen").
4. Substantivierte Adjektive/Partizipien verworfen (Neutrum, endet auf `e`, Genitiv Singular
   = Wort + `n` — „das Gute").
5. Kleine Sperrliste für Funktionswort-Homographen sowie für Eigennamen, Toponyme und Marken,
   die im Quelldatensatz verblieben waren.
6. Nach Korpushäufigkeit absteigend sortiert, die 3000 häufigsten übernommen, dann alphabetisch
   sortiert und kleingeschrieben eingecheckt.

Längenverteilung: 4 → 450, 5 → 632, 6 → 595, 7 → 521, 8 → 456, 9 → 346.
