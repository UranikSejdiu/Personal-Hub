/** Parse complete decimal amounts and consistently grouped US/European numbers. */
export function parseNumberInput(input: string, decimals = 2): number | null {
  let text = input.trim().replace(/[\u00a0\u202f]/g, " ");
  if (text === "") return 0;
  const negative = text.startsWith("-");
  if (negative) text = text.slice(1);
  if (!text || !/^[\d., ]+$/.test(text)) return null;

  const dots = (text.match(/\./g) ?? []).length;
  const commas = (text.match(/,/g) ?? []).length;
  let decimal = "";
  if (dots && commas) decimal = text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
  else if (dots + commas === 1) {
    const separator = dots ? "." : ",";
    const fractionLength = text.length - text.lastIndexOf(separator) - 1;
    // A single three-digit group is a thousands group for money/integer fields.
    if (!(fractionLength === 3 && decimals < 3 && /^[1-9]\d{0,2}$/.test(text.slice(0, text.lastIndexOf(separator))))) decimal = separator;
  }

  const split = decimal ? text.lastIndexOf(decimal) : text.length;
  const integer = text.slice(0, split);
  const fraction = decimal ? text.slice(split + 1) : "";
  if (fraction.length > decimals || !/^\d*$/.test(fraction)) return null;
  if (!/^\d+$/.test(integer) && !/^\d{1,3}([., ])\d{3}(?:\1\d{3})*$/.test(integer)) {
    if (!(integer === "" && decimal && fraction.length > 0)) return null;
  }
  // A separator cannot be both the decimal separator and a grouping separator.
  if (decimal && integer.includes(decimal)) return null;
  const normalized = `${negative ? "-" : ""}${integer.replace(/[., ]/g, "") || "0"}${decimal ? `.${fraction}` : ""}`;
  const value = Number(normalized);
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER / 10 ** decimals ? value : null;
}
