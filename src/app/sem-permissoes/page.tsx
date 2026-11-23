import Link from "next/link";
import { signOut } from "@/lib/actions";
import { getAuth } from "@/lib/auth";

export default async function NoPermissionsPage() {
  const auth = await getAuth();
  return (
    <div className="auth">
      <h1>Sem permissões</h1>
      <div className="card">
        <p>Não tens permissão para abrir este ecrã.</p>
        {auth?.isParticipant ? (
          <Link href="/fotografias" className="btn btn-primary btn-block">Voltar às minhas fotografias</Link>
        ) : (
          <form action={signOut}><button className="btn btn-primary btn-block">Terminar sessão</button></form>
        )}
      </div>
    </div>
  );
}
