"use server";

import { randomUUID } from "node:crypto";
import type { Inserts, Updates } from "@streamos/database";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  BRAND_ASSET_STORAGE_BUCKET,
  buildBrandingAssetReplacementStoragePath,
  buildBrandingAssetStoragePath,
  buildBrandingAssetUploadMetadata,
  mergeBrandingAssetMetadataWithUpload,
  parseBrandingAssetReplaceFormData,
  parseBrandingAssetUploadFormData,
} from "./storage";

const BRANDING_PATH = "/dashboard/branding";

export async function uploadBrandAssetAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(`${BRANDING_PATH}?error=supabase-not-configured`);
  }

  const parsed = await parseBrandingAssetUploadFormData(formData, randomUUID);

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

  const uploadMetadata = buildBrandingAssetUploadMetadata({
    file: parsed.values.file,
    fileExtension: parsed.values.fileExtension,
    storedFilename: parsed.values.storedFilename,
  });

  const payload: Inserts<"brand_assets"> = {
    asset_type: parsed.values.assetType,
    config: {},
    description: parsed.values.description,
    metadata: {
      upload: uploadMetadata,
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
    const cleanupResult = await supabase.storage
      .from(BRAND_ASSET_STORAGE_BUCKET)
      .remove([storagePath]);

    if (cleanupResult.error) {
      redirect(`${BRANDING_PATH}?error=brand-asset-cleanup-failed`);
    }

    redirect(`${BRANDING_PATH}?error=brand-asset-persist-failed`);
  }

  revalidatePath(BRANDING_PATH);
  redirect(`${BRANDING_PATH}?status=brand-asset-uploaded`);
}

export async function replaceBrandAssetAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(`${BRANDING_PATH}?error=supabase-not-configured`);
  }

  const parsed = await parseBrandingAssetReplaceFormData(formData);

  if (!parsed.ok) {
    redirect(`${BRANDING_PATH}?error=${parsed.error}`);
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const assetLookup = await supabase
    .from("brand_assets")
    .select("asset_type,metadata")
    .eq("id", parsed.values.assetId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (assetLookup.error || !assetLookup.data) {
    redirect(`${BRANDING_PATH}?error=brand-asset-replace-not-found`);
  }

  const storagePath = buildBrandingAssetReplacementStoragePath({
    assetId: parsed.values.assetId,
    assetType: assetLookup.data.asset_type,
    filename: parsed.values.storedFilename,
    replacementId: randomUUID(),
    userId: userData.user.id,
  });

  const uploadResult = await supabase.storage
    .from(BRAND_ASSET_STORAGE_BUCKET)
    .upload(storagePath, parsed.values.file, {
      contentType: parsed.values.file.type,
      upsert: false,
    });

  if (uploadResult.error) {
    redirect(`${BRANDING_PATH}?error=brand-asset-replace-upload-failed`);
  }

  const uploadMetadata = buildBrandingAssetUploadMetadata({
    file: parsed.values.file,
    fileExtension: parsed.values.fileExtension,
    storedFilename: parsed.values.storedFilename,
  });
  const payload: Updates<"brand_assets"> = {
    metadata: mergeBrandingAssetMetadataWithUpload(
      assetLookup.data.metadata,
      uploadMetadata,
    ) as Updates<"brand_assets">["metadata"],
    public_url: null,
    storage_bucket: BRAND_ASSET_STORAGE_BUCKET,
    storage_path: storagePath,
  };

  const updateResult = await supabase
    .from("brand_assets")
    .update(payload as never)
    .eq("id", parsed.values.assetId)
    .eq("user_id", userData.user.id)
    .select("id")
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    redirect(`${BRANDING_PATH}?error=brand-asset-replace-persist-failed`);
  }

  revalidatePath(BRANDING_PATH);
  redirect(`${BRANDING_PATH}?status=brand-asset-replaced`);
}
