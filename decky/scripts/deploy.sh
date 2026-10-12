#!/usr/bin/env bash
# DECK_HOST  Deck hostname or IP (default: steamdeck.local)
# DECK_USER  SSH user (default: deck)
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DECK_HOST:-steamdeck.local}"
USER_NAME="${DECK_USER:-deck}"
PLUGIN_DIR=download-all
ARCHIVE=/tmp/$PLUGIN_DIR.tar.gz

tar -czf "$PLUGIN_DIR.tar.gz" plugin.json package.json main.py dist
trap 'rm -f "$PLUGIN_DIR.tar.gz"' EXIT

echo "Copying to $USER_NAME@$HOST..."
scp "$PLUGIN_DIR.tar.gz" "$USER_NAME@$HOST:$ARCHIVE"

echo "Installing and restarting Decky Loader..."
ssh -t "$USER_NAME@$HOST" "
	set -e
	dest=\$HOME/homebrew/plugins/$PLUGIN_DIR
	sudo rm -rf \"\$dest\"
	sudo mkdir -p \"\$dest\"
	sudo tar --no-same-owner -xzf $ARCHIVE -C \"\$dest\"
	rm -f $ARCHIVE
	sudo systemctl restart plugin_loader
"
echo "Deployed. Open the Quick Access Menu (...) > Decky > Download All."
