const fs = require('fs');
fetch("http://72.56.1.59:3001/json/list?token=KartyMustPassword")
  .then(r => r.text())
  .then(t => console.log(t.substring(0, 5000)))
  .catch(console.error);
