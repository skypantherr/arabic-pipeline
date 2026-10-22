const B = "https://arabic-pipeline.arabic-pipeline.workers.dev";
const t0 = Date.now();
const ac = new AbortController();
const to = setTimeout(() => ac.abort(), 200000);
try {
  const r = await fetch(B + "/text/normalize", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({text:"مرحبا بالعالم"}), signal: ac.signal });
  const hdr = r.headers.get("PAYMENT-REQUIRED");
  console.log("status:", r.status, "| ms:", Date.now()-t0, "| PAYMENT-REQUIRED:", !!hdr);
  console.log("body:", (await r.text()).slice(0,600));
  if (hdr) console.log("CHALLENGE:", JSON.stringify(JSON.parse(Buffer.from(hdr,"base64").toString("utf8")), null, 1));
} catch(e) { console.log("ERR after ms:", Date.now()-t0, String(e).slice(0,150)); }
clearTimeout(to);
