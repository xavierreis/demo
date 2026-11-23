import { getAuth } from "@/lib/auth";
import { NameForm } from "@/components/NameForm";
import { PasswordForm } from "@/components/AuthForms";

export default async function ProfilePage() {
  const auth = await getAuth();
  return (
    <div className="stack" style={{ maxWidth: 460 }}>
      <h1>O meu perfil</h1>
      <div className="card">
        <p className="muted">{auth?.email}</p>
        <NameForm initial={auth?.name ?? ""} />
      </div>
      <div className="card">
        <h2>Alterar palavra-passe</h2>
        <PasswordForm submitLabel="Alterar palavra-passe" />
      </div>
    </div>
  );
}
