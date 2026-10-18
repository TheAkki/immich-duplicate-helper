# AGENTS.md

## Code-Konventionen
- Keine Hardcodierung von Konstanten: Magic Numbers, Strings, Pfade, URLs und
  Schwellwerte gehören in benannte Konstanten oder Konfiguration
  (z. B. `config/`, Umgebungsvariablen). Ausnahme: 0, 1, "" in offensichtlichem Kontext.
- Keine Secrets im Code; nur über Umgebungsvariablen oder Secret-Store.
- Funktionen klein halten, eine Aufgabe pro Funktion.

## Tests
- Jede neue Funktion/Änderung braucht Unit-Tests.
- Zielabdeckung: mindestens 80 % für neuen Code; Randfälle und Fehlerpfade testen.
- Tests ausführen mit: `make test` (oder `go test ./...`, `npm test`)
- Vor Abschluss: Tests und Linter müssen grün sein.
- Markiere die erstellten Tests mit "KI-generiert" als Kommentar

## Arbeitsweise
- Bestehende Projektstruktur und Namensgebung beibehalten.
- Keine neuen Abhängigkeiten ohne Begründung.
- Bei Unklarheiten nachfragen statt zu raten.