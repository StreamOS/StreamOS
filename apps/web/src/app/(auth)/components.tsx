import Link from "next/link";
import type { ReactNode } from "react";
import {
  authErrorMessages,
  authMessageMessages,
  normalizeAuthErrorCode,
  normalizeAuthMessageCode,
} from "@/lib/auth/errors";

export type AuthSearchParams = {
  error?: string;
  message?: string;
  next?: string;
};

type AuthShellProps = {
  children: ReactNode;
  description: string;
  searchParams: AuthSearchParams;
  title: string;
};

export function AuthShell({
  children,
  description,
  searchParams,
  title,
}: AuthShellProps) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Link className="flex items-center gap-3" href="/login">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-signal-green font-black text-white">
              S
            </div>
            <div>
              <div className="text-2xl font-semibold text-white">StreamOS</div>
              <div className="text-sm text-slate-400">
                Creator Operating System
              </div>
            </div>
          </Link>
        </div>

        <StatusMessage searchParams={searchParams} />

        <section className="card">
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
          <p className="mt-2 text-sm text-slate-400">{description}</p>
          <div className="mt-6">{children}</div>
        </section>
      </div>
    </main>
  );
}

export function SupabaseSetupNotice() {
  return (
    <div className="mb-6 rounded-lg border border-signal-gold/30 bg-signal-gold/10 p-4 text-sm text-signal-gold">
      Supabase ist lokal noch nicht konfiguriert. Fuellen Sie
      `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
      `apps/web/.env.local`, dann sind Login und Dashboard-Schutz aktiv.
    </div>
  );
}

export function AuthTextInput({
  autoComplete,
  label,
  minLength,
  name,
  placeholder,
  required = true,
  type = "text",
}: {
  autoComplete?: string;
  label: string;
  minLength?: number;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-300">
      {label}
      <input
        autoComplete={autoComplete}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-signal-green"
        minLength={minLength}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}

function StatusMessage({ searchParams }: { searchParams: AuthSearchParams }) {
  const errorCode = searchParams.error
    ? normalizeAuthErrorCode(searchParams.error)
    : null;
  const messageCode = searchParams.message
    ? normalizeAuthMessageCode(searchParams.message)
    : null;

  if (!errorCode && !messageCode) {
    return null;
  }

  const color = errorCode
    ? "border-signal-red/30 bg-signal-red/10 text-signal-red"
    : "border-signal-green/30 bg-signal-green/10 text-signal-green";
  const copy = errorCode
    ? authErrorMessages[errorCode]
    : authMessageMessages[messageCode!];

  return (
    <div className={`mb-6 rounded-lg border p-4 text-sm ${color}`}>{copy}</div>
  );
}
