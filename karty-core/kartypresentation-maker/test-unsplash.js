async function run() {
  const res = await fetch("https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=1000");
  console.log(res.status, res.headers.get('content-type'));
}
run();
