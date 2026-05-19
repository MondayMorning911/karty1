import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxyUrl = 'http://d0e326028eb23797:vh6bDxAKJj7XUsSq@141.98.54.148:10000';
const agent = new HttpsProxyAgent(proxyUrl);

console.log("Testing proxy...");
https.get('https://korter.ge/ru', { agent }, (res) => {
  console.log('StatusCode:', res.statusCode);
  res.on('data', (d) => process.stdout.write(d.slice(0, 100)));
}).on('error', (e) => {
  console.error("Proxy error:", e);
});
