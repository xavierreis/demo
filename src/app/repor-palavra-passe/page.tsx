import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { PasswordForm } from "@/components/AuthForms";

export default async function ResetPage() {
  if (!(await getAuth())) redirect("/recuperar-palavra-passe");
  return (
    <div className="auth">
      <h1>Nova palavra-passe</h1>
      <div className="card"><PasswordForm redirectTo="/fotografias" submitLabel="Guardar palavra-passe" /></div>
    </div>
  );
}
