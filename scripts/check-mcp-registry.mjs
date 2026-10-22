const r = await fetch("https://registry.modelcontextprotocol.io/v0/servers?search=arabic-pipeline&limit=5");
const j = await r.json();
console.log("count:", j.servers?.length, "| meta:", JSON.stringify(j.metadata));
(j.servers||[]).forEach(s=>console.log("  ", s.server.name, "|", s.server.remotes?.[0]?.url, "|", s._meta?.["io.modelcontextprotocol.registry/official"]?.status));
