import Link from "next/link";

// Paginação por parâmetros de URL (mantém os restantes filtros).
export function Pager({ base, params, offset, limit, total }: { base: string; params: Record<string, string | undefined>; offset: number; limit: number; total: number }) {
  const href = (o: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (o > 0) q.set("offset", String(o));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  if (total <= limit) return null;
  return (
    <div className="pager">
      {offset > 0 ? <Link className="btn btn-sm" href={href(Math.max(0, offset - limit))}>‹ Anterior</Link> : <span />}
      <span className="muted">{offset + 1}–{Math.min(offset + limit, total)} de {total}</span>
      {offset + limit < total ? <Link className="btn btn-sm" href={href(offset + limit)}>Seguinte ›</Link> : <span />}
    </div>
  );
}
