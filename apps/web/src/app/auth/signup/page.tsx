import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AuthLayout,
  type AuthPageSearchParams,
} from "../_components/AuthLayout";
import { SignupForm } from "../_components/AuthForms";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type SignupPageProps = {
  searchParams: Promise<AuthPageSearchParams>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();

    if (data.user) {
      redirect("/dashboard");
    }
  }

  return (
    <AuthLayout
      description="Erstelle deinen Account. Der erste Login ist erst nach Email-Bestaetigung vorgesehen."
      footer={
        <>
          Schon registriert?{" "}
          <Link
            className="text-signal-green hover:text-white"
            href="/auth/login"
          >
            Einloggen
          </Link>
        </>
      }
      searchParams={params}
      title="Signup"
    >
      <SignupForm />
    </AuthLayout>
  );
}
