// Seeds hidden qualification (gold) tasks: questions with one objectively correct answer.
// New workers answer these first; their accuracy per language and skill is measured, never self-declared.
//   ADMIN_TOKEN=... SCRAPPY_API=http://localhost:8787 bun scripts/seed-gold.ts
const API = process.env.SCRAPPY_API ?? "http://localhost:8787";
const token = process.env.ADMIN_TOKEN;
if (!token) throw new Error("ADMIN_TOKEN is required");

type G = { task: string; content?: string; language: string; skill?: string; answer: string; options?: string[] };
const yesNo = { type: "binary" } as const;
const GOLD: G[] = [
  { language: "en", task: "Is this sentence grammatically correct?", content: "She don't like coffee.", answer: "no" },
  { language: "en", task: "Is this statement true?", content: "Water boils at 100 °C at sea level.", answer: "yes" },
  { language: "en", task: "Which reply answers the customer's question?", content: "Customer: When will my order arrive?", options: ["It ships within 2 days and arrives in 3-5 days.", "Thanks for choosing us!"], answer: "It ships within 2 days and arrives in 3-5 days." },
  { language: "en", skill: "security", task: "Does this code store the password in plain text?", content: "db.users.insert({ email, password: req.body.password })", answer: "yes" },
  { language: "en", skill: "security", task: "Is this SQL query safe from injection?", content: "db.query('SELECT * FROM users WHERE id = ?', [id])", answer: "yes" },
  { language: "hi", task: "क्या यह वाक्य व्याकरण की दृष्टि से सही है?", content: "मैं कल बाज़ार गया था।", answer: "yes" },
  { language: "hi", task: "क्या यह कथन सही है?", content: "भारत की राजधानी मुंबई है।", answer: "no" },
  { language: "hi", task: "कौन सा अनुवाद 'Thank you for waiting' का सही अर्थ देता है?", options: ["इंतज़ार करने के लिए धन्यवाद", "जल्दी करने के लिए धन्यवाद"], answer: "इंतज़ार करने के लिए धन्यवाद" },
  { language: "te", task: "ఈ వాక్యం సరైనదేనా?", content: "హైదరాబాద్ తెలంగాణ రాజధాని.", answer: "yes" },
  { language: "te", task: "'Your refund will be processed tomorrow' కి సరైన అనువాదం ఏది?", options: ["మీ రీఫండ్ రేపు ప్రాసెస్ చేయబడుతుంది", "మీ ఆర్డర్ ఈరోజు రద్దు చేయబడింది"], answer: "మీ రీఫండ్ రేపు ప్రాసెస్ చేయబడుతుంది" },
  { language: "ta", task: "இந்த வாக்கியம் சரியானதா?", content: "சென்னை தமிழ்நாட்டின் தலைநகரம்.", answer: "yes" },
  { language: "ta", task: "இந்த கூற்று உண்மையா?", content: "சூரியன் மேற்கில் உதிக்கிறது.", answer: "no" },
];

for (const g of GOLD) {
  const res = await fetch(`${API}/v1/admin/gold`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": token },
    body: JSON.stringify({
      task: g.task, content: g.content, language: g.language, skill: g.skill ?? "general", answer: g.answer,
      response_schema: g.options ? { type: "choice", options: g.options } : yesNo,
    }),
  });
  console.log(res.status, g.language, g.task.slice(0, 50));
}
export {};
