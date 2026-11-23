import { Shell } from "@/components/Shell";
import { requireParticipant } from "@/lib/auth";

// Todos os ecrãs deste grupo exigem sessão e o perfil de participante.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireParticipant();
  return <Shell>{children}</Shell>;
}
