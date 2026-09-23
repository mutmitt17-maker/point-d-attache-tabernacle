import { supabase } from './supabase';

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/**
 * Envoie une signature/preuve vers un bucket privé, sous le dossier de
 * l'utilisateur connecté (requis par les politiques Storage : voir migration
 * 20260923100001). Retourne le chemin stocké, à écrire ensuite via l'API RPC.
 */
export async function uploadDataUrl(bucket: 'signatures' | 'payment-proofs' | 'member-photos', dataUrl: string, filename: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id ?? 'anonymous';
  const path = `${uid}/${Date.now()}-${filename}`;
  const blob = dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function uploadFile(bucket: 'signatures' | 'payment-proofs' | 'member-photos', file: File): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id ?? 'anonymous';
  const path = `${uid}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}
