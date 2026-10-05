export type PhoneResult = { ok: true; digits: string } | { ok: false; reason: string };

/**
 * Turns whatever is in the sheet cell into WhatsApp format: digits only, with country code.
 * Handles "+92 300 1234567", "0300-1234567", "300 1234567", 923001234567 and Excel's 9.23e11.
 */
export function normalizePhone(raw: unknown, defaultCountryCode = '92'): PhoneResult {
  let s = String(raw ?? '').trim();
  if (!s) return { ok: false, reason: 'Phone number is empty' };

  // Excel sometimes turns long numbers into scientific notation.
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) s = BigInt(Math.round(Number(s))).toString();

  const hadPlus = s.startsWith('+');
  let d = s.replace(/\D/g, '');
  if (!d) return { ok: false, reason: 'Phone number has no digits' };

  if (hadPlus) {
    // already international
  } else if (d.startsWith('00')) {
    d = d.slice(2);
  } else if (d.startsWith('0')) {
    d = defaultCountryCode + d.slice(1);
  } else if (defaultCountryCode === '92' && d.length === 10 && d.startsWith('3')) {
    d = '92' + d;
  }

  if (d.length < 8 || d.length > 15) return { ok: false, reason: `"${s}" is not a valid phone number length` };
  return { ok: true, digits: d };
}
