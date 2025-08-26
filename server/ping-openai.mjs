import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

try {
  const r = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 5
  });
  console.log("OK:", r.choices[0].message);
} catch (err) {
  console.log("FAILED");
  console.log("status:", err.status);
  console.log("code  :", err.code);
  console.log("type  :", err.type);
  console.log("msg   :", err.message);
}
	0

