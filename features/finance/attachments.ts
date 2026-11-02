import { CLOUDFLARE_WORKER_URL, supabase } from '../../lib/supabase';
import { prepareUploadSource } from '../../utils/imageHelpers';

const ROUTE = `${CLOUDFLARE_WORKER_URL}/finance/attachments`;

/** Admin session token: finance photos are private and never use the shared worker key. */
async function authHeader(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Απαιτείται ενεργή συνεδρία διαχειριστή.');
  return `Bearer ${data.session.access_token}`;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body?.error) return String(body.error);
  } catch { /* not JSON */ }
  return `Αποτυχία (${response.status}).`;
}

/** Uploads a receipt photo (converted to a 2048px JPEG) and returns its private key. */
export async function uploadFinanceAttachment(file: File): Promise<string> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
    throw new Error('Επιτρέπονται μόνο φωτογραφίες παραστατικών.');
  }
  const jpeg = await prepareUploadSource(file);
  const response = await fetch(ROUTE, {
    method: 'POST',
    headers: { Authorization: await authHeader(), 'Content-Type': 'image/jpeg' },
    body: jpeg,
  });
  if (!response.ok) throw new Error(await readError(response));
  const { key } = await response.json();
  return key as string;
}

/** Object URL for viewing a private attachment; revoke it when done. */
export async function fetchFinanceAttachmentUrl(key: string): Promise<string> {
  const response = await fetch(`${ROUTE}/${encodeURIComponent(key)}`, { headers: { Authorization: await authHeader() } });
  if (!response.ok) throw new Error(await readError(response));
  return URL.createObjectURL(await response.blob());
}

export async function deleteFinanceAttachment(key: string): Promise<void> {
  const response = await fetch(`${ROUTE}/${encodeURIComponent(key)}`, { method: 'DELETE', headers: { Authorization: await authHeader() } });
  if (!response.ok && response.status !== 404) throw new Error(await readError(response));
}
