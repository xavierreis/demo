import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pad3 } from "@/lib/utils";
import { Pager } from "@/components/Pager";

type V = { vote_id: number; voter_name: string; photo_number: number; category_label: string; score: number };
const LIMIT = 10;
const COLS = [["voter", "Votante"], ["photo", "Fotografia"], ["category", "Categoria"], ["score", "Pontuação"]] as const;

export default async function VotesPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; desc?: string; offset?: string }> }) {
  const sp = await searchParams;
  const offset = Math.max(0, Number(sp.offset) || 0);
  const sort = COLS.some(([k]) => k === sp.sort) ? sp.sort! : "voter";
  const desc = sp.desc === "1";
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_votes", { p_search: sp.q ?? "", p_offset: offset, p_limit: LIMIT, p_sort: sort, p_desc: desc });
  const res = (data as { total: number; rows: V[] } | null) ?? { total: 0, rows: [] };
  const sortHref = (col: string) => `/admin/votos?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), sort: col, ...(sort === col && !desc ? { desc: "1" } : {}) })}`;
  return (
    <div className="stack">
      <div className="page-head"><h1>Votos</h1><Link href="/admin/votos/novo" className="btn btn-primary btn-sm">Adicionar voto</Link></div>
      <form className="row" method="get">
        <input type="search" name="q" placeholder="Pesquisar por votante" defaultValue={sp.q ?? ""} style={{ flex: 1, minWidth: 200 }} />
        <button className="btn btn-primary">Pesquisar</button>
      </form>
      {res.rows.length === 0 ? <div className="state">Sem votos.</div> : (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr>{COLS.map(([k, l]) => <th key={k} className={k === "score" ? "num" : ""}><Link href={sortHref(k)}>{l}{sort === k ? (desc ? " ↓" : " ↑") : ""}</Link></th>)}</tr></thead>
            <tbody>
              {res.rows.map((v) => (
                <tr key={v.vote_id}>
                  <td><Link href={`/admin/votos/${v.vote_id}`}>{v.voter_name}</Link></td>
                  <td>{v.photo_number === 0 ? "—" : pad3(v.photo_number)}</td><td>{v.category_label}</td><td className="num">{v.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager base="/admin/votos" params={{ q: sp.q, sort: sp.sort, desc: sp.desc }} offset={offset} limit={LIMIT} total={res.total} />
    </div>
  );
}
