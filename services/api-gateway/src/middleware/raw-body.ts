import express from "express";
import type { Express, Request } from "express";

export type RawBodyRequest = Request & {
  rawBody?: Buffer;
};

export function attachRawBodyMiddleware(app: Express): void {
  const parser = express.raw({
    limit: "1mb",
    type: "*/*",
    verify(request, _response, body) {
      (request as RawBodyRequest).rawBody = Buffer.from(body);
    },
  });

  app.use("/webhooks/twitch", parser);
  app.use("/webhooks/youtube", parser);
  app.use("/api/webhooks/twitch/eventsub", parser);
  app.use("/api/webhooks/youtube/websub", parser);
}

export function getRawBody(request: Request): Buffer | undefined {
  const rawBody = (request as RawBodyRequest).rawBody;

  if (rawBody) {
    return rawBody;
  }

  return Buffer.isBuffer(request.body) ? request.body : undefined;
}
