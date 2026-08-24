import { writeFileSync } from 'fs';
fetch("http://72.56.1.59:3001/sessions?token=KartyMustPassword")
  .then(r => r.json())
  .then(r => {
      console.log(JSON.stringify(r, null, 2));
      writeFileSync("sessions-dump.json", JSON.stringify(r, null, 2));
  })
  .catch(console.error);
