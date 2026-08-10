#!/bin/bash
#
# Richtet den Hintergrund-Job ein, der regelmaessig nach Aenderungen schaut.
#
# macOS nennt so etwas einen "LaunchAgent": eine kleine Datei, die dem System
# sagt "starte dieses Programm alle X Sekunden". Der Job laeuft unter deinem
# Benutzer, nur wenn du angemeldet bist - er braucht keine Administratorrechte.
#
# Aufruf:  bash benachrichtigung-einschalten.sh

set -e

# Wie oft nachgeschaut wird, in Sekunden. 1800 = alle 30 Minuten.
# Das belastet den HWR-Server praktisch nicht: solange sich nichts geaendert
# hat, antwortet er nur mit "unveraendert" und schickt keine Daten.
INTERVALL=1800

# Der Ordner, in dem dieses Skript liegt.
ORDNER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

KENNUNG="de.hwr.stundenplan.abgleich"
PLIST="$HOME/Library/LaunchAgents/$KENNUNG.plist"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$ORDNER/daten"

# Falls der Job schon laeuft, erst abmelden. Sonst beschwert sich launchctl.
launchctl bootout "gui/$UID/$KENNUNG" 2>/dev/null || true

cat > "$PLIST" <<PLISTENDE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$KENNUNG</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>$ORDNER/abgleich.py</string>
    </array>

    <!-- Alle $INTERVALL Sekunden ausfuehren. War der Mac zwischendurch im
         Ruhezustand, holt macOS den Lauf beim Aufwachen nach. -->
    <key>StartInterval</key>
    <integer>$INTERVALL</integer>

    <!-- Einmal sofort beim Anmelden pruefen. -->
    <key>RunAtLoad</key>
    <true/>

    <key>WorkingDirectory</key>
    <string>$ORDNER</string>

    <!-- Was das Skript ausgibt, landet in dieser Datei. Praktisch, wenn mal
         etwas nicht klappt. -->
    <key>StandardOutPath</key>
    <string>$ORDNER/daten/protokoll.log</string>
    <key>StandardErrorPath</key>
    <string>$ORDNER/daten/protokoll.log</string>
</dict>
</plist>
PLISTENDE

launchctl bootstrap "gui/$UID" "$PLIST"

echo "Eingerichtet. Der Stundenplan wird ab jetzt alle $((INTERVALL / 60)) Minuten geprueft."
echo
echo "Pruefen, ob er laeuft:   launchctl list | grep stundenplan"
echo "Protokoll ansehen:       tail -f \"$ORDNER/daten/protokoll.log\""
echo "Wieder abschalten:       bash \"$ORDNER/benachrichtigung-ausschalten.sh\""
