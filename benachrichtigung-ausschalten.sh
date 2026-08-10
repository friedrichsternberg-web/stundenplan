#!/bin/bash
#
# Schaltet den Hintergrund-Job wieder ab und raeumt ihn weg.
#
# Aufruf:  bash benachrichtigung-ausschalten.sh

KENNUNG="de.hwr.stundenplan.abgleich"
PLIST="$HOME/Library/LaunchAgents/$KENNUNG.plist"

launchctl bootout "gui/$UID/$KENNUNG" 2>/dev/null || true
rm -f "$PLIST"

echo "Abgeschaltet. Es werden keine Benachrichtigungen mehr geschickt."
echo "Das Dashboard funktioniert weiter - es zeigt dann den zuletzt geholten Stand."
