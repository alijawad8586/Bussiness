/** Fills {{1}}, {{2}} ... of a WhatsApp template with values. */
export const renderBody = (body: string, params: string[]) => body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] || '…');
