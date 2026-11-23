import { RecoverForm } from "@/components/AuthForms";

export default function RecoverPage() {
  return (
    <div className="auth">
      <h1>Recuperar palavra-passe</h1>
      <p className="intro" style={{ textAlign: "center" }}>Indica o teu e-mail e enviamos-te uma ligação.</p>
      <RecoverForm />
    </div>
  );
}
