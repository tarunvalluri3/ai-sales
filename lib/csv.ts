import "server-only";

/** RFC 4180-ish CSV quoting: only quotes a field that actually needs it (contains a comma, quote, or newline), doubling any embedded quotes. */
function escapeCsvField(value: string | number | boolean | null): string {
  if (value === null) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Builds a CSV string (CRLF line endings, per RFC 4180) from a header row and data rows. Used for every dashboard CSV export -- keep formatting consistent across features rather than each caller hand-rolling its own. */
export function toCsv(headers: string[], rows: (string | number | boolean | null)[][]): string {
  const lines = [headers.map(escapeCsvField).join(","), ...rows.map((row) => row.map(escapeCsvField).join(","))];
  return lines.join("\r\n");
}
