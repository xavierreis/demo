import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pad3 } from "@/lib/utils";
import { Pager } from "@/components/Pager";

type S = { submission_id: string; person_name: string; category_label: string; file_name: string; content_type: string; photo_number: number };
const LIMIT = 10;

export default async function PhotosListPage({ searchParams }: { searchParams: Promise<{ q?: string; offset?: string }> }) {
  const sp = await searchParams;
  const offset = Math.max(0, Number(sp.offset) || 0);
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_submissions", { p_search: sp.q ?? "", p_offset: offset, p_limit: LIMIT });
  const res = (data as { total: number; rows: S[] } | null) ?? { total: 0, rows: [] };
  return (
    <div className="stack">
      <div className="page-head"><h1>Fotografias</h1><Link href="/admin/submissoes" className="btn btn-sm">Administração</Link></div>
      <form className="row" method="get">
        <input type="search" name="q" placeholder="Pesquisar por nome do ficheiro" defaultValue={sp.q ?? ""} style={{ flex: 1, minWidth: 200 }} />
        <button className="btn btn-primary">Pesquisar</button>
      </form>
      {res.rows.length === 0 ? <div className="state">Sem fotografias.</div> : (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>Utilizador</th><th>Categoria</th><th>Nº</th><th>Ficheiro</th><th>Tipo</th></tr></thead>
            <tbody>
              {res.rows.map((s) => (
                <tr key={s.submission_id}>
                  <td><Link href={`/admin/fotografias/${s.submission_id}`}>{s.person_name}</Link></td>
                  <td>{s.category_label}</td><td>{s.photo_number === 0 ? "—" : pad3(s.photo_number)}</td><td>{s.file_name}</td><td>{s.content_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager base="/admin/fotografias" params={{ q: sp.q }} offset={offset} limit={LIMIT} total={res.total} />
    </div>
  );
}
