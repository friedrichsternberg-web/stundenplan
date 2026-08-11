# Uni-Dashboard

Übersichts-App zum Studium: HWR-Stundenplan (Tourismus, Semester 5, Kurs),
eigene Notizen und To-dos, dazu eine macOS-Mitteilung, sobald sich am Plan
etwas ändert.

## Die drei Bereiche

| Reiter | zeigt |
|---|---|
| **Plan** | „Als Nächstes", die Woche als Liste oder Kalender |
| **To-dos** | deine Notizen zum Abhaken, dazu Hinweise aus dem HWR-Plan |
| **Änderungen** | was sich am Stundenplan geändert hat |

An „To-dos" und „Änderungen" steht eine Zahl, sobald dort etwas Offenes
liegt. Deshalb sieht man schon beim Öffnen, ob überhaupt etwas ansteht.

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

In **jedem** Kästchen steht die Uhrzeit, und zwar als erste Zeile. Das war
zwischenzeitlich anders — die Idee war, den knappen Platz lieber dem Raum zu
geben, weil man die Zeit ja an der Achse ablese. Stimmt aber nicht: die
Rasterlinien liegen im Stundentakt, und ob ein Termin um 9:45 oder 10:00
beginnt, sieht man daran nicht. Die Mindesthöhe eines Kästchens ist deshalb
so gewählt, dass Uhrzeit und Titel immer hineinpassen.

Beide zeigen dieselbe Woche; die Pfeile gelten für beide.

**Gleichzeitige Termine** stehen im Kalender nebeneinander statt
übereinander; `spaltenVerteilen()` in `app.js` erledigt das.

Aktuell überlappt in Friedrichs Plan nichts mehr — die Fälle waren genau die
parallelen Gruppen TM+HD/TM+SP, und TM+HD ist ausgeblendet. Die Logik bleibt
trotzdem drin: nächstes Semester oder bei einem zusätzlichen Wahlpflichtfach
tritt der Fall wieder auf, und ohne die Aufteilung läge ein Termin unsichtbar
unter dem anderen. Geprüft wird sie mit erfundenen Terminen, nicht mit dem
echten Plan — sonst würde der Test stillschweigend nichts mehr messen.

## Eigene Notizen und To-dos

Zu jedem Termin lässt sich ein kurzer Text hinterlegen: „heute online",
„Abgabe bis Freitag", „fällt aus" — alles, was nicht im HWR-System steht.

**Angelegt** werden sie im Plan über den Knopf **Bearbeiten**. Erst dann
erscheinen die „+ Notiz"-Knöpfe. Das ist Absicht: bei 133 Terminen stünden
sonst über hundert Knöpfe herum, für eine Handvoll Notizen. Vorhandene
Notizen sind immer sichtbar und immer anklickbar, auch ohne Bearbeiten-Modus.

**Gesammelt** werden sie im Reiter **To-dos**: offene oben, abgehakte
darunter. Ein Termin, der schon vorbei ist und dessen Notiz noch offen steht,
wird rot als „vorbei" markiert. Bearbeiten geht dort genauso wie im Plan.

Darunter stehen die **Hinweise aus dem Stundenplan** — Termine, bei denen die
HWR selbst etwas vermerkt hat (ONLINE, Klausur, Exkursion). Die sind
zusammengefasst: der 4. September besteht aus sechs Zeitblöcken, die alle
„online" sind, und steht deshalb als **eine** Zeile da statt als sechs.

Im Kalender steht bei Terminen mit Notiz nur ein ✎ — für den Text ist im
Raster kein Platz.

### Aufgaben ohne Vorlesung

„Bibliotheksbuch zurückgeben" hängt an keinem Termin. Solche Aufgaben legst
du im Reiter **To-dos** über **+ Neue Aufgabe** an, oder im Plan über
*Bearbeiten* → **+ Aufgabe für diesen Tag**. Sie haben einen Tag, aber keine
Uhrzeit, und stehen im Plan unten im jeweiligen Tageskasten.

Sie brauchen einen **eigenen Speicher** (`stundenplan.aufgaben`) und nicht
bloß einen weiteren Eintrag bei den Notizen: eine Notiz gehört zu genau einem
Termin, an einem Tag können aber beliebig viele freie Aufgaben liegen —
deshalb eine Liste statt einer Zuordnung. Ihre Kennungen beginnen mit
`eigen-`, dadurch lassen sie sich überall von den HWR-Terminen (`sked.de…`)
unterscheiden.

Liegt an einem Samstag oder Sonntag eine Aufgabe, wird dieser Tag im Plan
angezeigt, obwohl dort keine Vorlesung ist — sonst käme man nicht an sie
heran.

Gespeichert wird nach der **Termin-Kennung** (`sked.de1200291`), nicht nach
Datum und Uhrzeit. Dadurch bleibt die Notiz am Termin kleben, auch wenn der
Raum wechselt oder die Vorlesung verschoben wird.

**Zwei Grenzen, die man kennen muss:**

- Die Notizen liegen im Browser, nicht in einer Datei. Was du am Mac
  schreibst, steht **nicht** auf dem iPhone und umgekehrt. Für einen Abgleich
  bräuchte es einen Server mit Anmeldung.
- iOS-Safari räumt den Speicher von Webseiten auf, die sieben Tage lang nicht
  benutzt wurden. Als Web-App auf dem Home-Bildschirm passiert das in der
  Praxis selten, garantiert ist es aber nicht. Für „Abgabe nächste Woche"
  taugt es, für die einzige Kopie einer wichtigen Information nicht.

Sie landen bewusst **nicht** in `daten/meine-termine.ics`: die Datei wird bei
jedem Abgleich neu geschrieben, eine Notiz darin wäre sofort wieder weg.

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
etwas geändert hat — sonst höchstens alle vier Stunden
(`AUFFRISCHEN_NACH_STUNDEN` in `abgleich.py`). Andernfalls entstünde allein
durch den Zeitstempel bei jedem Lauf ein Commit.

Hier stand zuerst 24 Stunden. Das war zu lang: änderte sich am Plan tagelang
nichts, zeigte das Dashboard „zuletzt geprüft: vorgestern", obwohl die
Prüfung lief — das sieht nach einem Ausfall aus, ist aber keiner.

Von Hand auslösen: Actions → *Stundenplan aktualisieren* → *Run workflow*.

**Der Zeitplan ist unzuverlässig — gemessen, nicht vermutet.** GitHub führt
auf kostenlosen Repositories Zeitplan-Termine nur „nach Möglichkeit" aus. Am
10./11.08. liefen von rund 34 geplanten Terminen **sechs**, mit Lücken von
drei bis fünf Stunden — alle erfolgreich, nur eben verworfen statt verspätet.

Deshalb steht der Zeitplan auf **viertelstündlich**, obwohl drei bis vier
Läufe am Tag genügen: wer häufig plant, bekommt öfter einen Zuschlag.
Verworfene Termine kosten nichts, sie starten gar nicht erst.

Bleibt die Automatik trotzdem länger aus, zeigt das Dashboard es an: der
Stand im Kopf wird ab zwölf Stunden farbig hervorgehoben. Von Hand auslösen
geht immer über Actions → *Run workflow*.

**Zeitzonen:** GitHub-Server laufen in UTC. `jetzt_berlin()` in `abgleich.py`
rechnet deshalb immer auf Berliner Zeit um — sonst stünde im Dashboard nach
einem Lauf bei GitHub eine zwei Stunden alte Uhrzeit.

## Zwischenspeicher — die häufigste Fehlerquelle

GitHub Pages erlaubt dem Browser, **jede Datei zehn Minuten zu behalten**,
und zwar jede für sich. Daraus folgen zwei Dinge:

1. Nach einer Änderung sieht man sie nicht sofort.
2. Schlimmer: der Browser kann die neue `index.html` mit der alten `app.js`
   mischen. Dann sucht alter Code nach Bausteinen, die es noch nicht gibt,
   bricht ab — und die Seite bleibt leer.

Dagegen hängt die Automatik beim Veröffentlichen eine Versionsnummer an:
`app.js?v=a1b2c3d4`, die Kennung des Commits. Sie ändert sich genau dann,
wenn sich am Quellcode etwas getan hat. Damit passen HTML, Code und Aussehen
immer zusammen.

Die `index.html` selbst kann trotzdem bis zu zehn Minuten alt sein — auf
Pages lassen sich die Kopfzeilen nicht einstellen. Dafür gibt es den Knopf
**↻** oben rechts: er ruft die Seite mit einem neuen Anhängsel auf, wodurch
sie als andere Adresse gilt und komplett frisch geladen wird. Auf dem
Home-Bildschirm ist das der einzige Weg, weil es dort keine Adressleiste gibt.

Bewusst **kein Service Worker**: der könnte das sauberer lösen, kann sich
aber auch selbst festfahren und eine alte Fassung dauerhaft festhalten. Das
wäre ein schlimmeres Problem als zehn Minuten Wartezeit.

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
