import { z } from "zod";

import type { PublicationExecutionJobPayload } from "@streamos/types/jobs";

export const PUBLICATION_QUEUE_NAME = "streamos-publishing";
export const PUBLICATION_EXECUTION_JOB_NAME = "publication.publish";
export const PUBLICATION_RECONCILE_JOB_NAME = "publication.reconcile";

const publicationTargets = ["youtube", "tiktok"] as const;

export const publicationExecutionJobDataSchema = z.object({
  content_publication_id: z.string().uuid(),
  target_platform: z.enum(publicationTargets),
  user_id: z.string().uuid(),
}) satisfies z.ZodType<PublicationExecutionJobPayload>;

export const publicationReconciliationJobDataSchema =
  publicationExecutionJobDataSchema;
