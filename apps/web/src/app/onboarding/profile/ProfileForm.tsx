"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { CreatorPrimaryLanguage } from "@streamos/types";
import { createOrUpdateCreatorProfileAction } from "../actions";
import { primaryLanguageOptions, type OnboardingActionState } from "../types";

type ProfileFormProps = {
  defaultValues: {
    avatarUrl: string;
    bio: string;
    displayName: string;
    primaryLanguage: CreatorPrimaryLanguage;
  };
};

const initialState: OnboardingActionState = {};

export function ProfileForm({ defaultValues }: ProfileFormProps) {
  const [state, formAction] = useActionState(
    createOrUpdateCreatorProfileAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-5">
      <TextField
        autoComplete="name"
        defaultValue={defaultValues.displayName}
        error={state.fieldErrors?.displayName}
        label="Display Name"
        name="displayName"
        required
      />

      <TextField
        defaultValue={defaultValues.avatarUrl}
        error={state.fieldErrors?.avatarUrl}
        label="Avatar URL"
        name="avatarUrl"
        placeholder="https://..."
        type="url"
      />

      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Bio
        <textarea
          className="min-h-28 resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green"
          defaultValue={defaultValues.bio}
          maxLength={280}
          name="bio"
          placeholder="Kurzprofil fuer deinen Creator Workspace"
        />
        <span className="text-xs font-medium text-slate-500">
          Optional, maximal 280 Zeichen.
        </span>
        {state.fieldErrors?.bio ? (
          <span className="text-xs text-signal-red">
            {state.fieldErrors.bio}
          </span>
        ) : null}
      </label>

      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Primaere Sprache
        <select
          className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-sm font-medium text-white outline-none transition focus:border-signal-green"
          defaultValue={defaultValues.primaryLanguage}
          name="primaryLanguage"
        >
          {primaryLanguageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {state.fieldErrors?.primaryLanguage ? (
          <span className="text-xs text-signal-red">
            {state.fieldErrors.primaryLanguage}
          </span>
        ) : null}
      </label>

      {state.formError ? (
        <div className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-3 text-sm text-signal-red">
          {state.formError}
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function TextField({
  autoComplete,
  defaultValue,
  error,
  label,
  name,
  placeholder,
  required = false,
  type = "text",
}: {
  autoComplete?: string;
  defaultValue: string;
  error?: string;
  label: string;
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
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green"
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
      {error ? <span className="text-xs text-signal-red">{error}</span> : null}
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="btn-primary w-full sm:w-auto"
      disabled={pending}
      type="submit"
    >
      {pending ? "Profil wird gespeichert..." : "Profil speichern"}
    </button>
  );
}
