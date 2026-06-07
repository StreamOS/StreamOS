import {
  AuthLayout,
  type AuthPageSearchParams,
} from "../_components/AuthLayout";
import { UpdatePasswordForm } from "../_components/AuthForms";

type UpdatePasswordPageProps = {
  searchParams: Promise<AuthPageSearchParams>;
};

export default async function UpdatePasswordPage({
  searchParams,
}: UpdatePasswordPageProps) {
  const params = await searchParams;

  return (
    <AuthLayout
      description="Lege nach dem Reset-Link ein neues Passwort fuer deinen StreamOS Workspace fest."
      searchParams={params}
      title="Neues Passwort"
    >
      <UpdatePasswordForm />
    </AuthLayout>
  );
}
