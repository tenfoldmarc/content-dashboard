#!/bin/bash
# Preflight check for the Content Dashboard setup skill.
# Reports which tools are installed and whether key env values already exist.
# Read-only — changes nothing.

echo "── Tools ──────────────────────────────────────────────"
check() {
  local name="$1"; local cmd="$2"; local hint="$3"
  if command -v "$cmd" >/dev/null 2>&1; then
    local v; v=$("$cmd" --version 2>/dev/null | head -1)
    printf "  %-12s ✓  %s\n" "$name" "$v"
  else
    printf "  %-12s ✗  missing  (%s)\n" "$name" "$hint"
  fi
}
check "node"     node     "install Node 18+ from nodejs.org"
check "npm"      npm      "comes with Node"
check "git"      git      "https://git-scm.com"
check "gh"       gh       "optional — GitHub CLI (cli.github.com)"
check "vercel"   vercel   "optional — npm i -g vercel"
check "supabase" supabase "optional — brew install supabase/tap/supabase"
check "gcloud"   gcloud   "optional — only for auto-creating a Drive API key"
check "openssl"  openssl  "ships with macOS/Linux"

echo ""
echo "── Existing credentials found (names only, no values) ──"
FOUND=0
scan() {
  local f="$1"
  [ -f "$f" ] || return
  local hits
  hits=$(grep -oE '^[A-Z0-9_]+=' "$f" 2>/dev/null | sed 's/=$//' | sort -u)
  if [ -n "$hits" ]; then
    echo "  in $f:"
    echo "$hits" | sed 's/^/    • /'
    FOUND=1
  fi
}
scan "./.env.local"
scan "./.env"
scan "$HOME/.claude/.env"
[ "$FOUND" -eq 0 ] && echo "  (none found — that's fine, we'll create them)"

echo ""
echo "── Repo check ─────────────────────────────────────────"
if [ -f package.json ] && grep -q '"content-' package.json 2>/dev/null; then
  echo "  ✓ looks like the content-dashboard repo"
else
  echo "  ✗ run this from the cloned content-dashboard folder"
fi
if [ -d node_modules ]; then echo "  ✓ dependencies installed"; else echo "  • run: npm install"; fi
