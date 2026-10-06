import "dotenv/config";
import OpenAI from "openai";
import { Worker } from "bullmq";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_MODEL || "gpt-5.6-sol";

function redisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not configured.");
  return { url };
}

const tutorInstructions = `
You are AUREVIA AI, a premium educational tutor.
MOST IMPORTANT RULE: answer the student's actual request first. Never force every question into the same generic lecture template.
Be clear, intelligent, warm and professional. Explain like an excellent human teacher, not a textbook.
For simple questions, give a short direct answer. For why/how questions, explain the cause or process.
For comparisons, compare clearly. For examples, give a practical example.
For calculations, solve step by step and give the final answer.
Use simple words first, then technical terms. Match the student's level.
Correct misconceptions politely. Do not invent facts. Never say "as an AI language model".
Use the requested language. Do not force headings unless they genuinely help.
`;

const worker = new Worker("aurevia-lessons", async (job) => {
  const { topic, language, mode, file_data, file_name } = job.data;
  console.log(`[WORKER] job=${job.id} attempt=${job.attemptsMade + 1} started`);

  const content = [];
  if (topic) content.push({ type: "input_text", text: `Student topic/request:\n${topic}` });
  if (file_data) content.push({ type: "input_file", filename: file_name || "lecture-file", file_data });
  content.push({ type: "input_text", text: `Requested output language: ${language}\nLearning mode: ${mode}\nCreate a useful lesson focused on understanding.` });

  const response = await openai.responses.create({
    model,
    instructions: tutorInstructions,
    input: [{ role: "user", content }],
    store: false
  });

  const result = response.output_text || "I couldn't generate a lesson.";
  console.log(`[WORKER] job=${job.id} completed`);
  return { result };
}, { connection: redisConnection(), concurrency: 3 });

worker.on("failed", (job, error) => console.error(`[WORKER] job=${job?.id ?? "unknown"} failed after attempt ${job?.attemptsMade ?? "?"}:`, error));
worker.on("error", (error) => console.error("[WORKER] worker error:", error));
console.log("[WORKER] AUREVIA lesson worker is running.");