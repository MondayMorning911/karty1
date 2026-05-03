// dump.ts
async function dump() {
  const res = await fetch("http://72.56.1.59:3001/sessions?token=KartyMustPassword");
  const data = await res.json();
  console.log("DATA:");
  console.log(JSON.stringify(data, null, 2));
}
dump();
