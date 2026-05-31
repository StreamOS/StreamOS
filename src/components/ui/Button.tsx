import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "ghost" | "danger";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    compact?: boolean;
  }
>;

export function Button({ variant = "primary", compact = false, className = "", children, ...props }: ButtonProps) {
  const variantClass = variant === "primary" ? "primary-button" : variant === "danger" ? "danger-button" : "ghost-button";
  const compactClass = compact ? " compact" : "";

  return (
    <button className={`${variantClass}${compactClass} ${className}`.trim()} type="button" {...props}>
      {children}
    </button>
  );
}
