async function check() {
  const res = await fetch('http://72.56.1.59:3010/sessions?token=karty-secret-token');
  const text = await res.text();
  console.log(text.substring(0, 500));
}

check();
