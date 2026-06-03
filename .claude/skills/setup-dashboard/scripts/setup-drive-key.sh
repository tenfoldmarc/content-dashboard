#!/bin/bash
# Auto-create a restricted Google Drive API key for the publishing queue.
# Requires: gcloud installed + authenticated (`gcloud auth login`).
# Usage: ./setup-drive-key.sh [PROJECT_ID]
#   If PROJECT_ID is omitted, uses the active gcloud project.
#
# Prints the API key on the last line as: DRIVE_API_KEY=<key>
set -e

PROJECT="${1:-$(gcloud config get-value project 2>/dev/null)}"
if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  echo "No project. Pass one: ./setup-drive-key.sh my-project-id" >&2
  exit 1
fi

echo "Project: $PROJECT" >&2
echo "Enabling Google Drive API (can take ~20s)..." >&2
gcloud services enable drive.googleapis.com --project="$PROJECT" >&2

echo "Creating API key..." >&2
KEY=$(gcloud services api-keys create \
  --project="$PROJECT" \
  --display-name="Content Dashboard Drive" \
  --format="value(response.keyString)")

if [ -z "$KEY" ]; then echo "Key creation failed." >&2; exit 1; fi

# Restrict the key to the Drive API only (best practice)
KEY_NAME=$(gcloud services api-keys list --project="$PROJECT" \
  --filter="displayName='Content Dashboard Drive'" \
  --format="value(name)" | head -1)
gcloud services api-keys update "$KEY_NAME" \
  --api-target=service=drive.googleapis.com --project="$PROJECT" >&2 || true

echo "Done. Key created and restricted to Drive API." >&2
echo "DRIVE_API_KEY=$KEY"
