"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function CompleteRedirect() {
  const router = useRouter();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      router.replace("/dashboard");
      router.refresh();
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [router]);

  return null;
}
