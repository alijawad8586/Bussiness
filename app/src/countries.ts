export interface Country { code: string; name: string; flag: string }

/** Common countries for clinics. "Other" lets the user type any code. */
export const COUNTRIES: Country[] = [
  { code: '92', name: 'Pakistan', flag: '🇵🇰' },
  { code: '971', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: '966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '91', name: 'India', flag: '🇮🇳' },
  { code: '44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '1', name: 'USA / Canada', flag: '🇺🇸' },
  { code: '974', name: 'Qatar', flag: '🇶🇦' },
  { code: '968', name: 'Oman', flag: '🇴🇲' },
  { code: '965', name: 'Kuwait', flag: '🇰🇼' },
  { code: '973', name: 'Bahrain', flag: '🇧🇭' },
  { code: '880', name: 'Bangladesh', flag: '🇧🇩' },
  { code: '20', name: 'Egypt', flag: '🇪🇬' },
  { code: '90', name: 'Turkey', flag: '🇹🇷' },
  { code: '61', name: 'Australia', flag: '🇦🇺' },
];

/** Groups the digits the way people read them: 58 614 1832. Display only; the saved number is digits. */
export function groupDigits(national: string): string {
  const d = national.replace(/\D/g, '').replace(/^0+/, '').slice(0, 14);
  const parts: string[] = [];
  if (d.length > 0) parts.push(d.slice(0, d.length > 9 ? 3 : 2));
  let rest = d.slice(parts[0]?.length ?? 0);
  if (rest) parts.push(rest.slice(0, 3));
  rest = rest.slice(3);
  while (rest) { parts.push(rest.slice(0, 4)); rest = rest.slice(4); }
  return parts.join(' ');
}
