const http = require('http');

http.get('http://72.56.1.59:3010/', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
}).on('error', (err) => console.error(err));
