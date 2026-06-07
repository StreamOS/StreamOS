import Link from "next/link";
import type { ReactNode } from "react";
import {
  authErrorMessages,
  authMessageMessages,
  normalizeAuthErrorCode,
  normalizeAuthMessageCode,
} from "@/lib/auth/errors";

export type AuthPageSearchParams = {
  error?: string;
  message?: string;
  next?: string;
};

type AuthLayoutProps = {
  children: ReactNode;
  description: string;
  footer?: ReactNode;
  searchParams: AuthPageSearchParams;
  title: string;
};

export function AuthLayout({
  children,
  description,
  footer,
  searchParams,
  title,
}: AuthLayoutProps) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link className="mb-8 flex items-center gap-3" href="/auth/login">
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

        <AuthStatus searchParams={searchParams} />

        <section className="card">
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
          <p className="mt-2 text-sm text-slate-400">{description}</p>
          <div className="mt-6">{children}</div>
          {footer ? (
            <div className="mt-5 text-sm text-slate-400">{footer}</div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function AuthStatus({ searchParams }: { searchParams: AuthPageSearchParams }) {
  const errorCode = searchParams.error
    ? normalizeAuthErrorCode(searchParams.error)
    : null;
  const messageCode = searchParams.message
    ? normalizeAuthMessageCode(searchParams.message)
    : null;

  if (!errorCode && !messageCode) {
    return null;
  }

  const isError = Boolean(errorCode);
  const copy = errorCode
    ? authErrorMessages[errorCode]
    : authMessageMessages[messageCode!];

  return (
    <div
      className={`mb-6 rounded-lg border p-4 text-sm ${
        isError
          ? "border-signal-red/30 bg-signal-red/10 text-signal-red"
          : "border-signal-green/30 bg-signal-green/10 text-signal-green"
      }`}
    >
      {copy}
    </div>
  );
}
