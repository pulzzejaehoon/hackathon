import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
  // 선택: OpenRouter 권장 헤더(통계/출처용). 없어도 동작함.
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "ai-agent-saas-dev"
  }
});

// 무료로 자주 열려있는 모델 예시(필요시 다른 모델로 교체 가능)
const MODEL = "mistralai/mistral-7b-instruct:free";

try {
  const r = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 20
  });
  console.log("OK:", r.choices[0].message);
} catch (err) {
  console.log("FAILED");
  console.log("status:", err.status);
  console.log("code  :", err.code);
  console.log("type  :", err.type);
  console.log("msg   :", err.message);
}
