// Lists the Gemini models your API key can use for generateContent.
// Usage: node --env-file=.env.local scripts/models.mjs
const key = process.env.GEMINI_API_KEY;
if (!key) { console.log("GEMINI_API_KEY missing in .env.local"); process.exit(1); }
const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
const data = await res.json();
if (!res.ok) { console.log("Error", res.status, JSON.stringify(data).slice(0, 300)); process.exit(1); }
const list = (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"));
console.log(`${list.length} models support generateContent:\n`);
for (const m of list) console.log(m.name.replace("models/", ""));
