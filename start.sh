#!/bin/sh
# ============================================================
#   Aternos AFK bot - Linux / macOS / Raspberry Pi start.
#   Run it with:  ./start.sh
#   Ubuntu users may need:  chmod +x start.sh
# ============================================================

# Move into the folder this script lives in. Shell parameter expansion is used
# instead of the `dirname` command so the script needs nothing but a shell.
case "$0" in
  */*) cd "${0%/*}" || exit 1 ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js is not installed."
  echo
  echo "  Easiest:  https://nodejs.org  - download the LTS version"
  echo "  macOS:    brew install node"
  echo "  Debian/Raspberry Pi OS:  sudo apt install -y nodejs npm"
  echo
  echo "  Install it, then run ./start.sh again."
  echo
  exit 1
fi

exec node scripts/launch.js
