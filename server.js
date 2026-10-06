import "dotenv/config";
import express from "express";
import cors from "cors";
import { Queue } from "bullmq";
import crypto from "node:crypto";

const app = express();
const port = process.env.PORT || 8787;
const allowedOrigin = process.env.FRONTEND_ORIGIN || "*";

app.use(cors({ origin: allowedOrigin === "*" ? true : allowedOrigin }));
app.use(express.json({ limit: "20mb" }));

function redisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not configured.");
  return { url };
}

const lessonQueue = new Queue("aurevia-lessons", {
  connection: redisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400, count: 2000 }
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "aurevia-ai-backend", queue: "aurevia-lessons" });
});

app.post("/api/explain", async (req, res) => {
  try {
    const { topic = "", language = "English", mode = "detailed", file_data = null, file_name = "" } = req.body || {};
    if (!topic.trim() && !file_data) return res.status(400).json({ error: "Please provide a topic or file." });

    const jobId = crypto.randomUUID();
    await lessonQueue.add("generate-lesson", {
      topic: topic.trim(), language, mode, file_data, file_name,
      requestedAt: new Date().toISOString()
    }, { jobId });

    res.status(202).json({ jobId, status: "queued", message: "Your lesson is being prepared." });
  } catch (error) {
    console.error("[API] /api/explain queue error:", error);
    res.status(500).json({ error: "Could not queue the lesson. Please try again." });
  }
});

app.get("/api/jobs/:jobId", async (req, res) => {
  try {
    const job = await lessonQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ status: "not_found" });

    if (await job.isCompleted()) {
      return res.json({ status: "completed", result: job.returnvalue?.result ?? "", jobId: job.id });
    }
    if (await job.isFailed()) {
      return res.json({ status: "failed", error: "The lesson could not be generated. Please try again.", jobId: job.id });
    }

    const state = await job.getState();
    res.json({ status: state === "active" ? "processing" : "queued", jobId: job.id });
  } catch (error) {
    console.error("[API] job status error:", error);
    res.status(500).json({ error: "Could not read job status." });
  }
});

app.listen(port, () => console.log(`[API] AUREVIA backend listening on port ${port}`));