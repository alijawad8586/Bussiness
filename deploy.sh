#!/usr/bin/env bash
# Publishes the database rules, indexes and backend functions to Firebase in one go.
#
# Easiest way (no installs): open https://console.cloud.google.com, click the ">_" Cloud Shell icon, then run
#   (optional) export WA_VERIFY_TOKEN='your-own-token'   # otherwise a random one is created
#   git clone -b claude/whatsapp-patient-messaging-frontend-ktdy6d https://github.com/alijawad8586/Bussiness && cd Bussiness && ./deploy.sh
#
# Needs: the Blaze (pay-as-you-go) plan on the Firebase project, and Node.js 20+.
set -euo pipefail

PROJECT="${1:-new-app-8f5f3}"
cd "$(dirname "$0")"
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

command -v node >/dev/null || { echo "Node.js is required (https://nodejs.org)."; exit 1; }
FB="npx --yes firebase-tools@latest"

say "1/5 Sign in to Firebase"
if ! $FB projects:list >/dev/null 2>&1; then
  $FB login --no-localhost
fi

say "2/5 Backend settings (functions/.env)"
touch functions/.env
# set_var KEY VALUE: writes or replaces one line in functions/.env
set_var() {
  { grep -v "^$1=" functions/.env || true; printf '%s=%s\n' "$1" "$2"; } > functions/.env.tmp
  mv functions/.env.tmp functions/.env
}
if [ -n "${WA_VERIFY_TOKEN:-}" ]; then
  set_var WA_VERIFY_TOKEN "$WA_VERIFY_TOKEN"
  echo "Using the verify token you provided."
elif ! grep -q '^WA_VERIFY_TOKEN=' functions/.env; then
  set_var WA_VERIFY_TOKEN "$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
  echo "Created a new random verify token."
fi
if [ -n "${WA_APP_SECRET:-}" ]; then
  set_var WA_APP_SECRET "$WA_APP_SECRET"
elif ! grep -q '^WA_APP_SECRET=' functions/.env; then
  set_var WA_APP_SECRET ""
fi
VERIFY="$(grep '^WA_VERIFY_TOKEN=' functions/.env | cut -d= -f2-)"

say "3/5 Turn on the Google services the backend needs"
if command -v gcloud >/dev/null 2>&1; then
  gcloud services enable cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
    run.googleapis.com cloudtasks.googleapis.com eventarc.googleapis.com firestore.googleapis.com \
    --project "$PROJECT" || echo "(could not enable some services automatically; firebase deploy will try again)"
  NUM="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)' 2>/dev/null || true)"
  if [ -n "$NUM" ]; then
    SA="serviceAccount:${NUM}-compute@developer.gserviceaccount.com"
    for ROLE in roles/cloudtasks.enqueuer roles/iam.serviceAccountUser; do
      gcloud projects add-iam-policy-binding "$PROJECT" --member="$SA" --role="$ROLE" --condition=None >/dev/null \
        || echo "(could not add $ROLE; add it in the IAM page if sending later says the queue cannot start)"
    done
  fi
else
  echo "gcloud not found, skipping (firebase deploy enables most services by itself)."
fi

say "4/5 Install the backend"
(cd functions && npm install --no-audit --no-fund && npm run build)

say "5/5 Deploy rules, indexes and functions"
if ! $FB deploy --project "$PROJECT" --only firestore,functions --force; then
  echo
  echo "Deploy failed. The most common reason is that the project is not on the Blaze plan:"
  echo "  Firebase console > your project > Upgrade (bottom left) > Blaze, then run ./deploy.sh again."
  exit 1
fi

cat <<EOF

All done.

  Webhook URL   : https://us-central1-${PROJECT}.cloudfunctions.net/whatsappWebhook
  Verify token  : ${VERIFY}

Meta dashboard > WhatsApp > Configuration > Webhook: paste both values and subscribe to "messages".
Then open the app, sign up, and enter your WhatsApp details.
EOF
