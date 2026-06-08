import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AuthLayout,
  type AuthPageSearchParams,
} from "../_components/AuthLayout";
import { LoginForm } from "../_components/AuthForms";
import { getSafeNextPath } from "@/lib/auth/redirects";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<AuthPageSearchParams>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = getSafeNextPath(params.next ?? null, "/dashboard");

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();

    if (data.user) {
      redirect(next);
    }
  }

  return (
    <AuthLayout
      description="Melde dich mit Email und Passwort in deinem Creator Workspace an."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            className="text-signal-green hover:text-white"
            href="/auth/signup"
          >
            Account erstellen
          </Link>
          <Link
            className="text-slate-300 hover:text-white"
            href="/auth/reset-password"
          >
            Passwort vergessen?
          </Link>
        </div>
      }
      searchParams={params}
      title="Login"
    >
      <LoginForm next={next} />
    </AuthLayout>
  );
}
