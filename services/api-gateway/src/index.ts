import { createApp } from "./app.js";
import { createBullMqClipGenerationQueue } from "./jobs/clipGenerationQueue.js";
import { createBullMqTranscriptionQueue } from "./jobs/transcriptionQueue.js";

const clipGenerationQueue = process.env.REDIS_URL
  ? createBullMqClipGenerationQueue()
  : undefined;
const transcriptionQueue = process.env.REDIS_URL
  ? createBullMqTranscriptionQueue()
  : undefined;

const app = createApp({ clipGenerationQueue, transcriptionQueue });
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`api-gateway listening on ${port}`);
});
