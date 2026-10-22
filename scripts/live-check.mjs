const B = "https://arabic-pipeline.arabic-pipeline.workers.dev";
const show = async (p, opts) => {
  try {
    const r = await fetch(B + p, opts);
    const t = await r.text();
    console.log("---", p, "=>", r.status);
    console.log(t.slice(0, 800));
    return { r, t };
  } catch (e) { console.log("---", p, "=> ERR", String(e).slice(0,200)); return null; }
};
await show("/");
await show("/health");
const r = await fetch(B + "/text/normalize", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({text:"مرحبا بالعالم"}) });
const hdr = r.headers.get("PAYMENT-REQUIRED");
console.log("--- 402 status:", r.status, "| PAYMENT-REQUIRED header present:", !!hdr);
if (hdr) console.log("CHALLENGE:", JSON.stringify(JSON.parse(Buffer.from(hdr,"base64").toString("utf8")), null, 1));
