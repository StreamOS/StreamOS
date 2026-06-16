"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { AuthError } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createOptionalBrowserClient } from "@/lib/supabase/client";
import { getSupabaseSetupNotice } from "@/lib/supabase/messages";

const emailSchema = z.object({
  email: z.string().trim().email("Bitte gib eine gueltige Email-Adresse ein."),
});

const loginSchema = emailSchema.extend({
  password: z.string().min(8, "Das Passwort muss mindestens 8 Zeichen haben."),
});

const signupSchema = loginSchema.extend({
  displayName: z
    .string()
    .trim()
    .min(2, "Der Creator Name muss mindestens 2 Zeichen haben.")
    .max(80, "Der Creator Name darf maximal 80 Zeichen haben."),
});

const updatePasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Das Passwort muss mindestens 8 Zeichen haben."),
    passwordConfirmation: z.string().min(8, "Bitte bestaetige dein Passwort."),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: "Die beiden Passwoerter stimmen nicht ueberein.",
    path: ["passwordConfirmation"],
  });

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;
type ResetPasswordValues = z.infer<typeof emailSchema>;
type UpdatePasswordValues = z.infer<typeof updatePasswordSchema>;

function getCurrentOrigin() {
  return window.location.origin;
}

function getSafeClientNextPath(value: string, fallback = "/dashboard") {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

function getAuthErrorMessage(error: AuthError) {
  if (error.code === "email_not_confirmed") {
    return "Bitte bestaetige zuerst deine Email-Adresse.";
  }

  if (error.status === 400) {
    return "Die eingegebenen Zugangsdaten sind ungueltig.";
  }

  return error.message || "Auth-Anfrage fehlgeschlagen.";
}

export function LoginForm({ next = "/dashboard" }: { next?: string }) {
  const router = useRouter();
  const supabase = useMemo(createOptionalBrowserClient, []);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    defaultValues: { email: "", password: "" },
    resolver: zodResolver(loginSchema),
  });
  const isSubmitting = form.formState.isSubmitting;

  if (!supabase) {
    return <SupabaseUnavailableNotice />;
  }

  const authClient = supabase;

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    const { error } = await authClient.auth.signInWithPassword({
      email: values.email.toLowerCase(),
      password: values.password,
    });

    if (error) {
      setFormError(getAuthErrorMessage(error));
      return;
    }

    router.replace(getSafeClientNextPath(next, "/dashboard"));
    router.refresh();
  }

  async function signInWithGoogle() {
    setFormError(null);
    const redirectTo = `${getCurrentOrigin()}/auth/callback?next=${encodeURIComponent(
      getSafeClientNextPath(next, "/dashboard"),
    )}`;
    const { error } = await authClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      setFormError(getAuthErrorMessage(error));
    }
  }

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <TextField
        autoComplete="email"
        error={form.formState.errors.email?.message}
        label="Email"
        register={form.register("email")}
        type="email"
      />
      <TextField
        autoComplete="current-password"
        error={form.formState.errors.password?.message}
        label="Passwort"
        register={form.register("password")}
        type="password"
      />
      <FormError message={formError} />
      <button className="btn-primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Login laeuft..." : "Einloggen"}
      </button>
      <button
        className="btn-ghost"
        disabled={isSubmitting}
        onClick={signInWithGoogle}
        type="button"
      >
        Mit Google fortfahren
      </button>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const supabase = useMemo(createOptionalBrowserClient, []);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const form = useForm<SignupValues>({
    defaultValues: { displayName: "", email: "", password: "" },
    resolver: zodResolver(signupSchema),
  });
  const isSubmitting = form.formState.isSubmitting;

  if (!supabase) {
    return <SupabaseUnavailableNotice />;
  }

  const authClient = supabase;

  async function onSubmit(values: SignupValues) {
    setFormError(null);
    setSuccess(null);
    const { error } = await authClient.auth.signUp({
      email: values.email.toLowerCase(),
      password: values.password,
      options: {
        emailRedirectTo: `${getCurrentOrigin()}/auth/confirm`,
        data: {
          name: values.displayName,
        },
      },
    });

    if (error) {
      setFormError(getAuthErrorMessage(error));
      return;
    }

    await authClient.auth.signOut();
    setSuccess("Account erstellt. Bitte bestaetige deine Email-Adresse.");
    form.reset();
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <TextField
        autoComplete="name"
        error={form.formState.errors.displayName?.message}
        label="Creator Name"
        register={form.register("displayName")}
      />
      <TextField
        autoComplete="email"
        error={form.formState.errors.email?.message}
        label="Email"
        register={form.register("email")}
        type="email"
      />
      <TextField
        autoComplete="new-password"
        error={form.formState.errors.password?.message}
        label="Passwort"
        register={form.register("password")}
        type="password"
      />
      <FormError message={formError} />
      <FormSuccess message={success} />
      <button className="btn-primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Account wird erstellt..." : "Account erstellen"}
      </button>
    </form>
  );
}

export function ResetPasswordForm() {
  const supabase = useMemo(createOptionalBrowserClient, []);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const form = useForm<ResetPasswordValues>({
    defaultValues: { email: "" },
    resolver: zodResolver(emailSchema),
  });
  const isSubmitting = form.formState.isSubmitting;

  if (!supabase) {
    return <SupabaseUnavailableNotice />;
  }

  const authClient = supabase;

  async function onSubmit(values: ResetPasswordValues) {
    setFormError(null);
    setSuccess(null);
    const { error } = await authClient.auth.resetPasswordForEmail(
      values.email.toLowerCase(),
      {
        redirectTo: `${getCurrentOrigin()}/auth/callback?next=/auth/update-password`,
      },
    );

    if (error) {
      setFormError(getAuthErrorMessage(error));
      return;
    }

    setSuccess("Wenn ein Account existiert, wurde eine Reset-Email gesendet.");
    form.reset();
  }

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <TextField
        autoComplete="email"
        error={form.formState.errors.email?.message}
        label="Email"
        register={form.register("email")}
        type="email"
      />
      <FormError message={formError} />
      <FormSuccess message={success} />
      <button className="btn-primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Email wird gesendet..." : "Reset-Link senden"}
      </button>
    </form>
  );
}

export function UpdatePasswordForm() {
  const router = useRouter();
  const supabase = useMemo(createOptionalBrowserClient, []);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<UpdatePasswordValues>({
    defaultValues: { password: "", passwordConfirmation: "" },
    resolver: zodResolver(updatePasswordSchema),
  });
  const isSubmitting = form.formState.isSubmitting;

  if (!supabase) {
    return <SupabaseUnavailableNotice />;
  }

  const authClient = supabase;

  async function onSubmit(values: UpdatePasswordValues) {
    setFormError(null);
    const { error } = await authClient.auth.updateUser({
      password: values.password,
    });

    if (error) {
      setFormError(getAuthErrorMessage(error));
      return;
    }

    await authClient.auth.signOut();
    router.replace("/auth/login?message=password-updated");
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <TextField
        autoComplete="new-password"
        error={form.formState.errors.password?.message}
        label="Neues Passwort"
        register={form.register("password")}
        type="password"
      />
      <TextField
        autoComplete="new-password"
        error={form.formState.errors.passwordConfirmation?.message}
        label="Passwort bestaetigen"
        register={form.register("passwordConfirmation")}
        type="password"
      />
      <FormError message={formError} />
      <button className="btn-primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Passwort wird gespeichert..." : "Passwort speichern"}
      </button>
    </form>
  );
}

function SupabaseUnavailableNotice() {
  return (
    <div
      className="rounded-lg border border-signal-gold/30 bg-signal-gold/10 p-4 text-sm text-signal-gold"
      role="alert"
    >
      {getSupabaseSetupNotice("du dich in dieser Umgebung anmelden kannst")}
    </div>
  );
}

function TextField({
  autoComplete,
  error,
  label,
  register,
  type = "text",
}: {
  autoComplete?: string;
  error?: string;
  label: string;
  register: ReturnType<typeof useForm>["register"] extends (
    name: never,
  ) => infer Return
    ? Return
    : never;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-300">
      {label}
      <input
        {...register}
        autoComplete={autoComplete}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-signal-green"
        type={type}
      />
      {error ? <span className="text-xs text-signal-red">{error}</span> : null}
    </label>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-3 text-sm text-signal-red">
      {message}
    </div>
  );
}

function FormSuccess({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="rounded-lg border border-signal-green/30 bg-signal-green/10 p-3 text-sm text-signal-green">
      {message}{" "}
      <Link className="font-semibold text-white" href="/auth/login">
        Zum Login
      </Link>
    </div>
  );
}
