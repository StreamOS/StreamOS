"use server";

import { randomUUID } from "node:crypto";
import type { Inserts, Updates } from "@streamos/database";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseBrandKitAssetId, parseBrandKitFormData } from "./brand-kit";
import {
  buildBrandAssetStoragePath,
  buildBrandAssetUploadMetadata,
  parseBrandAssetUploadFormData,
} from "./brand-asset-upload";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function createBrandKitAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/branding?error=supabase-not-configured");
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const parsed = parseBrandKitFormData(formData);

  if (!parsed.ok) {
    redirect(`/dashboard/branding?error=${parsed.error}`);
  }

  const payload: Inserts<"brand_assets"> = {
    asset_type: parsed.values.assetType,
    config: parsed.values.config,
    name: parsed.values.name,
    status: parsed.values.status,
    user_id: userData.user.id,
  };

  const { error } = await supabase
    .from("brand_assets")
    .insert(payload as never);

  if (error) {
    redirect("/dashboard/branding?error=brand-kit-create-failed");
  }

  revalidatePath("/dashboard/branding");
  redirect("/dashboard/branding?status=brand-kit-created");
}

export async function updateBrandKitAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/branding?error=supabase-not-configured");
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const parsed = parseBrandKitFormData(formData);

  if (!parsed.ok) {
    redirect(`/dashboard/branding?error=${parsed.error}`);
  }

  const assetId = parsed.values.id;

  if (!assetId) {
    redirect("/dashboard/branding?error=invalid-brand-kit-form");
  }

  const { data: existing, error: loadError } = await supabase
    .from("brand_assets")
    .select("id")
    .eq("id", assetId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (loadError) {
    redirect("/dashboard/branding?error=brand-kit-load-failed");
  }

  if (!existing) {
    redirect("/dashboard/branding?error=brand-kit-not-found");
  }

  const updatePayload: Updates<"brand_assets"> = {
    asset_type: parsed.values.assetType,
    config: parsed.values.config,
    name: parsed.values.name,
    status: parsed.values.status,
  };

  const { error } = await supabase
    .from("brand_assets")
    .update(updatePayload as never)
    .eq("id", assetId)
    .eq("user_id", userData.user.id);

  if (error) {
    redirect("/dashboard/branding?error=brand-kit-update-failed");
  }

  revalidatePath("/dashboard/branding");
  redirect("/dashboard/branding?status=brand-kit-updated");
}

export async function deleteBrandKitAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/branding?error=supabase-not-configured");
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const parsed = parseBrandKitAssetId(formData);

  if (!parsed.ok) {
    redirect("/dashboard/branding?error=invalid-brand-kit-form");
  }

  const { data: existing, error: loadError } = await supabase
    .from("brand_assets")
    .select("id,storage_bucket,storage_path")
    .eq("id", parsed.id)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (loadError) {
    redirect("/dashboard/branding?error=brand-kit-load-failed");
  }

  if (!existing) {
    redirect("/dashboard/branding?error=brand-kit-not-found");
  }

  const asset = existing as {
    id: string;
    storage_bucket: string | null;
    storage_path: string | null;
  };

  if (asset.storage_bucket && asset.storage_path) {
    const { error: storageDeleteError } = await supabase.storage
      .from(asset.storage_bucket)
      .remove([asset.storage_path]);

    if (storageDeleteError) {
      redirect("/dashboard/branding?error=brand-kit-storage-delete-failed");
    }
  }

  const { error } = await supabase
    .from("brand_assets")
    .delete()
    .eq("id", parsed.id)
    .eq("user_id", userData.user.id);

  if (error) {
    redirect("/dashboard/branding?error=brand-kit-delete-failed");
  }

  revalidatePath("/dashboard/branding");
  redirect("/dashboard/branding?status=brand-kit-deleted");
}

export async function uploadBrandAssetFileAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/branding?error=supabase-not-configured");
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const parsed = parseBrandAssetUploadFormData(formData);

  if (!parsed.ok) {
    redirect(`/dashboard/branding?error=${parsed.error}`);
  }

  const bucket = "brand-assets";
  const uploadId = randomUUID();
  const storagePath = buildBrandAssetStoragePath({
    assetType: parsed.values.assetType,
    fileName: parsed.values.file.name,
    uploadId,
    userId: userData.user.id,
  });

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, parsed.values.file, {
      contentType: parsed.values.file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    redirect("/dashboard/branding?error=brand-asset-upload-failed");
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  const payload: Inserts<"brand_assets"> = {
    asset_type: parsed.values.assetType,
    config: parsed.values.config,
    id: uploadId,
    metadata: buildBrandAssetUploadMetadata({
      assetType: parsed.values.assetType,
      file: parsed.values.file,
      storagePath,
    }),
    name: parsed.values.name,
    public_url: publicUrlData.publicUrl,
    status: parsed.values.status,
    storage_bucket: bucket,
    storage_path: storagePath,
    user_id: userData.user.id,
  };

  const { error: insertError } = await supabase
    .from("brand_assets")
    .insert(payload as never);

  if (insertError) {
    await supabase.storage.from(bucket).remove([storagePath]);
    redirect("/dashboard/branding?error=brand-asset-upload-failed");
  }

  revalidatePath("/dashboard/branding");
  redirect("/dashboard/branding?status=brand-asset-uploaded");
}
