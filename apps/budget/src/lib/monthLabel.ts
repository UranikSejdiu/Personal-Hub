const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(key: string, width: "short" | "long" = "long"): string {
  const month = Number(key.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return key;
  const name = MONTH_NAMES[month - 1];
  return `${width === "short" ? name.slice(0, 3) : name} ${key.slice(0, 4)}`;
}
