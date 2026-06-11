import { createApp } from "./app.js";
import { createBullMqClipGenerationQueue } from "./jobs/clipGenerationQueue.js";
import { createBullMqMetricsSyncQueue } from "@streamos/queue";
import { createBullMqTranscriptionQueue } from "./jobs/transcriptionQueue.js";

const clipGenerationQueue = process.env.REDIS_URL
  ? createBullMqClipGenerationQueue()
  : undefined;
const metricsSyncQueue = process.env.REDIS_URL
  ? createBullMqMetricsSyncQueue()
  : undefined;
const transcriptionQueue = process.env.REDIS_URL
  ? createBullMqTranscriptionQueue()
  : undefined;

const app = createApp({
  clipGenerationQueue,
  metricsSyncQueue,
  transcriptionQueue,
});
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST || process.env.HOSTNAME || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`api-gateway listening on ${host}:${port}`);
});
