#!/bin/bash

set -e

echo "==> Creazione rete Docker (se non esiste)..."
docker network inspect pwa-voice-assistant-net >/dev/null 2>&1 || \
    docker network create pwa-voice-assistant-net

echo "==> Build dell'immagine..."
docker build -t pwa-voice-assistant-image -f server/Dockerfile .

echo "==> Rimozione eventuale container esistente..."
docker rm -f pwa-voice-assistant >/dev/null 2>&1 || true

echo "==> Avvio del container..."
docker run -d \
  --name pwa-voice-assistant \
  -p 8765:8765 \
  -p 10400:10400 \
  -v "$(pwd)/server/config.yaml:/app/server/config.yaml" \
  -v "$(pwd)/server/logs:/app/server/logs" \
  -v "$(pwd)/client/cert.pem:/app/client/cert.pem" \
  -v "$(pwd)/client/key.pem:/app/client/key.pem" \
  --restart unless-stopped \
  --network pwa-voice-assistant-net \
  pwa-voice-assistant-image
echo "==> Container avviato correttamente!"
docker ps | grep pwa-voice-assistant