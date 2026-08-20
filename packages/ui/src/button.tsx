import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { buttonClassName } from "./humanize";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={cn(buttonClassName(variant, size, block), className)} {...props}>
      {children}
    </button>
  );
}
