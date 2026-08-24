#!/bin/bash
set -e

apt-get update -qq
apt-get install -y -qq python3-pip xvfb python3-venv > /dev/null 2>&1

python3 -m venv /root/karty-lab/venv
source /root/karty-lab/venv/bin/activate

pip install camoufox[geoip] playwright browser-use openai xvfbwrapper > /dev/null 2>&1

python -m camoufox fetch
playwright install chromium --with-deps

mkdir -p logs/screenshots selectors
echo "Installation complete."
