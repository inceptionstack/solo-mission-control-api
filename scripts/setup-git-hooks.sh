#!/usr/bin/env bash
set -euo pipefail

HOOKS_DIR="$(git rev-parse --show-toplevel)/.git/hooks"

cat > "$HOOKS_DIR/pre-commit" << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Prevent committing .env files with secrets
if git diff --cached --name-only | grep -qE '^\.env$'; then
  echo "ERROR: Refusing to commit .env — add secrets to .gitallowed if intentional"
  exit 1
fi

# Type-check
npm run build
EOF

chmod +x "$HOOKS_DIR/pre-commit"
echo "Git hooks installed."
