import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Constructing an Intl formatter is expensive; reuse one for every call.
const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "EUR",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

const HSL_RE = /hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/;

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const hex = Math.round(alpha * 255).toString(16).padStart(2, "0");
    return color + hex;
  }
  const match = HSL_RE.exec(color);
  if (match) {
    return `hsla(${match[1]}, ${match[2]}%, ${match[3]}%, ${alpha})`;
  }
  return color;
}
