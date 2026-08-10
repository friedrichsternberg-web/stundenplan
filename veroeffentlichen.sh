#!/bin/bash
#
# Schiebt den aktuellen Stand zu GitHub, damit das Handy ihn sieht.
#
# Wird normalerweise von abgleich.py selbst aufgerufen, sobald sich etwas
# geaendert hat. Von Hand aufrufen kannst du es immer - zum Beispiel nachdem
# du in abgleich.py deine Faecherliste geaendert hast.
#
# Aufruf:  bash veroeffentlichen.sh

ORDNER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ORDNER" || exit 1

# Ist ueberhaupt ein GitHub-Repository hinterlegt? Solange nicht, tut dieses
# Skript nichts - das Dashboard funktioniert am Mac ja trotzdem.
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Kein GitHub-Repository hinterlegt (git remote 'origin' fehlt) - nichts veroeffentlicht."
  exit 0
fi

# Gibt es an den beiden Dateien ueberhaupt etwas Neues?
if [ -z "$(git status --porcelain -- daten/plan.js daten/meine-termine.ics)" ]; then
  echo "Nichts Neues zu veroeffentlichen."
  exit 0
fi

git add daten/plan.js daten/meine-termine.ics

if ! git commit -q -m "Stundenplan-Stand vom $(date '+%d.%m.%Y %H:%M')"; then
  echo "Commit fehlgeschlagen."
  exit 1
fi

# Der aktuelle Zweig, damit das Skript auch nach einer Umbenennung von
# "main" auf etwas anderes noch funktioniert.
ZWEIG="$(git rev-parse --abbrev-ref HEAD)"

if git push -q origin "$ZWEIG"; then
  echo "Veroeffentlicht."
else
  echo "Hochladen fehlgeschlagen. Der Commit liegt lokal bereit und geht beim"
  echo "naechsten Mal mit raus. Haeufigster Grund: die Anmeldung bei GitHub"
  echo "fehlt noch. Einmal von Hand 'git push' im Terminal ausfuehren."
  exit 1
fi
