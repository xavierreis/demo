export type ActionResult<T = unknown> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string };

export type VotingStatus = "por_iniciar" | "a_decorrer" | "encerrado";

export type Category = { id: number; code: string; label: string; sort_order: number };

export type ContestFlags = {
  started: boolean;
  contestStarted: boolean;
  submissionsClosed: boolean;
  startedOn: string | null;
  closedOn: string | null;
};

export type StatementItem = {
  categoryId: number;
  categoryLabel: string;
  title: string;
  subtitle: string;
  body: string;
  credits: string;
  hasImage: boolean;
};
