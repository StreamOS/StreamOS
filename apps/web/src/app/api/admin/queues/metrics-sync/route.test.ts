import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMetricsSyncQueue: vi.fn(),
  queue: {
    getJobCounts: vi.fn(),
    getJobs: vi.fn(),
    name: "streamos-metrics-sync",
  },
}));

vi.mock("@streamos/queue", () => ({
  DEFAULT_METRICS_SYNC_QUEUE_NAME: "streamos-metrics-sync",
  getMetricsSyncQueue: mocks.getMetricsSyncQueue,
}));

describe("GET /api/admin/queues/metrics-sync", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.getMetricsSyncQueue.mockReturnValue(mocks.queue);
    mocks.queue.getJobCounts.mockResolvedValue({
      active: 1,
      completed: 2,
      delayed: 0,
      failed: 1,
      paused: 0,
      prioritized: 0,
      "waiting-children": 0,
      waiting: 3,
    });
    mocks.queue.getJobs.mockResolvedValue([
      {
        attemptsMade: 2,
        data: {
          providers: ["twitch", "kick"],
          user_id: "11111111-1111-4111-8111-111111111111",
        },
        failedReason: null,
        finishedOn: 1_717_000_100_000,
        id: "metrics-sync-job-1",
        name: "metrics.sync",
        processedOn: 1_717_000_000_000,
        timestamp: 1_716_999_990_000,
      },
    ]);
  });

  it("returns queue counts and recent jobs", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      counts: {
        active: 1,
        completed: 2,
        delayed: 0,
        failed: 1,
        paused: 0,
        prioritized: 0,
        "waiting-children": 0,
        waiting: 3,
      },
      jobs: [
        {
          attemptsMade: 2,
          data: {
            providers: ["twitch", "kick"],
            user_id: "11111111-1111-4111-8111-111111111111",
          },
          failedReason: null,
          finishedOn: 1_717_000_100_000,
          id: "metrics-sync-job-1",
          name: "metrics.sync",
          processedOn: 1_717_000_000_000,
          timestamp: 1_716_999_990_000,
        },
      ],
      queue: "streamos-metrics-sync",
    });
    expect(mocks.getMetricsSyncQueue).toHaveBeenCalledTimes(1);
    expect(mocks.queue.getJobCounts).toHaveBeenCalledWith(
      "active",
      "completed",
      "delayed",
      "failed",
      "paused",
      "prioritized",
      "waiting",
      "waiting-children",
    );
    expect(mocks.queue.getJobs).toHaveBeenCalledWith(
      ["active", "waiting", "delayed", "failed"],
      0,
      25,
      false,
    );
  });
});
