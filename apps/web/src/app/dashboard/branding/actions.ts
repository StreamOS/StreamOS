"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Inserts, Updates } from "@streamos/database";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { parseBrandKitAssetId, parseBrandKitFormData } from "./brand-kit";

const BRANDING_PATH = "/dashboard/branding";

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
    .select("id")
    .eq("id", parsed.id)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (loadError) {
    redirect(`${BRANDING_PATH}?error=brand-kit-load-failed`);
  }

  if (!existing) {
    redirect(`${BRANDING_PATH}?error=brand-kit-not-found`);
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
