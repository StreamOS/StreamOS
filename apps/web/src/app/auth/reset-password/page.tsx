import Link from "next/link";
import {
  AuthLayout,
  type AuthPageSearchParams,
} from "../_components/AuthLayout";
import { ResetPasswordForm } from "../_components/AuthForms";

type ResetPasswordPageProps = {
  searchParams: Promise<AuthPageSearchParams>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;

  return (
    <AuthLayout
      description="Sende dir einen Reset-Link per Email. Der Link fuehrt danach zur Passwort-Aktualisierung."
      footer={
        <>
          Zurueck zum{" "}
          <Link
            className="text-signal-green hover:text-white"
            href="/auth/login"
          >
            Login
          </Link>
        </>
      }
      searchParams={params}
      title="Passwort vergessen"
    >
      <ResetPasswordForm />
    </AuthLayout>
  );
}
