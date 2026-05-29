import fs from 'fs';
let content = fs.readFileSync('server/ssgePublisher.ts', 'utf-8');
content = content.replace(/\\`/g, '`');
fs.writeFileSync('server/ssgePublisher.ts', content);
