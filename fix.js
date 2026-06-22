const fs = require('fs');

let code = fs.readFileSync('server/skyvernOrchestrator.ts', 'utf8');

// The file has literal slash-backticks like \`
code = code.replace(/\\`/g, '`');
// Also we need to make sure ${ is not escaped if it shouldn't be
// But actually backticks without backslashes is all we need.

fs.writeFileSync('server/skyvernOrchestrator.ts', code);
