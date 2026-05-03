const f = async () => {
    try {
      const res = await fetch("http://72.56.1.59:3001/sessions?token=KartyMustPassword");
      const text = await res.text();
      console.log("Sessions API response:", text);
    } catch(e) {
      console.error(e);
    }
  }
  f();
