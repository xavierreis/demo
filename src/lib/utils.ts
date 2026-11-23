export const pad3 = (n: number | null | undefined) => String(n ?? 0).padStart(3, "0").slice(-3);

export const photoLabel = (n: number) => (n === 0 ? "Sem número" : `Nº ${pad3(n)}`);

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatSize(bytes: number | null | undefined) {
  const b = bytes ?? 0;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1).replace(".", ",")} MB`;
  return `${Math.round(b / 1024)} KB`;
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", heic: "image/heic", heif: "image/heif", bmp: "image/bmp",
};

// O tipo é deduzido da extensão (como na versão original); se não for imagem, o servidor recusa.
export function mimeFromFile(file: File) {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return MIME[ext] ?? (file.type.startsWith("image/") ? file.type : "application/octet-stream");
}
