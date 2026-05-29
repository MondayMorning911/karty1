import fs from 'fs';
let content = fs.readFileSync('server/myhomePublisher.ts', 'utf-8');
content = content.replace(/\\`/g, '`');
fs.writeFileSync('server/myhomePublisher.ts', content);
