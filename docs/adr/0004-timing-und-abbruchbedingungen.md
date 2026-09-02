# ADR 0004 – Timing im TrialRunner und die Auslegung der Abbruchbedingungen

**Status:** akzeptiert · **Datum:** 2026-09-02

## Kontext

§6 verlangt `performance.now()`, `requestAnimationFrame` statt `setTimeout` und die
Aufzeichnung der tatsächlichen Präsentationsdauer. §6.2 nennt vier Abbruchbedingungen, unter
anderem: die Summe der `presentedMs` darf um höchstens 10 % von der Summe der Soll-Dauern
abweichen.

Beim Bau von `stroop` zeigte sich eine Wechselwirkung: wenn eine Antwort die Reizphase vorzeitig
beendet (das übliche Vorgehen in der Psychophysik – der Reiz verschwindet mit der Reaktion),
liegt die tatsächliche Dauer weit unter der Soll-Dauer. Die 10-%-Regel hätte dann _jeden_
schnell beantworteten Run als ungültig markiert.

## Entscheidung

1. Eine Antwort beendet die laufende Eingabephase, auch wenn sie eine feste Soll-Dauer hat.
   Ohne das bliebe der Reiz nach der Antwort bis zur Deadline stehen; ein Stroop-Run mit 30
   Trials dauerte über 80 Sekunden.
2. Für die Drift-Prüfung zählt bei einer so verkürzten Phase die tatsächliche Dauer auch als
   Soll-Dauer. Die Phase wurde absichtlich beendet, nicht vom System gestört – und genau
   Störungen soll die Regel finden. Die aufgezeichnete `presentedMs` bleibt unverändert die
   echte Dauer.
3. `updateResponse` (kontinuierliche Spiele) schreibt einen Zwischenstand fort und blockiert
   die abschließende `submitResponse` nicht; dafür gibt es ein eigenes `responded`-Flag.

## Konsequenzen

Die Drift-Regel greift weiterhin bei Tab-Throttling und Systemhängern, aber nicht mehr bei
normalem Spielverhalten. Spiele, die keine diskrete Antwort abgeben (n-back, go-nogo), sind von
Punkt 1 nicht betroffen, weil sie `updateResponse` nutzen.
