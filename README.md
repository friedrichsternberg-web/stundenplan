# Stundenplan-Dashboard

Zeigt den HWR-Stundenplan (Tourismus, Semester 5, Kurs) als Dashboard und
meldet sich per macOS-Mitteilung, sobald sich etwas ändert.

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

## Grenzen

- Der Abgleich läuft nur, wenn der Mac an und du angemeldet bist. Für
  „Raum geändert, Vorlesung ist morgen" reicht das; für eine Meldung um
  6 Uhr morgens, während der Mac aus ist, nicht.
- Der Filter im Dashboard (welche Wahlpflichtfächer du belegst) gilt nur
  fürs Anzeigen. Die Mitteilungen kommen für **alle** Fächer im Plan.
