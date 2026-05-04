#!/bin/bash

# Запускаем виртуальный экран
Xvfb :99 -screen 0 1280x800x24 -listen tcp &
sleep 1

# Оконный менеджер (чтобы окна браузера можно было двигать, хотя он будет на фулскрин)
fluxbox &
sleep 1

# Запускаем браузер
# Прокси прокинем через переменную PROXY, если есть
PROXY_ARGS=""
if [ ! -z "$PROXY" ]; then
  PROXY_ARGS="--proxy-server=$PROXY"
fi

chromium --no-sandbox \
         --disable-dev-shm-usage \
         --remote-debugging-port=9222 \
         --start-maximized \
         --window-position=0,0 \
         --window-size=1280,800 \
         $PROXY_ARGS &

sleep 2

# Запускаем VNC сервер (на порту 5900)
x11vnc -display :99 -forever -nopw -bg -quiet -listen localhost -xkb

# Запускаем noVNC трансляцию в WebSocket (на порту 6080)
websockify --web=/usr/share/novnc/ 6080 localhost:5900
