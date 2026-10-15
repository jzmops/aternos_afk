#!/bin/sh
# ============================================================
#   Aternos AFK bot - start WITHOUT installing Node.js.
#
#   The first run downloads an official copy of Node.js into
#   the runtime/ folder next to this script and runs the bot
#   with it. Nothing is installed system-wide, no sudo is
#   needed, and nothing outside this folder is touched.
#
#   Run it with:  ./start-no-install.sh
#                (Ubuntu users may need: chmod +x start-no-install.sh)
#
#   Already have Node.js? Use ./start.sh instead - no download.
# ============================================================

# Bump this when you want a newer Node.js. Any version with a
# "-linux-x64" / "-darwin-arm64" archive on nodejs.org works.
NODE_VERSION=v24.22.0

# Move into the folder this script lives in (no external commands).
case "$0" in
  */*) cd "${0%/*}" || exit 1 ;;
esac

RUNTIME="$(pwd)/runtime"
NODE_BIN="$RUNTIME/bin/node"

if [ ! -x "$NODE_BIN" ]; then
  case "$(uname -s)" in
    Linux)  os_part=linux ;;
    Darwin) os_part=darwin ;;
    *)
      echo
      echo "  This script handles Linux and macOS only."
      echo "  On Windows, double-click start-no-install.bat instead."
      echo
      exit 1
      ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)   arch_part=x64 ;;
    arm64|aarch64)  arch_part=arm64 ;;
    *)
      echo
      echo "  Unsupported processor: $(uname -m)"
      echo "  Install Node.js from https://nodejs.org and use ./start.sh instead."
      echo
      exit 1
      ;;
  esac

  if [ "$os_part" = "darwin" ]; then ext=tar.gz; else ext=tar.xz; fi
  url="https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-$os_part-$arch_part.$ext"
  archive="./runtime-download.$ext"

  echo
  echo "  Node.js is not installed, so this will download an official copy"
  echo "  ($NODE_VERSION for $os_part-$arch_part, about 30 MB) into the runtime"
  echo "  folder. It is a one-off download, and nothing is installed system-wide."
  echo

  if command -v curl >/dev/null 2>&1; then
    curl -L --fail --progress-bar -o "$archive" "$url" || curl_status=$?
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$archive" "$url" || curl_status=$?
  else
    curl_status=1
    echo "  [!] Neither curl nor wget is available to do the download."
    echo "      Install Node.js from https://nodejs.org and use ./start.sh."
  fi

  if [ -n "$curl_status" ] || [ ! -s "$archive" ]; then
    echo "  [!] The download failed - check the internet connection and run this again."
    rm -f "$archive"
    exit 1
  fi

  mkdir -p "$RUNTIME"
  if ! tar -xf "$archive" -C "$RUNTIME" --strip-components=1; then
    echo "  [!] Could not unpack the download. Nothing was installed."
    rm -rf "$RUNTIME"
    rm -f "$archive"
    exit 1
  fi
  rm -f "$archive"

  if [ ! -x "$NODE_BIN" ]; then
    echo "  [!] The download unpacked but no node binary appeared in runtime/."
    echo "      Install Node.js from https://nodejs.org and use ./start.sh."
    exit 1
  fi

  echo
  echo "  Done - running the private copy of Node.js from ./runtime from now on."
fi

# Put the private runtime first on PATH so the launcher's "npm ci" step finds
# the npm that ships with it rather than none at all.
PATH="$RUNTIME/bin:$PATH"
export PATH

exec "$NODE_BIN" scripts/launch.js "$@"
