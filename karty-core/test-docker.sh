docker run -d --name test_browser_1 -p 9184:9222 --shm-size=1gb remote-browser:latest
sleep 5
curl http://127.0.0.1:9184/json/version
docker rm -f test_browser_1