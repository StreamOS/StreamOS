"use server";

import { randomUUID } from "node:crypto";
import type { Inserts } from "@streamos/database";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  BRAND_ASSET_STORAGE_BUCKET,
  buildBrandingAssetStoragePath,
  parseBrandingAssetUploadFormData,
} from "./storage";

const BRANDING_PATH = "/dashboard/branding";

export async function uploadBrandAssetAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(`${BRANDING_PATH}?error=supabase-not-configured`);
  }

  const parsed = parseBrandingAssetUploadFormData(formData, randomUUID);

  if (!parsed.ok) {
    redirect(`${BRANDING_PATH}?error=${parsed.error}`);
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const storagePath = buildBrandingAssetStoragePath({
    assetId: parsed.values.assetId,
    assetType: parsed.values.assetType,
    filename: parsed.values.storedFilename,
    userId: userData.user.id,
  });

  const uploadResult = await supabase.storage
    .from(BRAND_ASSET_STORAGE_BUCKET)
    .upload(storagePath, parsed.values.file, {
      contentType: parsed.values.file.type,
      upsert: false,
    });

  if (uploadResult.error) {
    redirect(`${BRANDING_PATH}?error=brand-asset-upload-failed`);
  }

  const payload: Inserts<"brand_assets"> = {
    asset_type: parsed.values.assetType,
    config: {},
    description: parsed.values.description,
    metadata: {
      upload: {
        content_type: parsed.values.file.type,
        file_extension: parsed.values.fileExtension,
        file_size_bytes: parsed.values.file.size,
        stored_filename: parsed.values.storedFilename,
      },
    },
    name: parsed.values.name,
    public_url: null,
    status: "draft",
    storage_bucket: BRAND_ASSET_STORAGE_BUCKET,
    storage_path: storagePath,
    user_id: userData.user.id,
  };

  const insertResult = await supabase
    .from("brand_assets")
    .insert(payload as never);

  if (insertResult.error) {
    await supabase.storage
      .from(BRAND_ASSET_STORAGE_BUCKET)
      .remove([storagePath]);
    redirect(`${BRANDING_PATH}?error=brand-asset-persist-failed`);
  }

  revalidatePath(BRANDING_PATH);
  redirect(`${BRANDING_PATH}?status=brand-asset-uploaded`);
}
