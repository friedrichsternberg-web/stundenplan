#!/bin/bash
#
# Schaltet die Mail-Benachrichtigung wieder ab.
#
# Der Zugang bleibt dabei im Schluesselbund liegen - falls du es spaeter
# wieder einschalten willst, musst du ihn nicht neu eintippen. Wer ihn
# wirklich loswerden will, findet unten den Befehl dafuer.
#
# Aufruf:  bash postfach-ausschalten.sh

KENNUNG="de.hwr.stundenplan.postfach"
PLIST="$HOME/Library/LaunchAgents/$KENNUNG.plist"

launchctl bootout "gui/$UID/$KENNUNG" 2>/dev/null || true
rm -f "$PLIST"

echo "Abgeschaltet. Es kommen keine Mail-Benachrichtigungen mehr."
echo
echo "Der HWR-Zugang liegt weiterhin im Schluesselbund. Zum Loeschen:"
echo "  security delete-internet-password -s imap.stud.hwr-berlin.de"
echo "  security delete-generic-password -s stundenplan-melde-geheimnis"
