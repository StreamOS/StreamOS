import "server-only";

import { randomUUID } from "node:crypto";
import {
  dispatchStreamOSJob as enqueueStreamOSJob,
  type StreamOSJob,
  type StreamOSJobType,
  type StreamProvider,
} from "@streamos/queue";

export type { StreamOSJob, StreamOSJobType, StreamProvider };

type StreamOSJobInput = Omit<StreamOSJob, "id" | "receivedAt"> &
  Partial<Pick<StreamOSJob, "id" | "receivedAt">>;

export async function dispatchStreamOSJob(
  payload: StreamOSJobInput,
): Promise<StreamOSJob> {
  const receivedAt = payload.receivedAt ?? new Date().toISOString();
  const id =
    payload.id ??
    [
      payload.provider,
      payload.type,
      payload.channelId,
      payload.streamId ?? payload.videoId ?? randomUUID(),
    ].join(":");

  const job: StreamOSJob = {
    ...payload,
    id,
    receivedAt,
  };

  return enqueueStreamOSJob(job);
}
