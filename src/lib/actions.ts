"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET, STATEMENTS_BUCKET, removeObjects } from "@/lib/storage";
import type { ActionResult } from "@/lib/types";

// As regras de negócio vivem em funções Postgres. Uma recusa de negócio chega como erro P0001 com a
// mensagem em português; qualquer outro erro mostra a mensagem genérica da ação.
async function call<T = unknown>(
  name: string,
  args: Record<string, unknown> | undefined,
  fallback: string,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(name, args);
    if (error) return { data: null, error: error.code === "P0001" ? error.message : fallback };
    return { data: data as T, error: null };
  } catch {
    return { data: null, error: fallback };
  }
}

async function run<T = unknown>(
  name: string,
  args: Record<string, unknown> | undefined,
  fallback: string,
  message?: string | ((data: T | null) => string),
): Promise<ActionResult<T>> {
  const { data, error } = await call<T>(name, args, fallback);
  if (error) return { ok: false, error };
  return { ok: true, data: data ?? undefined, message: typeof message === "function" ? message(data) : message };
}

// ------------------------------------------------------------------ sessão
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function updateMyName(name: string) {
  return run("update_my_name", { p_name: name }, "Não foi possível guardar o nome. Tenta novamente.", "Nome guardado.");
}

// ------------------------------------------------------------- fotografias
export async function beginSubmission(categoryId: number) {
  return run<string>("begin_submission", { p_category_id: categoryId }, "Não foi possível guardar a fotografia. Tenta novamente.");
}

export async function finalizeSubmission(submissionId: string, fileName: string, contentType: string) {
  return run("finalize_submission", { p_submission_id: submissionId, p_file_name: fileName, p_content_type: contentType },
    "Não foi possível guardar a fotografia. Tenta novamente.", "Fotografia guardada.");
}

export async function deleteMySubmission(categoryId: number): Promise<ActionResult> {
  const fallback = "Não foi possível eliminar a fotografia. Tenta novamente.";
  const prep = await call<string | null>("prepare_delete_my_submission", { p_category_id: categoryId }, fallback);
  if (prep.error) return { ok: false, error: prep.error };
  if (prep.data) {
    const supabase = await createClient();
    await removeObjects(supabase, PHOTOS_BUCKET, [prep.data]);
  }
  return run("delete_my_submission", { p_category_id: categoryId }, fallback, "Fotografia eliminada.");
}

// ------------------------------------------------------------------ concurso
export async function startContest() {
  return run("start_contest", undefined, "Não foi possível iniciar o concurso. Tenta novamente.", "Concurso iniciado.");
}
export async function closeSubmissions() {
  return run("close_submissions", undefined, "Não foi possível alterar o estado. Tenta novamente.", "Submissões encerradas.");
}
export async function openSubmissions() {
  return run("open_submissions", undefined, "Não foi possível alterar o estado. Tenta novamente.", "Submissões reabertas.");
}
export async function numberPhotos() {
  return run<number>("number_photos", undefined, "Não foi possível numerar as fotografias. Tenta novamente.",
    (n) => `${n ?? 0} ${n === 1 ? "fotografia numerada" : "fotografias numeradas"}.`);
}

async function runAndClean(name: string, fallback: string, message: string): Promise<ActionResult> {
  const res = await call<string[] | null>(name, undefined, fallback);
  if (res.error) return { ok: false, error: res.error };
  if (res.data?.length) {
    const supabase = await createClient();
    await removeObjects(supabase, PHOTOS_BUCKET, res.data);
  }
  return { ok: true, message };
}
export async function resetContest() {
  return runAndClean("reset_contest", "Não foi possível repor o sistema. Tenta novamente.", "Sistema reposto. O concurso está por iniciar.");
}
export async function deleteAllPhotos() {
  return runAndClean("delete_all_photos", "Não foi possível apagar. Tenta novamente.",
    "Todas as fotografias eliminadas. As votações foram repostas para «por iniciar».");
}
export async function deleteAllVotes() {
  return run("delete_all_votes", undefined, "Não foi possível apagar. Tenta novamente.",
    "Todos os votos eliminados. As votações foram repostas para «por iniciar».");
}

// Descarregar (admin): URL assinado com o nome Categoria_NNN.ext, sem autor.
export async function getDownloadUrl(submissionId: string): Promise<ActionResult<{ url: string }>> {
  const info = await call<{ download_name: string }[]>("admin_get_submission_download",
    { p_submission_id: submissionId }, "Não foi possível descarregar a fotografia.");
  if (info.error) return { ok: false, error: info.error };
  const name = info.data?.[0]?.download_name;
  if (!name) return { ok: false, error: "Fotografia não encontrada." };
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrl(submissionId, 120, { download: name });
  if (error || !data) return { ok: false, error: "Fotografia não encontrada." };
  return { ok: true, data: { url: data.signedUrl } };
}

// --------------------------------------------------------- votação por categoria
export async function setCategoryStatus(categoryId: number, status: string, mode: 1 | 2 | 3) {
  return run("set_category_voting_status", { p_category_id: categoryId, p_new: status },
    "Não foi possível alterar o estado da votação. Tenta novamente.",
    mode === 1 ? "Votação aberta." : mode === 2 ? "Votação encerrada." : "Votação reaberta.");
}

export async function saveVote(submissionId: string, score: number, photoNumber: number) {
  return run<{ infoMessage: string }>("save_vote", { p_submission_id: submissionId, p_score: score },
    "Não foi possível guardar a pontuação. Tenta novamente.", (d) => {
      if (d?.infoMessage) return d.infoMessage;
      const label = photoNumber === 0 ? "sem número" : `Nº ${String(photoNumber).padStart(3, "0")}`;
      return `${score === 1 ? "1 ponto atribuído" : `${score} pontos atribuídos`} à fotografia ${label}.`;
    });
}
export async function removeVote(submissionId: string) {
  return run("remove_vote", { p_submission_id: submissionId },
    "Não foi possível remover a pontuação. Tenta novamente.", "Pontuação removida.");
}

export async function adminSaveVote(voteId: number | null, voterId: string, submissionId: string, score: number) {
  return run("admin_save_vote", { p_vote_id: voteId, p_voter_id: voterId, p_submission_id: submissionId, p_score: score },
    "Não foi possível guardar o voto. Tenta novamente.", "Voto guardado.");
}

export async function listCategorySubmissions(categoryId: number) {
  return run<{ submission_id: string; label: string }[]>("admin_list_category_submissions",
    { p_category_id: categoryId }, "Não foi possível carregar as fotografias.");
}

// --------------------------------------------------------------- votação final
export async function setFinalStatus(status: string, kind: 1 | 2 | 3 | 4) {
  return run("set_final_voting_status", { p_new: status },
    "Não foi possível concluir a operação. Tenta novamente.",
    kind === 1 ? "Votação final aberta." : kind === 2 ? "Votação final encerrada." : kind === 3 ? "Votação final reaberta." : "Votação final reposta.");
}
export async function selectWinners() {
  return run<number>("select_category_winners", undefined, "Não foi possível concluir a operação. Tenta novamente.",
    (n) => `${n ?? 0} ${n === 1 ? "fotografia adicionada" : "fotografias adicionadas"}.`);
}
export async function addCandidate(submissionId: string) {
  return run("add_final_candidate", { p_submission_id: submissionId },
    "Não foi possível alterar os candidatos. Tenta novamente.", "Candidata adicionada.");
}
export async function removeCandidate(submissionId: string) {
  return run("remove_final_candidate", { p_submission_id: submissionId },
    "Não foi possível alterar os candidatos. Tenta novamente.", "Candidata removida.");
}
export async function saveFinalVote(submissionId: string) {
  return run("save_final_vote", { p_submission_id: submissionId },
    "Não foi possível guardar a favorita. Tenta novamente.", "Favorita guardada.");
}
export async function removeFinalVote() {
  return run("remove_final_vote", undefined, "Não foi possível remover a escolha. Tenta novamente.", "Escolha removida.");
}

// ------------------------------------------------------------------- enunciados
export async function saveStatement(categoryId: number, title: string, subtitle: string, body: string, credits: string) {
  return run("save_statement", { p_category_id: categoryId, p_title: title, p_subtitle: subtitle, p_body: body, p_credits: credits },
    "Não foi possível guardar o enunciado. Tenta novamente.", "Enunciado guardado.");
}
export async function setStatementImage(categoryId: number, contentType: string) {
  return run("set_statement_image", { p_category_id: categoryId, p_content_type: contentType },
    "Não foi possível guardar a imagem. Tenta novamente.", "Imagem guardada.");
}
export async function removeStatementImage(categoryId: number): Promise<ActionResult> {
  const res = await run("remove_statement_image", { p_category_id: categoryId },
    "Não foi possível remover a imagem. Tenta novamente.", "Imagem removida.");
  if (res.ok) {
    const supabase = await createClient();
    await removeObjects(supabase, STATEMENTS_BUCKET, [String(categoryId)]);
  }
  return res;
}

// -------------------------------------------------------------- utilizadores
export async function setUserRole(userId: string, role: "administrator" | "participant", grant: boolean) {
  return run("set_user_role", { p_user_id: userId, p_role: role, p_grant: grant },
    "Não foi possível alterar a permissão. Tenta novamente.", grant ? "Permissão atribuída." : "Permissão retirada.");
}

export async function adminUpdateSubmission(submissionId: string, fileName: string, photoNumber: number) {
  return run("admin_update_submission", { p_submission_id: submissionId, p_file_name: fileName, p_photo_number: photoNumber },
    "Não foi possível guardar a fotografia. Tenta novamente.", "Fotografia guardada.");
}
