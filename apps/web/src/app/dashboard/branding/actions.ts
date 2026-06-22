"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Inserts, Tables, Updates } from "@streamos/database";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  BRAND_ASSETS_STORAGE_BUCKET,
  buildBrandAssetStoragePath,
  parseBrandAssetUploadFormData,
} from "./brand-asset-storage";
import { parseBrandKitAssetId, parseBrandKitFormData } from "./brand-kit";

const BRANDING_PATH = "/dashboard/branding";
type BrandAssetDeleteStorageRef = Pick<
  Tables<"brand_assets">,
  "id" | "storage_bucket" | "storage_path"
>;

export async function createBrandKitAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(`${BRANDING_PATH}?error=supabase-not-configured`);
  }

  const parsed = parseBrandKitFormData(formData);

  if (!parsed.ok) {
    redirect(`${BRANDING_PATH}?error=${parsed.error}`);
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const payload: Inserts<"brand_assets"> = {
    asset_type: parsed.values.assetType,
    config: parsed.values.config,
    description: parsed.values.description,
    name: parsed.values.name,
    status: parsed.values.status,
    user_id: userData.user.id,
  };

  const { error } = await supabase
    .from("brand_assets")
    .insert(payload as never);

  if (error) {
    redirect(`${BRANDING_PATH}?error=brand-kit-create-failed`);
  }

  revalidatePath(BRANDING_PATH);
  redirect(`${BRANDING_PATH}?status=brand-kit-created`);
}

export async function uploadBrandAssetFileAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(`${BRANDING_PATH}?error=supabase-not-configured`);
  }

  const parsed = parseBrandAssetUploadFormData(formData, randomUUID);

  if (!parsed.ok) {
    redirect(`${BRANDING_PATH}?error=${parsed.error}`);
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const storagePath = buildBrandAssetStoragePath({
    assetId: parsed.values.assetId,
    assetType: parsed.values.assetType,
    filename: parsed.values.sanitizedFilename,
    userId: userData.user.id,
  });

  const uploadResult = await supabase.storage
    .from(BRAND_ASSETS_STORAGE_BUCKET)
    .upload(storagePath, parsed.values.file, {
      contentType: parsed.values.file.type,
      upsert: false,
    });

  if (uploadResult.error) {
    redirect(`${BRANDING_PATH}?error=brand-asset-upload-failed`);
  }

  const payload: Inserts<"brand_assets"> = {
    asset_type: parsed.values.assetType,
    config: parsed.values.config,
    description: parsed.values.description,
    id: parsed.values.assetId,
    name: parsed.values.name,
    public_url: null,
    status: parsed.values.status,
    storage_bucket: BRAND_ASSETS_STORAGE_BUCKET,
    storage_path: storagePath,
    user_id: userData.user.id,
  };

  const { error } = await supabase
    .from("brand_assets")
    .insert(payload as never);

  if (error) {
    await supabase.storage
      .from(BRAND_ASSETS_STORAGE_BUCKET)
      .remove([storagePath]);
    redirect(`${BRANDING_PATH}?error=brand-asset-upload-failed`);
  }

  revalidatePath(BRANDING_PATH);
  redirect(`${BRANDING_PATH}?status=brand-asset-uploaded`);
}

export async function updateBrandKitAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(`${BRANDING_PATH}?error=supabase-not-configured`);
  }

  const parsed = parseBrandKitFormData(formData);

  if (!parsed.ok || !parsed.values.id) {
    redirect(`${BRANDING_PATH}?error=invalid-brand-kit-form`);
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data: existing, error: loadError } = await supabase
    .from("brand_assets")
    .select("id")
    .eq("id", parsed.values.id)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (loadError) {
    redirect(`${BRANDING_PATH}?error=brand-kit-load-failed`);
  }

  if (!existing) {
    redirect(`${BRANDING_PATH}?error=brand-kit-not-found`);
  }

  const payload: Updates<"brand_assets"> = {
    asset_type: parsed.values.assetType,
    config: parsed.values.config,
    description: parsed.values.description,
    name: parsed.values.name,
    status: parsed.values.status,
  };

  const { error } = await supabase
    .from("brand_assets")
    .update(payload as never)
    .eq("id", parsed.values.id)
    .eq("user_id", userData.user.id);

  if (error) {
    redirect(`${BRANDING_PATH}?error=brand-kit-update-failed`);
  }

  revalidatePath(BRANDING_PATH);
  redirect(`${BRANDING_PATH}?status=brand-kit-updated`);
}

export async function deleteBrandKitAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(`${BRANDING_PATH}?error=supabase-not-configured`);
  }

  const parsed = parseBrandKitAssetId(formData);

  if (!parsed.ok) {
    redirect(`${BRANDING_PATH}?error=invalid-brand-kit-form`);
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data: existing, error: loadError } = await supabase
    .from("brand_assets")
    .select("id, storage_bucket, storage_path")
    .eq("id", parsed.id)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (loadError) {
    redirect(`${BRANDING_PATH}?error=brand-kit-load-failed`);
  }

  if (!existing) {
    redirect(`${BRANDING_PATH}?error=brand-kit-not-found`);
  }

  const existingAsset = existing as BrandAssetDeleteStorageRef;

  if (existingAsset.storage_bucket && existingAsset.storage_path) {
    const { error: storageError } = await supabase.storage
      .from(existingAsset.storage_bucket)
      .remove([existingAsset.storage_path]);

    if (storageError) {
      redirect(`${BRANDING_PATH}?error=brand-asset-storage-delete-failed`);
    }
  }

  const { error } = await supabase
    .from("brand_assets")
    .delete()
    .eq("id", parsed.id)
    .eq("user_id", userData.user.id);

  if (error) {
    redirect(`${BRANDING_PATH}?error=brand-kit-delete-failed`);
  }

  revalidatePath(BRANDING_PATH);
  redirect(`${BRANDING_PATH}?status=brand-kit-deleted`);
}
