/** SQLite stores UTC without a suffix; imported backups may contain ISO dates. */
const formatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function formatNoteDate(timestamp: string): string {
  const normalized = timestamp.replace(" ", "T");
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? "" : formatter.format(date);
}
