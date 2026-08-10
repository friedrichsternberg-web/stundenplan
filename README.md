# Stundenplan-Dashboard

Zeigt den HWR-Stundenplan (Tourismus, Semester 5, Kurs) als Dashboard und
meldet sich per macOS-Mitteilung, sobald sich etwas ändert.

## Wo das Projekt liegt — und warum nicht in „Dokumente"

Der Ordner liegt unter `~/stundenplan-dashboard`. In `~/Documents` liegt nur
eine Verknüpfung darauf.

Das hat einen Grund: macOS schützt `Dokumente`, `Schreibtisch` und
`Downloads`. Ein Programm, das *du* startest, darf dort lesen — ein
Hintergrund-Job, den launchd startet, nicht. Lag das Projekt in `Dokumente`,
scheiterte der Job mit `Operation not permitted`. Die Alternative wäre,
`/usr/bin/python3` pauschal Festplattenvollzugriff zu geben — ein deutlich
zu großer Hammer für einen Stundenplan.

Wenn du den Ordner verschiebst, danach einmal
`bash benachrichtigung-einschalten.sh` neu ausführen: der Hintergrund-Job
merkt sich den vollen Pfad.

## Benutzen

**Dashboard ansehen:** `index.html` doppelklicken. Kein Server nötig.

**Von Hand nachschauen:**

```bash
python3 abgleich.py
```

**Automatisch im Hintergrund prüfen (alle 30 Minuten):**

```bash
bash benachrichtigung-einschalten.sh
```

Wieder abschalten mit `benachrichtigung-ausschalten.sh`.

## Woher die Daten kommen

Die Moodle-Seite `fb2-stundenplan/stundenplan.php` ist nur ein Auswahlmenü.
Dahinter liegen statische Dateien nach festem Namensschema — und die sind
**ohne Login abrufbar**:

```
https://moodle.hwr-berlin.de/fb2-stundenplan/fb2-stundenplaene/tourismus/semester5/kurs.ics
```

Es werden also keine Zugangsdaten gespeichert und keine gebraucht.

Zwei Eigenheiten dieser Datei, die im Code berücksichtigt sind:

- **Jeder Termin hat eine feste Kennung** (`sked.de1200291`). Deshalb lässt
  sich sauber unterscheiden, ob ein Termin *verschoben* wurde oder ob ein
  alter wegfiel und ein neuer dazukam.
- **Sie enthält nur ein rollierendes Zeitfenster** von etwa zwölf Wochen.
  Termine, die hinten herausfallen, sind nicht abgesagt — sie stehen nur
  nicht mehr drin. `plaene_vergleichen()` in `abgleich.py` kennt die
  Fenstergrenzen und meldet solche Randfälle bewusst nicht.

## Semesterwechsel

In `abgleich.py` ganz oben `SEMESTER` ändern, z. B. auf `"semester6"`.
Danach einmal `daten/stand.json` löschen, damit nicht der komplette alte
Plan als „entfallen" gemeldet wird.

## Dateien

| Datei | Wofür |
|---|---|
| `abgleich.py` | holt den Plan, vergleicht, benachrichtigt |
| `index.html` · `style.css` · `app.js` | das Dashboard |
| `daten/plan.js` | die Daten fürs Dashboard (erzeugt) |
| `daten/stand.json` | zuletzt gesehener Stand für den Vergleich (erzeugt) |
| `daten/protokoll.log` | Ausgaben des Hintergrund-Jobs (erzeugt) |
| `benachrichtigung-*.sh` | Hintergrund-Job ein-/ausschalten |

`daten/plan.js` ist bewusst eine `.js`- und keine `.json`-Datei: so kann
`index.html` per Doppelklick geöffnet werden. Browser verbieten aus
Sicherheitsgründen, dass eine lokal geöffnete Seite Dateien nachlädt — ein
`<script>`-Tag ist davon aber ausgenommen.

## Welche Fächer du belegst

Der Kursplan enthält das **gesamte** WPF-Angebot des Semesters, also auch
Fächer, die du nicht belegst. Welche das sind, steht in `abgleich.py` unter
`NICHT_BELEGTE_FAECHER` — an **einer** Stelle, denn diese Liste steuert beides:

- was das Dashboard ausblendet (sie wird nach `daten/plan.js` mitgeschrieben)
- worüber du benachrichtigt wirst

Belegt sind aktuell alle Pflichtmodule plus die beiden Wahlpflichtfächer
*Nachhaltiges Wirtschaften (Do)* und *Social Innovation* — 175 von 313
Terminen.

Änderungen an nicht belegten Fächern werden **trotzdem vollständig
aufgezeichnet**: im Änderungsverlauf und im Protokoll, dort mit `(stumm)`
gekennzeichnet. Es unterbleibt nur die Mitteilung.

Der Filter im Dashboard überschreibt die Anzeige für diesen einen Browser.
Die Mitteilungen richten sich immer nach der Liste in `abgleich.py`.

## Grenzen

- Der Abgleich läuft nur, wenn der Mac an und du angemeldet bist. Für
  „Raum geändert, Vorlesung ist morgen" reicht das; für eine Meldung um
  6 Uhr morgens, während der Mac aus ist, nicht.
- Ein **neu hinzukommendes** Wahlpflichtfach steht nicht in der Liste und
  wird deshalb angezeigt und gemeldet. Das ist Absicht: lieber einmal zu
  viel sehen als etwas verpassen.
