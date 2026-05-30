import fs from 'fs';
['server/ssgePublisher.ts', 'server/realtingPublisher.ts'].forEach(file => {
  let content = fs.readFileSync(file, 'utf-8');
  content = content.replace(/\\\${/g, '${');
  fs.writeFileSync(file, content);
});
