"use server";

import type { Inserts, Updates } from "@streamos/database";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseBrandKitAssetId, parseBrandKitFormData } from "./brand-kit";
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
    .select("id")
    .eq("id", parsed.id)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (loadError) {
    redirect("/dashboard/branding?error=brand-kit-load-failed");
  }

  if (!existing) {
    redirect("/dashboard/branding?error=brand-kit-not-found");
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
