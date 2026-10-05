export interface WaError {
  /** Meta error code, or 0 for network problems */
  code: number;
  message: string;
  httpStatus: number;
}

export type ErrorKind =
  | 'transient' // try again later (rate limit, outage, network)
  | 'not_on_whatsapp' // this number cannot receive WhatsApp messages
  | 'permanent' // this one message cannot be sent
  | 'template' // the template is wrong: stop the whole campaign
  | 'auth' // token invalid or expired: stop the whole campaign
  | 'window'; // free text outside the 24 hour window: needs a template

export interface Classified {
  kind: ErrorKind;
  code: number;
  message: string;
  /** plain-language advice shown in the app */
  hint: string;
}

/** Meta error codes: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes */
export function classifyWaError(e: WaError): Classified {
  const base = { code: e.code, message: e.message };
  const c = e.code;

  if (c === 190 || c === 102 || c === 10 || c === 200 || e.httpStatus === 401)
    return { ...base, kind: 'auth', hint: 'Your WhatsApp access token is invalid or expired. Reconnect WhatsApp in Settings.' };
  if (c === 131026)
    return { ...base, kind: 'not_on_whatsapp', hint: 'This number is not on WhatsApp or cannot receive messages.' };
  if (c === 131047 || c === 131051)
    return { ...base, kind: 'window', hint: 'More than 24 hours since the patient last wrote. Send an approved template instead.' };
  if (c === 131030)
    return { ...base, kind: 'permanent', hint: 'This number is not in the allowed test list of your WhatsApp app.' };
  if ([132000, 132001, 132005, 132007, 132012, 132015, 132016].includes(c))
    return { ...base, kind: 'template', hint: 'The template name, language or variables do not match an approved template.' };
  if (c === 131008 || c === 131009)
    return { ...base, kind: 'permanent', hint: 'A required value is missing or wrong in this row.' };
  if ([4, 613, 80007, 130429, 131056, 131048].includes(c))
    return { ...base, kind: 'transient', hint: 'WhatsApp rate limit reached. Retrying slowly.' };
  if (c === 0 || c === 1 || c === 2 || c === 131000 || c === 131016 || e.httpStatus >= 500 || e.httpStatus === 429)
    return { ...base, kind: 'transient', hint: 'WhatsApp is temporarily unavailable. Retrying.' };
  return { ...base, kind: 'permanent', hint: 'WhatsApp rejected this message.' };
}
