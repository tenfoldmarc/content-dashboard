#!/bin/bash
# Generate the random secrets that protect the dashboard's cron + worker routes.
# Prints three KEY=value lines ready to paste into .env.local / Vercel.
echo "CRON_SECRET=$(openssl rand -hex 32)"
echo "WORKER_SECRET=$(openssl rand -hex 32)"
echo "TRENDING_INGEST_SECRET=$(openssl rand -hex 32)"
