"use client";

import React from "react";
import { useFormStatus } from "react-dom";

export function BrandAssetUploadSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="btn-primary w-full sm:w-auto"
      disabled={pending}
      type="submit"
    >
      {pending ? "Upload laeuft..." : "Brand Asset hochladen"}
    </button>
  );
}
