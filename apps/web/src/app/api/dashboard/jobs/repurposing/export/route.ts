import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import {
  buildApprovedRepurposingExportBundle,
  buildRepurposingExportTemplateText,
  getDefaultRepurposingExportSelection,
  getRepurposingExportEligibility,
  type ContentJobRow,
  type RepurposingExportSelection,
} from "@/components/modules/RepurposingReviewConsole.utils";
import {
  getRepurposingExportEventLabel,
  getRepurposingExportTemplateLabel,
  repurposingExportAuditFormSchema,
  type RepurposingExportAuditFormValues,
  type RepurposingExportEventRow,
} from "@/app/dashboard/jobs/repurposing/review";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ExportAuditResponse = {
  bundle_hash: string;
  event: RepurposingExportEventRow;
  status: "export_audited";
};

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return jsonError(
      "supabase_not_configured",
      "Supabase is not configured for export auditing.",
      503,
    );
  }

  const parsedBody = await parseExportAuditRequest(request);
  if (!parsedBody) {
    return jsonError(
      "invalid_export_payload",
      "The export payload could not be parsed.",
      400,
    );
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return jsonError(
      "unauthorized",
      "An authenticated Supabase session is required.",
      401,
    );
  }

  const job = await loadRepurposingJob({
    supabase,
    jobId: parsedBody.jobId,
    userId: userData.user.id,
  });

  if (!job) {
    return jsonError(
      "export_job_not_found",
      "The repurposing job was not found for the active user.",
      404,
    );
  }

  const eligibility = getRepurposingExportEligibility(job);
  if (!eligibility.eligible) {
    return jsonError(
      "export_not_eligible",
      eligibility.reason ?? "The selected job cannot be exported.",
      409,
    );
  }

  if (!isAllowedTemplateJob(parsedBody)) {
    return jsonError(
      "export_template_not_allowed",
      "The requested export template is not allowed for this job.",
      400,
    );
  }

  const exportSelection = normalizeExportSelection(parsedBody.selection);
  const bundleText = buildExportText(job, parsedBody, exportSelection);
  if (!bundleText) {
    return jsonError(
      "export_bundle_unavailable",
      "An export bundle could not be assembled from the approved result.",
      409,
    );
  }

  const bundleHash = createHash("sha256")
    .update(bundleText, "utf8")
    .digest("hex");
  const metadata = buildExportMetadata(parsedBody, exportSelection, bundleText);
  const exportEventsTable = supabase.from(
    "content_job_export_events",
  ) as unknown as {
    insert(values: {
      actor_id: string;
      bundle_hash: string | null;
      content_job_id: string;
      event_type: RepurposingExportAuditFormValues["eventType"];
      metadata: ReturnType<typeof buildExportMetadata>;
      review_status_at_export: ContentJobRow["review_status"];
      source: string;
      target_platform: RepurposingExportAuditFormValues["targetPlatform"];
      template_key: RepurposingExportAuditFormValues["templateKey"];
      user_id: string;
    }): {
      select(columns?: string): {
        single(): Promise<{
          data: RepurposingExportEventRow | null;
          error: unknown | null;
        }>;
      };
    };
  };

  const { data: event, error: insertError } = await exportEventsTable
    .insert({
      actor_id: userData.user.id,
      bundle_hash: bundleHash,
      content_job_id: job.id,
      event_type: parsedBody.eventType,
      metadata,
      review_status_at_export: job.review_status,
      source: "repurposing-review-console",
      target_platform: parsedBody.targetPlatform,
      template_key: parsedBody.templateKey,
      user_id: userData.user.id,
    })
    .select("*")
    .single();

  if (insertError || !event) {
    return jsonError(
      "export_audit_failed",
      "The export audit could not be stored.",
      500,
    );
  }

  return NextResponse.json<ExportAuditResponse>(
    {
      bundle_hash: bundleHash,
      event: event as RepurposingExportEventRow,
      status: "export_audited",
    },
    { status: 200 },
  );
}

async function parseExportAuditRequest(request: NextRequest): Promise<
  | (RepurposingExportAuditFormValues & {
      selection?: Partial<RepurposingExportSelection>;
    })
  | null
> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = repurposingExportAuditFormSchema.safeParse(body);

    if (!parsed.success) {
      return null;
    }

    return {
      ...parsed.data,
      selection: isRecord(body.selection)
        ? parseSelection(body.selection)
        : undefined,
    };
  } catch {
    return null;
  }
}

async function loadRepurposingJob({
  jobId,
  supabase,
  userId,
}: {
  jobId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}): Promise<ContentJobRow | null> {
  const { data, error } = await supabase
    .from("content_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .eq("job_type", "repurposing")
    .eq("type", "repurposing")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ContentJobRow;
}

function buildExportText(
  job: ContentJobRow,
  input: RepurposingExportAuditFormValues & {
    selection?: Partial<RepurposingExportSelection>;
  },
  selection: RepurposingExportSelection,
): string {
  if (input.templateKey === "bundle") {
    return buildApprovedRepurposingExportBundle(job, selection);
  }

  return buildRepurposingExportTemplateText(job, input.templateKey, selection);
}

function normalizeExportSelection(
  selection: Partial<RepurposingExportSelection> | undefined,
): RepurposingExportSelection {
  if (!selection) {
    return getDefaultRepurposingExportSelection(null);
  }

  return {
    captionIndex: selection.captionIndex ?? 0,
    descriptionIndex: selection.descriptionIndex ?? 0,
    hashtagSetIndex: selection.hashtagSetIndex ?? 0,
    hookIdeaIndex: selection.hookIdeaIndex ?? 0,
    targetPlatformIndex: selection.targetPlatformIndex ?? 0,
    titleSuggestionIndex: selection.titleSuggestionIndex ?? 0,
  };
}

function buildExportMetadata(
  input: RepurposingExportAuditFormValues,
  selection: RepurposingExportSelection,
  bundleText: string,
) {
  return {
    bundle_length: bundleText.length,
    event_label: getRepurposingExportEventLabel(input.eventType),
    selection,
    template_label: getRepurposingExportTemplateLabel(input.templateKey),
    target_platform: input.targetPlatform,
  };
}

function isAllowedTemplateJob(
  input: RepurposingExportAuditFormValues,
): boolean {
  if (input.templateKey === "bundle") {
    return true;
  }

  return input.templateKey === input.targetPlatform;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseSelection(
  value: Record<string, unknown>,
): Partial<RepurposingExportSelection> {
  return {
    captionIndex: parseIndex(value.captionIndex),
    descriptionIndex: parseIndex(value.descriptionIndex),
    hashtagSetIndex: parseIndex(value.hashtagSetIndex),
    hookIdeaIndex: parseIndex(value.hookIdeaIndex),
    targetPlatformIndex: parseIndex(value.targetPlatformIndex),
    titleSuggestionIndex: parseIndex(value.titleSuggestionIndex),
  };
}

function parseIndex(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  return undefined;
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      code,
      error: message,
    },
    { status },
  );
}
