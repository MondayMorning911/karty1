const https = require('https');
https.get('https://staticmap.openstreetmap.de/staticmap.php?center=41.642,41.611', (res) => {
  console.log(res.headers);
});
