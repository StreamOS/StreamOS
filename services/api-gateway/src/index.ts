import { createApp } from "./app.js";
import { createBullMqClipGenerationQueue } from "./jobs/clipGenerationQueue.js";
import { readApiGatewayRuntimeProvenance } from "./runtimeProvenance.js";

const clipGenerationQueue = process.env.REDIS_URL
  ? createBullMqClipGenerationQueue()
  : undefined;
const runtimeProvenance = readApiGatewayRuntimeProvenance();

const app = createApp({ clipGenerationQueue, runtimeProvenance });
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST?.trim() || "0.0.0.0";

const server = app.listen(port, host, () => {
  console.log(`api-gateway listening on ${host}:${port}`);
});

let isShuttingDown = false;

function closeServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function closeQueue(
  name: string,
  queue:
    | {
        close?(): Promise<void>;
      }
    | undefined,
): Promise<void> {
  if (!queue?.close) {
    return;
  }

  await queue.close();
  console.log(`${name} closed`);
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`received ${signal}; shutting down api-gateway`);

  const results = await Promise.allSettled([
    closeServer(),
    closeQueue("clip-generation queue", clipGenerationQueue),
  ]);
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error("api-gateway shutdown step failed", failure.reason);
    }

    process.exit(1);
    return;
  }

  process.exit(0);
}

process.once("SIGINT", (signal) => void shutdown(signal));
process.once("SIGTERM", (signal) => void shutdown(signal));
