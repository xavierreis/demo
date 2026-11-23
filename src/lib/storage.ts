import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTOS_BUCKET = "fotografias";
export const STATEMENTS_BUCKET = "enunciados";

// URLs assinados (1 h). O nome do ficheiro é o id da submissão, por isso não revela o autor.
export async function signedUrls(
  supabase: SupabaseClient,
  bucket: string,
  names: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (names.length === 0) return out;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(names, 3600);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  }
  return out;
}

export async function removeObjects(supabase: SupabaseClient, bucket: string, names: string[]) {
  for (let i = 0; i < names.length; i += 100) {
    await supabase.storage.from(bucket).remove(names.slice(i, i + 100));
  }
}
