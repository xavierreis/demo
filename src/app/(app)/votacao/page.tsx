import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { plural } from "@/lib/utils";
import { StatusTag } from "@/components/ui";

type Overview = { category_id: number; label: string; photo_count: number; my_votes: number; status: string };

export default async function VotingPage() {
  const supabase = await createClient();
  const [{ data: rows }, { data: finalStatus }] = await Promise.all([
    supabase.rpc("get_voting_overview"),
    supabase.rpc("get_final_status"),
  ]);
  const fs = (finalStatus as string) ?? "por_iniciar";
  return (
    <>
      <div className="page-head">
        <h1>Votação</h1>
        <Link href="/fotografias" className="btn btn-sm">As minhas fotografias</Link>
      </div>
      <p className="intro">Atribui pontos às fotografias de cada categoria: 5 pontos à que mais gostas, até 1 ponto à que gostas menos.</p>
      <div className="stack">
        {((rows as Overview[]) ?? []).map((r) => (
          <div className="card" key={r.category_id}>
            <div className="row-between">
              <span className="card-title">{r.label}</span>
              <StatusTag status={r.status} />
            </div>
            <div className="muted">{plural(r.photo_count, "fotografia", "fotografias")}</div>
            <div className="row" style={{ marginTop: 10 }}>
              {r.status === "por_iniciar" && <span className="muted">A votação ainda não começou.</span>}
              {r.status !== "por_iniciar" && (
                <>
                  <span className="muted">{r.my_votes}/5 pontuações atribuídas</span>
                  <Link href={`/votacao/${r.category_id}`} className={`btn ${r.status === "a_decorrer" ? "btn-primary" : ""}`}>
                    {r.status === "a_decorrer" ? "Votar" : "Ver os meus votos"}
                  </Link>
                </>
              )}
            </div>
          </div>
        ))}
        <div className="card">
          <div className="row-between">
            <span className="card-title">Prémio final</span>
            <StatusTag status={fs} />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            {fs === "por_iniciar" ? (
              <span className="muted">A votação ainda não começou.</span>
            ) : (
              <Link href="/premio-final" className={`btn ${fs === "a_decorrer" ? "btn-primary" : ""}`}>
                {fs === "a_decorrer" ? "Votar" : "Ver a minha escolha"}
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
