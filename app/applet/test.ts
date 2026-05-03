export async function test() {
  try {
    const res = await fetch("http://72.56.1.59:3001/json/list?token=KartyMustPassword");
    console.log(await res.text());
  } catch(e) {
    console.error(e);
  }
}
test();
