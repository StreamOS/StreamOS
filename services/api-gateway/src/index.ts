import { createApp } from "./app.js";
import { createBullMqClipGenerationQueue } from "./jobs/clipGenerationQueue.js";

const clipGenerationQueue = process.env.REDIS_URL
  ? createBullMqClipGenerationQueue()
  : undefined;

const app = createApp({ clipGenerationQueue });
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST || process.env.HOSTNAME || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`api-gateway listening on ${host}:${port}`);
});
