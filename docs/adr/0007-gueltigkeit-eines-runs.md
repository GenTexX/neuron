# ADR 0007 – Welche Spanne `client_duration_ms` misst, und wann ein Aussetzer zählt

**Status:** akzeptiert · **Datum:** 2026-09-03

## Kontext

Trainingsruns wurden fast durchgängig als ungültig gewertet – gemeldet mit
`duration_mismatch` ("Die gemeldete Dauer passt nicht zur Serverzeit") und
`frameGap` ("Die Darstellung hat gestockt"). Ranked-Runs fielen seltener auf.
Zwei unabhängige Ursachen, beide in der Umsetzung, nicht in der Sache.

**Erstens die Zeitkonsistenz (§9.2).** Der Server vergleicht
`client_duration_ms` mit `submitted_at - server_started_at` und lässt 25 %
Abweichung zu. `server_started_at` entsteht beim Anlegen des Runs – und der Run
wird bewusst im Intro angelegt, damit Trials und Ansicht vor dem Countdown
bereitstehen (§13.2). Die Serverspanne enthält damit die Lesezeit im Intro, den
Countdown und die Zeit bis zum Submit. Der Client meldete davon nur die reine
Spielzeit.

Damit maß jede Seite etwas anderes, und die Differenz war der Aufwand vor dem
ersten Reiz. Gemessen an einem Stroop-Training auf Level 1 (Spielzeit rund 35 s):
schon 12 s Lesezeit ergaben 31 % Abweichung. Weil die Toleranz relativ ist,
traf es kurze Runs am härtesten – also gerade das Training auf niedrigen Leveln,
während die längeren Ranked-Runs dieselbe Vorlaufzeit noch schluckten. Der
Vergleich prüfte nicht die Ehrlichkeit der Clientuhr, sondern die Lesegeschwindigkeit
des Nutzers.

**Zweitens der Frame-Abstand (§6.2, Regel 3).** Ein einzelner Abstand über
250 ms verwirft den Run. Gemessen wurde ab `start()` – aufgerufen, bevor Svelte
die Spielansicht gemountet hat. Der erste Frame trug dieses erste Rendern in
sich; auf langsamen Geräten war der Run damit verworfen, bevor der erste Reiz
stand. Unabhängig davon galt die Regel auch für Spiele ohne Zeitdruck, wo in
Anagrammen schon das Aufklappen der Bildschirmtastatur genügt.

## Entscheidung

**1. `client_duration_ms` misst dieselbe Spanne wie der Server:** vom Eintreffen
der Antwort auf `POST /runs` bis zum Absenden des Submits, per `Date.now()` –
die Serveruhr ist auch eine Wanduhr. Die Prüfung aus §9.2 bleibt Wort für Wort
bestehen und bekommt erst dadurch ihre Bedeutung: sie vergleicht jetzt zwei
Messungen desselben Zeitraums und schlägt an, wenn die Clientuhr anders läuft
als die des Servers. Die reine Spielzeit bleibt aus den `presented_ms` der
Trial-Zeilen ableitbar; angezeigt wurde `client_duration_ms` nie.

**2. Der erste Frame nach `start()` ist kein Aussetzer.** Ein Frame-Abstand
braucht zwei Frames.

**3. Die Regeln 3 und 4 aus §6.2 gelten nur bei `timingSensitive: true`.**

Punkt 3 weicht von der Spezifikation ab: §6.2 nimmt Spiele ohne Zeitdruck
ausdrücklich nur von den Regeln 1 und 2 aus. Der Grund für die Abweichung ist
derselbe, aus dem die Ausnahme dort steht: Ein Ruckler verfälscht die
Präsentationsdauer, und wo die Dauer nicht in die Wertung eingeht, gibt es
nichts zu verfälschen. Anagramme, Corsi, Lights Out und Zahlenreihen werten
weder Reaktionszeit noch Anzeigedauer; ein Aussetzer ändert dort am Ergebnis
nichts, kostet aber den ganzen Run. Für die Dauer-Abweichung (Regel 4) war die
Ausnahme bereits umgesetzt – diese Entscheidung zieht Regel 3 nach, statt die
beiden auseinanderlaufen zu lassen.

## Konsequenzen

- Wer die Regeln in Ruhe liest, verliert seinen Run nicht mehr. Nachgemessen an
  Stroop-Trainingsruns mit 3 s, 12 s und 45 s Lesezeit: alle gültig; mit 12 s
  war der Run vorher `duration_mismatch`.
- Wer das Intro länger als zwei Stunden offen lässt und dann spielt, bekommt
  `implausible_window` (§9.2, obere Grenze). Vorher scheiterte derselbe Run an
  `duration_mismatch` – die Regel greift, nur mit dem passenderen Grund.
- Bei zeitkritischen Spielen bleibt es streng: Tabwechsel, Fokusverlust,
  Aussetzer und Dauer-Abweichung verwerfen den Run wie gehabt.
- Ein Client, der seine Uhr manipuliert, fällt weiterhin auf – jetzt sogar
  zuverlässiger, weil beide Seiten denselben Zeitraum messen.
