import Link from "next/link";
import { AuthLayout } from "../_components/AuthLayout";

export default function VerifyEmailPage() {
  return (
    <AuthLayout
      description="Dein Account ist angelegt, aber die Email-Adresse ist noch nicht bestaetigt."
      footer={
        <Link className="text-signal-green hover:text-white" href="/auth/login">
          Zurueck zum Login
        </Link>
      }
      searchParams={{}}
      title="Email bestaetigen"
    >
      <div className="rounded-lg border border-signal-gold/30 bg-signal-gold/10 p-4 text-sm leading-6 text-signal-gold">
        Oeffne die StreamOS-Bestaetigungs-Email und klicke auf den Link. Danach
        wirst du automatisch ins Dashboard weitergeleitet.
      </div>
    </AuthLayout>
  );
}
