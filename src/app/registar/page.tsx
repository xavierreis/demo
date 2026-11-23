import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { SignupForm } from "@/components/AuthForms";

export default async function SignupPage() {
  if (await getAuth()) redirect("/fotografias");
  return (
    <div className="auth">
      <h1>Registar</h1>
      <p className="intro" style={{ textAlign: "center" }}>Cria a tua conta para participar no concurso.</p>
      <SignupForm />
    </div>
  );
}
