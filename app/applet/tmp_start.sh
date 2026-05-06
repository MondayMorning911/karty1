#!/bin/bash
Xvfb :99 -screen 0 1280x800x24 -listen tcp &
sleep 1
fluxbox &
sleep 1

PROXY_ARGS=""
if [ ! -z "$PROXY" ]; then
  PROXY_ARGS="--proxy-server=$PROXY"
fi

CHROME_BIN=$(find /ms-playwright -type f \( -name chrome -o -name chromium -o -name browser \) | grep -v 'ms-playwright/webkit' | grep -v 'ms-playwright/firefox' | head -n 1)

if [ -z "$CHROME_BIN" ]; then
  CHROME_BIN="chromium"
fi

echo "Using Chrome Binary: $CHROME_BIN"

$CHROME_BIN --no-sandbox \
         --disable-dev-shm-usage \
         --disable-gpu \
         --user-data-dir=/tmp/chromium-data \
         --remote-debugging-port=9222 \
         --remote-debugging-address=0.0.0.0 \
         --remote-allow-origins=* \
         --start-maximized \
         --window-position=0,0 \
         --window-size=1280,800 \
         $PROXY_ARGS > /tmp/chrome.log 2>&1 &

sleep 2
echo "Chrome log output:"
cat /tmp/chrome.log

x11vnc -display :99 -forever -nopw -bg -quiet -listen localhost -xkb &
websockify --web=/usr/share/novnc/ 6080 localhost:5900
