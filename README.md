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

## Die zwei Ansichten

Oben rechts schaltest du um; die Wahl bleibt im Browser gespeichert.

- **Liste** — ein Kasten je Tag, Termine untereinander. Auf dem Handy am
  angenehmsten und gut zum schnellen Nachschauen.
- **Kalender** — Tage als Spalten, Uhrzeit senkrecht. Die Höhe eines
  Kästchens entspricht der Dauer, dadurch sieht man Lücken und lange Blöcke
  sofort. Ein roter Strich zeigt „jetzt".

Beide zeigen dieselbe Woche; die Pfeile gelten für beide.

**Gleichzeitige Termine** stehen im Kalender nebeneinander statt
übereinander; `spaltenVerteilen()` in `app.js` erledigt das.

Aktuell überlappt in Friedrichs Plan nichts mehr — die Fälle waren genau die
parallelen Gruppen TM+HD/TM+SP, und TM+HD ist ausgeblendet. Die Logik bleibt
trotzdem drin: nächstes Semester oder bei einem zusätzlichen Wahlpflichtfach
tritt der Fall wieder auf, und ohne die Aufteilung läge ein Termin unsichtbar
unter dem anderen. Geprüft wird sie mit erfundenen Terminen, nicht mit dem
echten Plan — sonst würde der Test stillschweigend nichts mehr messen.

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

## Aufs Handy

Zwei Wege, die sich ergänzen — beide brauchen, dass die Dateien im Netz
liegen (siehe „Veröffentlichen" unten):

**Dashboard als Web-App.** Die GitHub-Pages-Adresse in Safari öffnen →
Teilen-Knopf → *Zum Home-Bildschirm*. Sie startet dann ohne Adressleiste,
mit eigenem Symbol.

**Termine im iPhone-Kalender.** Einstellungen → Kalender → Accounts →
Account hinzufügen → Andere → *Kalenderabo hinzufügen*, dann die Adresse von
`daten/meine-termine.ics` eintragen. Diese Datei enthält nur die Fächer, die
du belegst, und nur deine Kursgruppe — 133 statt 313 Termine.

## Wer was macht

Zwei voneinander unabhängige Läufe, jeder mit einer Aufgabe:

| | wo | Aufgabe |
|---|---|---|
| **Mac** | launchd, alle ~30 Min | vergleicht und **benachrichtigt dich** |
| **GitHub** | Actions, alle 30 Min | vergleicht und **aktualisiert die Seite** |

Der Mac lädt nichts mehr hoch. Beide führen ihren eigenen `stand.json` und
kommen unabhängig zum selben Ergebnis.

**Getrennte Zweige, damit sich beide nicht überschreiben:**

- `main` — Quellcode. Hier wird entwickelt. Erzeugte Dateien sind ignoriert.
- `gh-pages` — das Ergebnis. Schreibt **nur** die Automatik. GitHub Pages
  liefert von hier aus.

Lägen beide im selben Zweig, würde jedes `git pull` auf dem Mac zu
Konflikten in `daten/plan.js` führen.

Die Anzeigedateien werden nur neu geschrieben, wenn sich am Inhalt wirklich
etwas geändert hat — sonst höchstens einmal täglich. Andernfalls entstünde
allein durch den Zeitstempel alle 30 Minuten ein Commit.

Von Hand auslösen: Actions → *Stundenplan aktualisieren* → *Run workflow*.

**Der Zeitplan ist unzuverlässig.** GitHub garantiert für kostenlose
Repositories keine pünktliche Ausführung: Verzögerungen von 10–30 Minuten
sind normal, unter Last werden einzelne Termine ganz übersprungen. Wenn im
Verlauf tagelang kein Lauf mit dem Ereignis `schedule` auftaucht, ist das ein
GitHub-Problem und keins am Code — von Hand auslösen funktioniert dann
trotzdem. Für einen Stundenplan ist das verkraftbar; für etwas Zeitkritisches
wäre es der falsche Bauplatz.

**Zeitzonen:** GitHub-Server laufen in UTC. `jetzt_berlin()` in `abgleich.py`
rechnet deshalb immer auf Berliner Zeit um — sonst stünde im Dashboard nach
einem Lauf bei GitHub eine zwei Stunden alte Uhrzeit.

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
| `.github/workflows/aktualisieren.yml` | die GitHub-Automatik |
| `daten/meine-termine.ics` | Kalenderdatei fürs iPhone, nur belegte Fächer (erzeugt) |
| `symbol.png` | Symbol für den Home-Bildschirm |

`daten/plan.js` ist bewusst eine `.js`- und keine `.json`-Datei: so kann
`index.html` per Doppelklick geöffnet werden. Browser verbieten aus
Sicherheitsgründen, dass eine lokal geöffnete Seite Dateien nachlädt — ein
`<script>`-Tag ist davon aber ausgenommen.

## Welche Fächer du belegst

Der Kursplan enthält das **gesamte** WPF-Angebot des Semesters und obendrein
beide Gruppen der Module, die parallel gelesen werden. Zwei Listen in
`abgleich.py` schneiden das zurecht — beide an **einer** Stelle, denn sie
steuern zugleich, was das Dashboard ausblendet (sie werden nach
`daten/plan.js` mitgeschrieben) und worüber du benachrichtigt wirst:

| Liste | schließt aus | Beispiel |
|---|---|---|
| `NICHT_BELEGTE_FAECHER` | ganze Module, nach Titel | *WPF - Supply Chain Management* |
| `NICHT_BELEGTE_GRUPPEN` | Kursgruppen, nach Text im Dozentenfeld | `TM+HD` |

Die zweite Liste war nötig, weil das Modul *4 - Management* parallel in zwei
Gruppen läuft. Beide heißen exakt gleich; sie unterscheiden sich nur in der
Dozentenangabe (`Bergmann, TM+SP` gegenüber `Knoll, TM+HD`). Ein Filter nach
Titel kann sie nicht trennen.

`ist_belegt()` in `abgleich.py` wendet beide an — eine einzige Funktion,
damit keine Stelle versehentlich anders filtert als die andere. Im Dashboard
macht `fremdeGruppe()` dasselbe, und zwar **vor** dem Fächerfilter: sonst
stünde im Filterfenster „23 Termine" bei einem Modul, von dem du nur 12
besuchst.

Belegt sind aktuell 10 Fächer mit **133 von 313 Terminen**: alle
Pflichtmodule außer Personalmanagement, davon Management nur in der Gruppe
TM+SP, plus die Wahlpflichtfächer *Nachhaltiges Wirtschaften (Do)* und
*Social Innovation*.

Der Gruppenfilter ist bewusst **nicht** im Dashboard umschaltbar: parallele
Gruppen heißen gleich und stünden dort als ein einziger Eintrag.

Änderungen an nicht belegten Fächern werden **trotzdem vollständig
aufgezeichnet**: im Änderungsverlauf und im Protokoll, dort mit `(stumm)`
gekennzeichnet. Es unterbleibt nur die Mitteilung.

Der Filter im Dashboard überschreibt die Anzeige für diesen einen Browser.
Die Mitteilungen richten sich immer nach der Liste in `abgleich.py`.

## Grenzen

- **Die Benachrichtigung** kommt nur, wenn der Mac an, angemeldet und wach ist. Für
  „Raum geändert, Vorlesung ist morgen" reicht das; für eine Meldung um
  6 Uhr morgens, während der Mac aus ist, nicht.
- Ein **neu hinzukommendes** Wahlpflichtfach steht nicht in der Liste und
  wird deshalb angezeigt und gemeldet. Das ist Absicht: lieber einmal zu
  viel sehen als etwas verpassen.
