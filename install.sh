#!/usr/bin/env sh
set -e

REPO="arturxdev/skillz"
BIN_DIR="$HOME/.skillz/bin"
BIN_PATH="$BIN_DIR/skillz"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  darwin) OS="darwin" ;;
  linux)  OS="linux"  ;;
  *) echo "skillz: unsupported OS: $OS (only Linux and macOS)"; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "skillz: unsupported arch: $ARCH"; exit 1 ;;
esac

ASSET="skillz-${OS}-${ARCH}"
LATEST_URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

echo "→ Downloading ${ASSET}..."
mkdir -p "$BIN_DIR"
curl -fsSL "$LATEST_URL" -o "$BIN_PATH.tmp"
chmod +x "$BIN_PATH.tmp"
mv "$BIN_PATH.tmp" "$BIN_PATH"

SHELL_NAME="$(basename "${SHELL:-/bin/sh}")"
case "$SHELL_NAME" in
  zsh)  RC_FILE="$HOME/.zshrc" ;;
  bash) RC_FILE="$HOME/.bashrc" ;;
  fish) RC_FILE="$HOME/.config/fish/config.fish" ;;
  *)    RC_FILE="" ;;
esac

if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
  echo ""
  echo "⚠  $BIN_DIR is not in your PATH."
  if [ -n "$RC_FILE" ]; then
    echo "   Add this line to $RC_FILE:"
    echo ""
    echo "     export PATH=\"\$HOME/.skillz/bin:\$PATH\""
    echo ""
    echo "   Then: source $RC_FILE"
  fi
fi

echo "✓ skillz installed at $BIN_PATH"
echo "→ Start with: skillz link <your-email>"
