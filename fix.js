import fs from 'fs';
let content = fs.readFileSync('server/realtingPublisher.ts', 'utf-8');
content = content.replace(/\\`/g, '`');
fs.writeFileSync('server/realtingPublisher.ts', content);
