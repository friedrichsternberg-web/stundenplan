# Uni-Dashboard

Stundenplan der HWR, eigene Termine, To-dos und Notizen in einem – auf dem Handy, dem Laptop und im Apple Kalender.

Übersichts-App zum Studium: HWR-Stundenplan (Tourismus, Semester 5, Kurs),
eigene Notizen und To-dos, dazu eine macOS-Mitteilung, sobald sich am Plan
etwas ändert.

## Die vier Bereiche

| Reiter | zeigt |
|---|---|
| **Plan** | „Als Nächstes", die Woche als Liste oder Kalender |
| **Notizen** | das Notizbuch: freie Notizen, verknüpft mit Terminen und Modulen |
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

In der **Liste** steht in der laufenden Woche immer der heutige Tag oben.
Die vergangenen Tage dieser Woche sind eingeklappt; ein Knopf darüber holt
sie zurück („▸ 2 vergangene Tage dieser Woche anzeigen"). In anderen Wochen
ist nichts eingeklappt — wer zurückblättert, will ja gerade das Vergangene
sehen. „Heute" klappt wieder zu. Im **Kalender** bleibt alles, wie es ist:
dort stehen die Tage nebeneinander und kosten keinen Platz nach unten.


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

## Kurznotizen und To-dos

Zu jedem Termin lässt sich ein kurzer Text hinterlegen: „heute online",
„Abgabe bis Freitag", „fällt aus" — alles, was nicht im HWR-System steht.
Eine Zeile lang, abhakbar, und sie steht im Kalenderkästchen. Das ist die
**Kurznotiz**; die längeren Notizen stehen im [Notizbuch](#das-notizbuch).

**Angelegt** wird sie im Plan über den Knopf **Bearbeiten**. Erst dann
erscheinen unter jedem Termin zwei Knöpfe. Das ist Absicht: bei 133
Terminen stünden sonst über zweihundert Knöpfe herum, für eine Handvoll
Einträge. Vorhandenes ist immer sichtbar und immer anklickbar, auch ohne
Bearbeiten-Modus.

| Knopf | legt an |
|---|---|
| **+ To-do** | die Kurznotiz: eine Zeile, abhakbar, steht im Kalenderkästchen und im Reiter To-dos |
| **+ Notiz** | eine Notiz im Notizbuch, gleich mit diesem Termin verknüpft: langer Text, kein Häkchen |

Bis zum 22.09.2026 stand dort ein einziger Knopf, und der hieß „+ Notiz",
legte aber die Kurznotiz an — man drückte auf „Notiz" und bekam ein To-do.
Solange es nur eine Sorte gab, fiel das nicht weiter auf; seit es das
Notizbuch gibt, sind es zwei Dinge und brauchen zwei Knöpfe.

Notizen aus dem Notizbuch, die an **genau diesem Termin** hängen, stehen in
der Liste als kleine Marke darunter und öffnen sich per Klick. Modulweite
Notizen bleiben dort draußen: sie gelten für alle Termine des Fachs und
stünden sonst unter jeder einzelnen Vorlesung — bei zwanzig Terminen
zwanzigmal derselbe Text. Im Fenster eines angetippten Termins stehen sie
dagegen mit dabei, dort wiederholt sich nichts.

**Gesammelt** werden sie im Reiter **To-dos**, und zwar nach Zeit sortiert
in Fächern:

| Fach | Was hineinkommt |
|---|---|
| **Überfällig** | Datum liegt vor heute, noch nicht abgehakt — rot |
| **Heute** | |
| **Morgen** | |
| **Diese Woche** | ab übermorgen bis Sonntag |
| **Nächste Woche** | Montag bis Sonntag darauf |
| **Später** | alles danach |
| **Ohne Termin im Plan** | Notizen, deren Vorlesung die HWR entfernt hat |
| **Erledigt** | zugeklappt, aufklappbar |

Eine flache Datumsliste war ab einem Dutzend Einträgen unübersichtlich: man
sah nicht mehr, was drängt. Vor allem Überfälliges ging unter — es stand zwar
oben, hob sich aber nicht ab.

„Diese Woche" wird von **heute** aus gerechnet, nicht ab Montag. Am Freitag
heißt „diese Woche" noch Samstag und Sonntag; die Tage davor stehen unter
Überfällig, wo sie hingehören.

Wichtiges steht innerhalb seines Fachs oben. Nicht darüber hinaus: eine
wichtige Aufgabe in drei Wochen soll nicht über dem stehen, was heute
ansteht.

Die Fachüberschriften kleben beim Scrollen oben fest, damit man bei zwanzig
Aufgaben nicht die Orientierung verliert. Bearbeiten geht dort genauso wie
im Plan.

Darunter stehen die **Hinweise aus dem Stundenplan** — Termine, bei denen die
HWR selbst etwas vermerkt hat (ONLINE, Klausur, Exkursion). Die sind
zusammengefasst: der 4. September besteht aus sechs Zeitblöcken, die alle
„online" sind, und steht deshalb als **eine** Zeile da statt als sechs.

**Wichtiges markieren.** Im Bearbeitungsfeld gibt es einen Haken „★ Wichtig".
Markierte Einträge stehen im To-do-Bereich ganz oben, bekommen einen Stern
und eine rote statt violette Kennfarbe. Beim Abhaken verlieren sie die
Hervorhebung wieder — eine erledigte Aufgabe soll nicht so laut dastehen wie
eine offene.

**Im Kalender** erscheinen freie Aufgaben in einer schmalen Ganztagszeile
zwischen Tageskopf und Zeitraster. Sie haben keine Uhrzeit; sie ins Raster zu
setzen wäre erfunden. Die Zeile taucht nur auf, wenn in der Woche wirklich
etwas liegt. Bei Vorlesungen mit Notiz steht ein ✎ im Terminkästchen —
beziehungsweise ein ★, wenn die Notiz als wichtig markiert ist.

### Platz im Kalenderraster

Ein 45-Minuten-Kästchen ist keine 50 Bildpunkte hoch, und auf dem iPhone
teilen sich fünf Spalten 375 Bildpunkte Breite. Da passt nicht alles hinein.
Drei Regeln teilen den Platz auf:

1. **Umbrochen wird an Wortgrenzen, mit Trennstrich.** Vorher stand im CSS
   `overflow-wrap: anywhere`, das trennt an beliebiger Stelle — heraus kam
   „Schlüsselkompete / nzen V". Jetzt sorgen `break-word` und `hyphens: auto`
   für „Schlüsselkompeten-zen V".
2. **Was nicht mehr hineinpasst, endet mit drei Pünktchen** statt waagerecht
   durchgeschnitten zu werden. Wie viele Zeilen erlaubt sind, **misst der
   Browser** — `kalenderTexteAnpassen()` in `app.js` fragt nach den
   tatsächlichen Höhen, statt sie im JavaScript nachzubauen. Ein erster
   Versuch mit fest eingetragenen Zeilenhöhen vergaß die Raum- und
   Hinweiszeile unter dem Titel: zwölf von achtzehn Kästchen liefen unten
   über.
3. **Rangfolge bei Platzmangel:** Uhrzeit und zwei Titelzeilen bleiben immer,
   danach weicht der Raum, dann der HWR-Hinweis. Passt die Zeitspanne nicht
   in die Spaltenbreite, bleibt nur die Anfangszeit stehen — „08:00–09:3"
   sieht aus wie eine Angabe und ist doch keine.

**Ein Tippen auf ein Kästchen zeigt alles**: vollständiger Titel, Zeit, Raum,
Dozent, Gruppe, HWR-Hinweis, deine Notiz. Am Rechner half bisher der
Hinweistext beim Überfahren mit der Maus — auf dem Handy gibt es den nicht,
und damit war die Kalenderansicht dort halb blind.

### To-dos ohne Vorlesung

„Bibliotheksbuch zurückgeben" hängt an keinem Termin. So etwas legst du im
Reiter **To-dos** über **+ Neues To-do** an, oder im Plan über *Bearbeiten*
→ **+ To-do für diesen Tag**. Sie haben einen Tag, aber keine Uhrzeit, und
stehen im Plan unten im jeweiligen Tageskasten.

Beim Fälligkeitsdatum stehen vier Knöpfe: **Heute**, **Morgen**,
**Übermorgen**, **Nächster Montag**. Ein Datumsfeld ist auf dem Handy drei
Drehrädchen, und „morgen" ist das, was man in neun von zehn Fällen meint —
dafür sollte man nicht durch einen Kalender blättern müssen.

„Nächster Montag" heißt immer der **kommende**, nie heute. Steht man an
einem Montag und tippt darauf, ist eine Aufgabe für heute nicht gemeint;
dafür gibt es den Knopf daneben.

Sie brauchen einen **eigenen Speicher** (`stundenplan.aufgaben`) und nicht
bloß einen weiteren Eintrag bei den Notizen: eine Notiz gehört zu genau einem
Termin, an einem Tag können aber beliebig viele davon liegen — deshalb eine
Liste statt einer Zuordnung. Ihre Kennungen beginnen mit `eigen-`, dadurch
lassen sie sich überall von den HWR-Terminen (`sked.de…`) unterscheiden.

Liegt an einem Samstag oder Sonntag ein To-do, wird dieser Tag im Plan
angezeigt, obwohl dort keine Vorlesung ist — sonst käme man nicht daran.

#### Im Code heißt es weiter „Aufgabe"

Auf dem Bildschirm steht seit dem 22.09.2026 überall **To-do**; im Code
heißt dasselbe Ding weiter `aufgabe` — `SPEICHER_AUFGABEN`,
`aufgabeSetzen()`, die Vorsilbe `eigen-` und das Feld `"art": "aufgabe"`
im Abgleich.

Das ist Absicht. Den Code umzubenennen hieße, auch `"art": "aufgabe"` zu
ändern, und dieses Wort steht in der Ablage bei Supabase, auf jedem deiner
Geräte und in jeder Sicherung. Ein Umbenennen wäre eine Stunde Arbeit, ein
Wanderungsschritt für vorhandene Einträge und ein Risiko — für null
Gegenwert. Die Beschriftung zu ändern kostet nichts.

Abschnitt 9 von `tests/test_ansicht.js` prüft die eine Richtung, auf die es
ankommt: dass auf dem Bildschirm nirgends mehr „Aufgabe" steht. Bezeichner
wie `data-aufgabe-neu` werden vor dem Vergleich herausgeschnitten — sie
sind Code, kein Text.

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

## Auf mehreren Geräten

Notizen und Aufgaben lagen anfangs nur im Browser des jeweiligen Geräts. Was
am Laptop eingetragen wurde, kannte das Handy nicht. Seit dem Geräteabgleich
sehen beide dasselbe.

**Einrichten** über das ⚙ oben rechts. Auf dem ersten Gerät „Abgleich
einschalten" — dabei entsteht ein 25-stelliger Code. Auf jedem weiteren Gerät
denselben Code eintragen, oder bequemer: „Link kopieren", sich den Link selbst
schicken und antippen.

Beim Verbinden werden die Einträge beider Geräte **zusammengeführt**. Es geht
nichts verloren, auch nicht, wenn auf beiden schon etwas stand.

**Der Code ist der Schlüssel.** Bewahr ihn auf, etwa im Passwortspeicher. Wer
ihn hat, sieht deine Notizen — und ohne ihn kommst du an die abgelegten
Einträge nicht mehr heran, falls ein Browser einmal geleert wird.

### Warum kein Login

Die Seite liegt öffentlich auf GitHub. Der Zugangsschlüssel zur Ablage steht
damit für jeden lesbar im Quelltext — so ist er auch gedacht. Er allein gibt
aber nichts frei:

- Die Tabelle liegt in einem Datenbankschema, das die Web-Schnittstelle gar
  nicht veröffentlicht. Direkt ansprechen lässt sie sich nicht.
- Erreichbar ist sie nur über zwei Funktionen, und die verlangen deinen Code.
  Der steht nirgends im Quelltext, sondern nur auf deinen Geräten.
- 25 Stellen aus einem Alphabet ohne verwechselbare Zeichen sind rund 124 Bit.
  Raten scheidet aus.

Der Vorteil gegenüber einer richtigen Anmeldung: kein Passwort, keine
Bestätigungsmail, nichts zu tippen außer einmal pro Gerät.

### Warum zusammenführen und nicht überschreiben

Der naheliegende Weg wäre „wer zuletzt speichert, gewinnt". Der verliert aber
Daten: schreibst du am Laptop eine Notiz, während das Handy noch den alten
Stand hat, würde der nächste Handy-Stand deine Notiz auslöschen — lautlos.

Deshalb wird pro **Eintrag** entschieden, nicht pro Gesamtstand. Jede Notiz
und jede Aufgabe trägt einen eigenen Zeitstempel; beim Zusammenführen gewinnt
die jüngere Fassung. Zwei Geräte können gleichzeitig etwas eintragen, ohne
sich gegenseitig zu löschen.

Damit die Zeitstempel vergleichbar sind, holt sich jedes Gerät bei jedem
Abgleich die Uhrzeit des Servers und rechnet seinen eigenen Uhrenversatz
heraus. Ohne das gewänne schlicht das Gerät, dessen Uhr am weitesten vorgeht.

**Löschen** braucht einen eigenen Eintrag — einen Grabstein. Ohne ihn wäre
„hier steht nichts" nicht von „davon weiß ich noch nichts" zu unterscheiden,
und eine gelöschte Aufgabe käme beim nächsten Abgleich vom anderen Gerät
zurück. Grabsteine verfallen nach 120 Tagen; das deckt auch die
Semesterferien ab.

**Gleichzeitiges Schreiben** fängt eine Fassungsnummer ab. Wer mit einem
veralteten Stand schreiben will, wird abgewiesen und bekommt den aktuellen
Stand mitgeliefert, führt zusammen und versucht es erneut.

### Wann abgeglichen wird

- beim Öffnen der App
- sobald du sie wieder in den Vordergrund holst (der wichtigste Fall: genau
  dann hast du gerade am anderen Gerät etwas eingetragen)
- 1,2 Sekunden nach einer Eingabe
- alle 90 Sekunden, solange die App offen und sichtbar ist
- wenn das Netz zurückkommt

Ohne Netz funktioniert alles weiter, nur eben lokal. Der nächste Abgleich
holt es nach.

## Benachrichtigungen

Bisher stand eine Änderung nur im Dashboard – man musste sie also
nachschlagen, um sie zu erfahren. Genau das sollte das Projekt eigentlich
abschaffen. Jetzt meldet sich die App von selbst: Ausfall, Raumwechsel,
verschobene Zeit, neuer Termin.

**Einrichten** über das ⚙ oben rechts, unter dem Geräteabgleich. Voraussetzung
ist ein eingerichteter Gerätecode – die Anmeldung hängt daran, sonst könnte
sich jeder eintragen, der die Seite findet.

**Auf dem iPhone geht das nur als App vom Home-Bildschirm.** Im normalen
Safari-Tab gibt es keine Benachrichtigungen, und Safari sagt auch nicht warum.
Deshalb prüft `melden.js` das vorher und schreibt den Grund hin, statt einen
Knopf zu zeigen, der nichts tut.

Ein **Probeknopf** verschickt eine Testmeldung über denselben Weg wie der
Ernstfall – über Supabase und Apples Push-Dienst, nicht als lokale Attrappe.
Sonst wüsste man erst beim nächsten echten Ausfall, ob die Kette hält.

### Der Weg einer Meldung

```
abgleich.py  findet eine Änderung in einem belegten Fach
   ↓  schreibt meldung.json (außerhalb des veröffentlichten Ordners)
GitHub-Automatik  hängt das Geheimnis an und ruft Supabase auf
   ↓
Edge Function  verschlüsselt und übergibt an Apples Push-Dienst
   ↓
iPhone  weckt sw.js, das die Mitteilung anzeigt
```

Der Versand steht im Arbeitsablauf **ganz am Ende, nach dem Hochladen**.
Sonst käme die Mitteilung an, während GitHub Pages noch den alten Stand
ausliefert – man tippt sie an und sieht den Raum von gestern.

### Was wo liegt

| Geheimnis | Wo | Wozu |
|---|---|---|
| VAPID-Schlüssel (öffentlich) | `melden.js`, im Quelltext | Damit weiß der Browser, wem er Meldungen abnimmt |
| VAPID-Schlüssel (privat) | Edge Function bei Supabase | Unterschreibt jede Meldung |
| Melde-Geheimnis | GitHub Actions Secrets | Nur damit darf die Automatik Meldungen auslösen |
| Gerätecode | Nur auf deinen Geräten | Bestimmt, welche Geräte beliefert werden |

Fehlt das Melde-Geheimnis in den Secrets, überspringt die Automatik den
Versand mit einem Hinweis im Protokoll, statt zu scheitern. Der Stundenplan
ist wichtiger als die Mitteilung darüber.

### Warum der Service Worker nichts zwischenspeichert

`sw.js` behandelt nur Benachrichtigungen – kein `fetch`-Zuhörer, kein
Zwischenspeicher. Das ist Absicht: dieses Projekt hat schon einmal einen
halben Tag damit verbracht, dass GitHub Pages Dateien zehn Minuten behalten
darf und Handy und Laptop verschiedene Fassungen zeigten. Dagegen steht die
Versionsprüfung in `app.js`. Ein zweiter Zwischenspeicher mit eigenen Regeln,
den man nur über den Service Worker wieder loswird, würde das untergraben –
und der Fehler wäre schwer zu finden, weil ein Neuladen nicht hilft.

Aus demselben Grund bekommt `sw.js` als einzige Datei **keine Versionsnummer**
an die Adresse: ein Service Worker wird über seinen Pfad angemeldet, und mit
wechselndem `?v=…` wäre es bei jeder Veröffentlichung ein anderer.

## Neue Mail melden

Das HWR-Postfach wird alle fünf Minuten angeschaut. Kommt etwas Neues und
Ungelesenes an, meldet sich das Handy mit Absender und Betreff.

**Gespeichert wird nichts.** Keine Mail landet in der App, bei Supabase oder
sonstwo. Das Skript merkt sich genau zwei Zahlen: welche Nachricht zuletzt
gesehen wurde, und zu welchem Postfachstand die Zählung gehört.

**Gelesen wird auch nichts.** Der Abruf benutzt `BODY.PEEK`, das ist die
Fassung, die den Gelesen-Haken nicht setzt. Ohne PEEK wäre nach dem ersten
Lauf das ganze Postfach als gelesen markiert.

### Warum das nur auf dem Mac läuft

Der HWR-Login ist derselbe für Moodle und die Prüfungsverwaltung. Ihn auf
einem fremden Server zu hinterlegen hieße, das ganze Hochschulkonto an einem
Ort zu bündeln. Deshalb liegt das Passwort im **macOS-Schlüsselbund**, von
Friedrich selbst eingetragen, und verlässt den Rechner nicht.

Der Preis: nachts und unterwegs kommt keine Meldung, der Mac muss an und
angemeldet sein. Die Stundenplan-Meldungen sind davon unberührt, die laufen
über GitHub und Supabase rund um die Uhr.

```bash
bash postfach-einschalten.sh
```

Das Skript fragt Benutzernamen und Passwort ab, legt beides mit `security`
im Schlüsselbund ab und richtet den Hintergrund-Job ein. Vorher macht es
einen ersten Lauf, der nur den jetzigen Stand merkt und **nichts meldet** —
sonst kämen beim Einschalten so viele Mitteilungen, wie ungelesene Mails im
Postfach liegen. iOS drosselt eine App, die im Schwall meldet, und dann käme
später auch das Wichtige nicht mehr durch.

### Was doch das Haus verlässt

Der Text der Benachrichtigung: Absender und Betreff. Er läuft über Supabase
und Apples Push-Dienst. Gespeichert wird er bei beiden nicht, aber er geht
dort durch. Wer das nicht will, setzt in `postfach.py` oben
`NUR_ANZAHL_MELDEN = True` — dann steht in der Meldung nur „2 neue Mails".

### Die drei Fallen, um die es geht

1. **`UID n:*` liefert in IMAP immer mindestens eine Nachricht**, auch wenn
   keine mit einer Nummer ab n existiert. Ein Bereich darf nach der Norm
   nicht leer sein, also gibt der Server die höchste vorhandene zurück. Ohne
   Nachprüfung käme alle fünf Minuten dieselbe alte Mail.
2. **Der erste Lauf darf nichts melden.** Siehe oben.
3. **Ändert sich UIDVALIDITY**, hat der Server neu durchnummeriert. Die
   gemerkte Zahl bedeutet dann etwas anderes.

Alle drei stecken in eigenen Funktionen (`neue_nummern`, `zu_meldende`,
`muss_neu_anfangen`) und werden von `tests/test_postfach.py` geprüft — ohne
Postfach und ohne Passwort.

### Was der Test noch prüft

Dass das Passwort nirgends hingeht. Nicht als Zeichenkettensuche, sondern am
**Syntaxbaum**: gesucht wird, ob die Variable `passwort` jemals als Wert in
einen Aufruf wandert, der etwas ausgibt oder schreibt.

Ein erster Anlauf suchte nur nach dem Wort und schlug sofort an, weil in
einer Fehlermeldung „Passwort im Schlüsselbund prüfen" steht. Das Wort ist
harmlos, die Variable nicht.

Beim Melde-Geheimnis gilt eine andere Regel: es **muss** verschickt werden,
sonst weist sich der Mac nicht aus. Es darf nur nicht ins Protokoll, das
tagelang auf der Platte liegt.

## Eigene Termine

Seit dem 21.09.2026 ist die App nicht mehr nur ein Stundenplan. Neben den
HWR-Veranstaltungen kann alles hinein, was sonst noch ansteht: Zahnarzt,
Geburtstag, Schicht, Zugfahrt.

Angelegt wird über **+ Termin** in der Werkzeugleiste, oder im
Bearbeiten-Modus über **+ Termin an diesem Tag**. Ein Termin hat Anfang und
Ende, wahlweise ganztägig, dazu Ort, Notiz und eine Wichtig-Markierung.

Eigene Termine sind **grün**, HWR-Termine blau, HWR-Hinweise orange. Man
sieht also auf einen Blick, was aus dem offiziellen Plan kommt und was man
selbst eingetragen hat.

### Warum sie dieselbe Form haben wie HWR-Termine

`eigeneTermineAlsPlan()` bringt sie in genau das Format, das aus
`daten/plan.js` kommt. Das ist der Kniff, der den Umbau klein gehalten hat:
Listenansicht, Kalenderraster, die Überlappungsrechnung für nebeneinander
liegende Termine und das Detailfenster arbeiten alle mit dieser einen Form.
Keine dieser vier Stellen musste angefasst werden.

### Die Vorsilbe `termin-`

Freie Aufgaben heißen seit Monaten `eigen-…`, und der Abgleich erkennt sie
genau daran. Ein Termin mit derselben Vorsilbe wäre beim Einlesen zur
Aufgabe gemacht worden – und Anfang und Ende wären weg gewesen. Deshalb
`termin-…`.

### Ein Eintrag aus der Zukunft wird nicht weggeworfen

Die unangenehmste Falle beim Abgleich, und sie ist nicht offensichtlich:

Legt eine spätere Fassung der App eine neue Art von Eintrag an, und ein
Gerät mit einer älteren Fassung gleicht ab, dann versteht die alte Fassung
diese Einträge nicht. Würde sie sie beim Zurückschreiben weglassen, wären
sie auf **allen** Geräten gelöscht – durch ein Gerät, das nur nicht
aktuell war.

`abgleichUebernehmen()` hebt deshalb auf, was es nicht kennt, und
`abgleichSammeln()` reicht es unverändert zurück. Ein Löschvermerk kann es
trotzdem begraben. Geprüft in `tests/test_planer.js`, Abschnitt 4.

## Das Notizbuch

Seit dem 22.09.2026 gibt es den Bereich **Notizen**. Er funktioniert wie die
Notizen-App von Apple: eine Liste, ein Fenster zum Schreiben, und ganz oben
eine **große fette Überschrift** — daran erkennt man eine Notiz beim
Überfliegen der Liste wieder.

Im Fenster sind es zwei Felder, gespeichert wird **ein** Text, dessen erste
Zeile die Überschrift ist. Ein `<textarea>` kann seine erste Zeile nicht
anders formatieren als die übrigen; dafür bräuchte es ein
`contenteditable`, und das bringt auf dem Handy mehr Ärger mit als es wert
ist. Zwei Felder sind ehrlicher und obendrein bedienbarer — die
Tabulatortaste springt von der Überschrift in den Text.

**Gespeichert wird beim Tippen**, eine knappe Sekunde nach dem letzten
Anschlag. Einen Speichern-Knopf gibt es nicht mehr; „Fertig" schließt nur
noch. Vorher gab es beide, und sie taten dasselbe. Wichtiger als die
Aufgeräumtheit: wischt man die App auf dem iPhone weg, während eine Notiz
offen ist, gibt es kein „Fertig" — bis dahin war das Getippte dann weg.
Beim Speichern wird nur die Liste dahinter neu gezeichnet, nie das Fenster
selbst, sonst spränge der Cursor mitten im Satz aus dem Textfeld.

`zettelTeile()` zerlegt, `zettelZusammensetzen()` fügt wieder zusammen. Die
beiden müssen genau ineinander aufgehen, sonst wanderte bei jedem Öffnen
und Schließen eine Zeile nach oben; Abschnitt 13 von `tests/test_zettel.js`
prüft das, indem es zweimal hintereinander zerlegt.

### Zwei Sorten Notiz, und warum beide bleiben

Die App kennt jetzt zwei Dinge, die man „Notiz" nennen könnte, und das ist
kein Versehen:

| | **Kurznotiz** | **Notiz** (Notizbuch) |
|---|---|---|
| hängt an | genau einem Termin | nichts, oder beliebig vielen Dingen |
| Länge | eine Zeile | so lang wie nötig |
| steht in | Kalenderkästchen und To-dos | Bereich „Notizen" |
| Beispiel | „11:25 Beginn" | „Klausurvorbereitung" mit drei Absätzen |

Im Terminfenster stehen beide untereinander. Damit man sie dort nicht
verwechselt, heißt die erste dort ausdrücklich **Kurznotiz**.

### Verknüpfungen

Das ist der eigentliche Zweck des Bereichs. Eine Notiz kann auf drei Dinge
zeigen:

| Symbol | Verweis | bedeutet |
|---|---|---|
| ▦ | **Modul** | gilt für alle Termine dieses Fachs |
| ◷ | **Termin** | gilt für genau diese eine Veranstaltung |
| ✎ | **Notiz** | zeigt auf eine andere Notiz |

Angelegt werden sie über **+ Verknüpfen** im Notizfenster, aus einer
Auswahlliste — nicht durch Tippen einer Syntax. Auf dem Handy wäre
`[[Modulname]]` von Hand einzugeben eine Zumutung, und ein vertippter Name
zeigt ins Leere, ohne dass man es merkt.

Gespeichert wird ein Verweis als Zeichenkette mit Doppelpunkt, etwa
`fach:34 - Schlüsselkompetenzen V`. Nicht als Objekt mit zwei Feldern: der
Abgleich entscheidet bei gleichem Zeitstempel über einen **Textabdruck** des
Eintrags, und ein verschachteltes Objekt landete dort als
`[object Object]` — zwei verschiedene Verweise sähen gleich aus.

Aus demselben Grund wird die Liste immer **sortiert** gespeichert. Sonst
hinge das Ergebnis des Abgleichs davon ab, in welcher Reihenfolge man die
Verknüpfungen angetippt hat.

### Die Rückrichtung

Tippt man einen Termin im Kalender an, stehen im Fenster darunter die
Notizen, die dazu gehören — sowohl die an diesem einen Termin als auch die
am ganzen Modul. An jeder steht, welche von beiden es ist.

Ein Termin **erbt** also die Notizen seines Moduls. Andersherum wäre es
nutzlos: welcher der zwanzig Termine eines Moduls gemeint ist, weiß man
beim Notieren meistens selbst nicht.

Von dort führen drei Knöpfe weiter: eine neue Notiz zu diesem Termin, eine
zum Modul, und „Alle Notizen zum Modul" — das filtert den Notizbereich auf
dieses Fach.

### Warum der Text im Feld `inhalt` steht und nicht in `text`

Das ist die unscheinbarste und wichtigste Entscheidung an der ganzen
Sache. Der Abgleich sortiert jeden eingehenden Eintrag ein, und eine
Fassung der App, die das Notizbuch noch nicht kennt, macht aus **jedem
Eintrag mit einem Feld `text`** eine Notiz an einem Termin. Eine Notiz aus
dem Notizbuch würde dort also zur Termin-Notiz gemacht, ihre Verknüpfungen
fielen weg — und beim nächsten Hochladen wäre das der neue Stand, auf
allen Geräten.

Ohne `text` greift stattdessen die Regel für Unbekanntes: aufheben und
unverändert zurückgeben. Ein altes Gerät reicht das Notizbuch damit durch,
ohne es anzufassen.

`tests/test_zettel.js` spielt diese alte Fassung Zeile für Zeile nach,
statt sich darauf zu verlassen.

## Erinnerungen

Seit dem 22.09.2026 kann sich ein To-do oder ein eigener Termin per
Push-Benachrichtigung melden. Eingestellt wird das beim Eintrag selbst.

| Bei einem To-do | Bei einem Termin mit Uhrzeit |
|---|---|
| Am Tag, 9:00 | 15 Minuten vorher |
| Am Tag, 18:00 | 1 Stunde vorher |
| Am Vortag, 18:00 | 3 Stunden vorher |
| 3 Tage vorher, 18:00 | 1 Tag vorher, gleiche Zeit |
| 1 Woche vorher, 18:00 | Am Vortag, 18:00 / 1 Woche vorher |

Zwei Listen, weil ein To-do keine Uhrzeit hat: „eine Stunde vorher" — vor
wann? Ein ganztägiger Termin bekommt aus demselben Grund die linke Liste.
Unter der Auswahl steht immer, **wann das konkret ist** („Meldet sich
Mi 23.09., 18:00") — sonst müsste man selbst nachrechnen, und genau das
ist die Frage beim Einstellen.

### Zwei Felder, nicht eins

Gespeichert wird beides:

```
erinnerungVorgabe  "vortag18"           ← was du ausgewählt hast
erinnerung         "2026-09-24T18:00"   ← wann das konkret ist
```

Die **Vorgabe**, damit die Erinnerung mitwandert, wenn du das
Fälligkeitsdatum verschiebst. Schiebst du ein To-do von Freitag auf
Montag, rechnet `aufgabeSetzen()` die Erinnerung bei jedem Speichern neu
aus — ohne dass du daran denken musst.

Der **Zeitpunkt**, damit der Server nichts rechnen muss. Er vergleicht
zwei Zeichenketten, fertig. Die Alternative wäre gewesen, nur die Vorgabe
zu speichern und den Server rechnen zu lassen — dann stünde dieselbe
Rechnerei zweimal da, einmal in JavaScript und einmal in TypeScript, und
liefe beim nächsten Umbau auseinander.

### Warum die Zeit als Text verglichen wird

Die Angabe ist **Ortszeit ohne Zeitzone**: `2026-09-24T18:00` heißt
18 Uhr in Berlin. Der Server holt sich die Berliner Zeit im selben Format
und vergleicht mit `<`. Das sieht nach einer Abkürzung aus, ist aber die
verlässlichere Rechnung: die Sommerzeit gibt es an dieser Stelle gar nicht
erst. Wer in UTC rechnet, muss zweimal im Jahr richtig liegen, und zwar in
beide Richtungen.

Aus demselben Grund werden **Tage und Minuten nie vermischt**. „Einen Tag
vorher" verschiebt nur das Datum, „eine Stunde vorher" nur die Uhrzeit.
`tagVerschieben()` rechnet dabei über 12:00 UTC — ab Mitternacht gerechnet
landet man in der Nacht der Zeitumstellung beim Vortag.

### Wer verschickt

Nicht die App und nicht GitHub, sondern **pg_cron in der Datenbank**: alle
fünf Minuten ruft sie die Edge Function `erinnern` auf. Die GitHub-Automatik
läuft laut GitHub nur „nach Möglichkeit" und kam beim Ausprobieren schon
zwanzig Minuten zu spät — für den Stundenplan egal, für eine Erinnerung um
08:00 nicht.

`erinnern` liest alle Räume, sucht fällige Erinnerungen, **vermerkt sie vor
dem Verschicken** und reicht sie an `stundenplan-melden` weiter. Der
Vermerk kommt zuerst, weil der umgekehrte Weg bei einem Fehlschlag alle
fünf Minuten dieselbe Meldung auf den Sperrbildschirm schöbe. Eine
verpasste Erinnerung ist ärgerlich, eine Dauerschleife ist schlimmer.

Der Vermerk liegt in einer eigenen Tabelle, nicht am Eintrag. Sonst
schriebe der Server in einen Raum, während das Handy es auch tut, und die
Fassungsprüfung schlüge fehl.

### Das Lebenszeichen

Beim Einrichten rief der Zeitplan `extensions.http_post()` auf — die
Funktion liegt aber in `net`. Der Auftrag lief alle fünf Minuten an und
scheiterte jedes Mal, **und meldete sich bei niemandem**. Es wäre einfach
nie eine Erinnerung gekommen, und man hätte gedacht, man habe keine
gestellt.

Das ist die unangenehmste Sorte Fehler: einer, der wie Abwesenheit
aussieht. Seitdem schreibt jeder Lauf seine Zeit weg, und zwei Stellen
lesen sie:

- das ⚙-Fenster unter **Erinnerungen** („Läuft. Zuletzt vor 3 Min.")
- `tests/test_erinnern.py`, der abbricht, wenn der letzte Lauf über eine
  Viertelstunde her ist

Die Abfrage ist bewusst öffentlich — sie verrät nichts außer der Zahl der
Sekunden. Wäre sie geschützt, könnte die App sie nicht anzeigen, und genau
dort gehört sie hin.

## Hell oder dunkel

Im ⚙-Fenster steht unter **Aussehen** eine Wahl: Automatisch, Hell, Dunkel.
„Automatisch" folgt dem Gerät, also am iPhone auch dessen Zeitschaltung.

Technisch hängt die Farbe am Attribut `data-thema` des `<html>`-Elements,
nicht mehr an `@media (prefers-color-scheme: dark)`. Gesetzt wird es an
zwei Stellen:

1. von einem kurzen Skript **im Kopf der `index.html`**, noch vor dem
   Stilblatt — sonst blitzte die App bei jedem Start weiß auf, bevor sie
   dunkel wird;
2. danach von `themaAnwenden()` in `app.js`.

Das Skript im Kopf kann die Konstante `SPEICHER_THEMA` nicht benutzen,
`app.js` ist da noch nicht geladen. Der Schlüsselname steht dort also
ausgeschrieben. Benennt ihn jemand um, funktioniert die App weiter und
blitzt nur bei jedem Start — genau die Sorte Fehler, die man monatelang
hinnimmt. Abschnitt 9 von `tests/test_zettel.js` vergleicht deshalb beide
Stellen miteinander.

## Apple Kalender

**Alles in einem Kalender**: der Stundenplan der HWR, deine eigenen Termine
und die offenen Aufgaben. Die Adresse steht im ⚙-Fenster unter **Apple
Kalender**.

Wer den HWR-Kalender schon separat abonniert hat, sollte das alte Abo
entfernen – sonst steht jede Vorlesung doppelt drin. Mit `&plan=0` an der
Adresse bleibt der Stundenplan draußen, dann sind zwei Abos in Ordnung.

```
webcal://copydwpdqpnwjvknsakz.supabase.co/functions/v1/kalender?code=<dein Code>
```

Geliefert wird das von einer Edge Function bei Supabase. Sie läuft rund um
die Uhr; der Mac muss nicht an sein.

### Warum ein Fehler hier laut sein muss

Ein Abonnement ist kein gewöhnlicher Abruf. Die Kalender App **ersetzt bei
jedem Mal ihren gesamten Inhalt** durch das, was zurückkommt. Käme einmal
ein Kalender ohne Vorlesungen, weil die Plandatei gerade nicht erreichbar
war, verschwänden alle Vorlesungen aus dem Kalender – bis zum nächsten
erfolgreichen Abruf, und der kann Stunden später sein.

Beim Ausprobieren kam genau das einmal vor: ein Abruf lieferte null
Vorlesungen, während fünf weitere sauber durchliefen. Seitdem versucht die
Funktion es zweimal und meldet danach lieber einen Fehler. Ein „Abo nicht
erreichbar" ist unangenehm, ein stillschweigend geleerter Stundenplan ist
schlimmer.

**Es geht nur in eine Richtung**, von der App in den Kalender. Was in der
Kalender App eingetragen wird, kommt nicht zurück. Für zwei Richtungen
bräuchte es ein iCloud-Passwort, und das nehme ich nicht an – aus demselben
Grund wie beim HWR-Login.

Wie oft die Kalender App nachschaut, entscheidet Apple. Der Feed bittet um
stündlich (`REFRESH-INTERVAL`), garantiert ist das nicht. In der Kalender
App lässt sich das unter *Einstellungen → Accounts → Abonnements* ändern.

**Der Code steckt in der Abo-Adresse.** Anders geht es nicht: die Kalender
App kann sich nicht ausweisen, sie ruft eine Adresse ab und fertig. Wer die
Adresse hat, sieht die Termine.

Erledigte Aufgaben kommen bewusst nicht mit. Im Kalender steht, was noch
ansteht; hakt man etwas ab, verschwindet es beim nächsten Abruf von selbst.

### Drei Fallen in einer Kalenderdatei

1. **Komma und Semikolon trennen Felder.** „Essen mit Mama, Papa" wäre ohne
   Maskierung zwei Einträge.
2. **75 Oktett pro Zeile, nicht 75 Zeichen.** Ein Umlaut braucht zwei Byte.
   Wer nach Zeichen zählt, zerschneidet irgendwann einen mittendrin, und die
   Datei ist unlesbar. `tests/test_kalenderfeed.py` prüft das mit einem
   Titel, der genau dort umbricht.
3. **Das Ende eines ganztägigen Termins ist ausschließend.** Ein Termin am
   25. endet am 26. Wer denselben Tag einsetzt, bekommt einen Termin ohne
   Dauer, den manche Kalender gar nicht zeigen.

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

## Zeiten, die im Plan falsch stehen

Manches trägt die HWR falsch ein. *Nachhaltiges Wirtschaften (Do)* beginnt
donnerstags um 8:45, im Plan steht bei den ersten fünf Terminen aber 8:00 —
ab dem 17.09. dann korrekt 8:45. Solche Ausreißer zieht `ZEITKORREKTUREN`
in `abgleich.py` gerade.

**Die Korrektur greift nur für die Anzeige.** `korrekturen_anwenden()` gibt
eine neue Liste zurück; gespeichert und verglichen wird weiter der
Originalplan. Täte man es andersherum, meldete jeder Abgleich eine Änderung,
die es nie gab — oder schlimmer, eine echte Änderung ginge unter.

**Jede Einstellung, die die Anzeige beeinflusst, gehört in
`anzeige_einstellungen()`** — Fächerliste, Gruppenliste, Zeitkorrekturen.
Der gespeicherte Stand merkt sich diese Sammlung; weicht sie ab, werden die
Anzeigedateien neu geschrieben, auch wenn der Plan selbst gleich blieb.

Das ist kein Schmuck: genau daran ist das Projekt zweimal gescheitert. Erst
kannte die Prüfung die Fächerliste nicht, dann die Zeitkorrekturen — in
beiden Fällen blieb die alte Anzeige stehen und die Änderung schien nicht
anzukommen. Wer künftig eine Einstellung ergänzt, trägt sie nur dort ein.

Das Feld `von` verhindert doppeltes Verschieben: korrigiert die HWR die Zeit
irgendwann selbst auf 8:45, passt die Regel nicht mehr und tut nichts.
Korrigierte Termine tragen im Dashboard einen Vermerk und in der
Kalenderdatei eine Zeile in der Beschreibung — die abweichende Zeit soll
nicht heimlich passieren.

## Tests

```bash
bash tests/alle.sh
```

Einzeln:

```bash
python3 tests/test_korrektur.py
```

```bash
python3 tests/test_erkennung.py
```

```bash
osascript -l JavaScript tests/test_abgleich.js
```

```bash
osascript -l JavaScript tests/test_ansicht.js
```

```bash
python3 tests/test_abgleich_ablage.py
```

```bash
python3 tests/test_melden.py
```

```bash
osascript -l JavaScript tests/test_planer.js
```

```bash
osascript -l JavaScript tests/test_zettel.js
```

```bash
python3 tests/test_erinnern.py
```

```bash
python3 tests/test_kalenderfeed.py
```

```bash
python3 tests/test_postfach.py
```

`test_korrektur.py` prüft die Zeitkorrekturen. `test_erkennung.py` prüft, ob
Änderungen und Ausfälle im Stundenplan noch erkannt werden — und ebenso
wichtig, dass am Rand des gleitenden Zeitfensters **kein** Fehlalarm
entsteht. `test_abgleich.js` prüft das
Zusammenführen zweier Stände — die Stelle, an der Daten verlorengehen
könnten. `test_ansicht.js` prüft die Zeitfächer im To-do-Bereich und die
Karte „Als Nächstes". `test_abgleich_ablage.py` prüft die echte Ablage:
Berechtigungen, Sperre beim gleichzeitigen Schreiben, Abschottung der Räume
gegeneinander. `test_melden.py` prüft die Benachrichtigungen – vor allem,
dass die Push-Adressen mit dem öffentlichen Schlüssel **nicht** lesbar sind:
wer sie hat, kann dem Handy Mitteilungen schicken.

Der wichtigste Einzeltest ist Nummer 5 in `test_ansicht.js`: er verteilt 733
Einträge — jeden Tag von einem Jahr davor bis ein Jahr danach — auf die
Zeitfächer und prüft, dass die Summe wieder 733 ergibt und kein Eintrag
doppelt vorkommt. Fiele einer durch alle Bedingungen, verschwände er lautlos
aus der Anzeige, und es fehlte nichts, was man vermissen könnte.

Der Ablage-Test läuft gegen den echten Server und benutzt dafür zwei feste
Testräume, die er bei jedem Lauf überschreibt. Mit deinen Daten hat er
nichts zu tun.

**Warum osascript und nicht node:** auf diesem Mac liegt kein node. Der
eingebaute JavaScript-Interpreter genügt für Rechenprüfungen. Promises laufen
dort mangels Ereignisschleife nicht durch — deshalb wird der Netzteil in
Python gegen den echten Server geprüft und nicht gegen eine Attrappe.

**Die Tests wurden gegengeprüft.** In `sync.js` wurden nacheinander sechs
Fehler absichtlich eingebaut, um zu sehen, ob die Tests anschlagen. Fünf
wurden erkannt, einer nicht: die Prüfung „das Jüngere gewinnt" war grün,
obwohl die Zeitregel ausgebaut war — die Ersatzregel für Gleichstände kam bei
diesen Testdaten zufällig zum selben Ergebnis. Der Fall steht jetzt so da,
dass nur die Zeitregel zum richtigen Ergebnis führt (eine Aufgabe, die am
einen Gerät abgehakt und am anderen später wieder ausgehakt wird).

Mehrere Fehler fanden sich erst beim Ausprobieren im Browser und haben
seitdem eigene Tests: die Zuhörer für den regelmäßigen Abgleich wurden nicht
angehängt, solange noch kein Code gesetzt war; ein Code-Link, der auf eine
bereits offene Seite trifft, löste kein Neuladen aus und wurde deshalb
ignoriert; und in der Karte „Als Nächstes" stand `[object Object]` statt der
Notiz — ein Überbleibsel davon, dass eine Notiz früher ein bloßer Text war
und später ein Objekt wurde.

Beim Ausmessen der Kalenderkästchen ist zweimal eine Messung grün gewesen,
die gar nichts gemessen hat: einmal, weil der Kalender im Hintergrund lag und
alle Höhen null waren, einmal, weil `scrollHeight` bei `overflow: hidden` nie
kleiner als das Element selbst wird und die Rechnung deshalb immer genau eine
Zeile ergab. Beides sah nach einem Ergebnis aus. Seitdem prüft jede Messung
zuerst, ob sie überhaupt etwas misst.

Die Tests gehören ins Repository, nicht in einen temporären Ordner. Eine
frühere Sammlung lag im Sitzungs-Zwischenspeicher und war beim
Sitzungswechsel weg.

## Semesterwechsel

In `abgleich.py` ganz oben `SEMESTER` ändern, z. B. auf `"semester6"`.
Danach einmal `daten/stand.json` löschen, damit nicht der komplette alte
Plan als „entfallen" gemeldet wird.

## Dateien

| Datei | Wofür |
|---|---|
| `abgleich.py` | holt den Plan, vergleicht, benachrichtigt |
| `index.html` · `style.css` · `app.js` | das Dashboard |
| `sync.js` | der Geräteabgleich: Netz, Zusammenführen, Grabsteine |
| Edge Function `kalender` | liefert eigene Termine als Kalender-Abo |
| `melden.js` | Benachrichtigungen an- und abmelden |
| `sw.js` | nimmt Benachrichtigungen entgegen (sonst nichts) |
| `manifest.json` | beschreibt die Seite als App |
| `tests/alle.sh` | ruft alle Testsammlungen nacheinander auf |
| `tests/test_zettel.js` | Notizbuch, Erinnerungen, Datums-Schnellwahl |
| `tests/test_erinnern.py` | Läuft der Erinnerungs-Zeitplan noch? |
| Edge Function `erinnern` | verschickt fällige Erinnerungen, alle 5 Min. |
| `daten/plan.js` | die Daten fürs Dashboard (erzeugt) |
| `daten/stand.json` | zuletzt gesehener Stand für den Vergleich (erzeugt) |
| `daten/protokoll.log` | Ausgaben des Hintergrund-Jobs (erzeugt) |
| `benachrichtigung-*.sh` | Hintergrund-Job für den Stundenplan ein-/ausschalten |
| `postfach.py` | schaut ins HWR-Postfach und meldet neue Mails |
| `postfach-*.sh` | Mail-Benachrichtigung ein-/ausschalten |
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
- **Der Fächerfilter wird nicht abgeglichen**, nur Notizen und Aufgaben. Die
  Auswahl ist eher eine Geräteeinstellung, und ein stiller Wechsel wäre
  verwirrender als ein zweites Häkchensetzen.
- **Ohne den Code kommst du nicht an die abgelegten Einträge.** Es gibt
  absichtlich keine Hintertür — sonst wäre die Absicherung keine. Der Code
  steht im ⚙-Fenster; er gehört in den Passwortspeicher.
- **Die Ablage liegt bei Supabase im kostenlosen Tarif.** Solche Projekte
  schlafen nach sieben ruhigen Tagen ein. Damit das in den Semesterferien
  nicht passiert, schickt die GitHub-Automatik bei jedem Lauf ein
  Lebenszeichen mit.
- **Die Einträge liegen unverschlüsselt in der Datenbank.** Von außen kommt
  ohne Code niemand heran, Supabase als Betreiber grundsätzlich schon. Für
  Vorlesungsnotizen ist das vertretbar; eine Verschlüsselung hätte bedeutet,
  dass ein verlorener Code die Daten endgültig unlesbar macht.
