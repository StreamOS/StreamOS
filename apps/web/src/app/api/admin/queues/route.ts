import { getStreamJobQueue } from "@streamos/queue";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getBearerToken(value: string | null): string | null {
  if (!value?.startsWith("Bearer ")) {
    return null;
  }

  return value.slice("Bearer ".length);
}

async function isAuthorized(): Promise<boolean> {
  const adminSecret = process.env.ADMIN_SECRET?.trim();

  if (!adminSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const requestHeaders = await headers();
  const receivedSecret =
    requestHeaders.get("x-admin-secret") ??
    getBearerToken(requestHeaders.get("authorization"));

  return receivedSecret === adminSecret;
}

export async function GET(): Promise<NextResponse> {
  if (!(await isAuthorized())) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const queue = getStreamJobQueue();
    const [counts, jobs] = await Promise.all([
      queue.getJobCounts(
        "active",
        "completed",
        "delayed",
        "failed",
        "paused",
        "prioritized",
        "waiting",
        "waiting-children",
      ),
      queue.getJobs(["active", "waiting", "delayed", "failed"], 0, 25, false),
    ]);

    return NextResponse.json({
      queue: queue.name,
      counts,
      jobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        data: job.data,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Queue status lookup failed.";

    return NextResponse.json(
      {
        error: "queue_status_unavailable",
        message,
      },
      { status: 503 },
    );
  }
}
