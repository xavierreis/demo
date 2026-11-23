-- Largada de Fotógrafos — schema base (tabelas, perfis, RLS, storage)
-- Todas as escritas passam por funções RPC (security definer) com as regras de negócio.
-- As tabelas não têm políticas de INSERT/UPDATE/DELETE para clientes.

create type public.voting_status as enum ('por_iniciar', 'a_decorrer', 'encerrado');

-- ---------------------------------------------------------------- categorias
create table public.categories (
  id          smallint primary key,
  code        text not null unique,
  label       text not null,
  sort_order  smallint not null
);

insert into public.categories (id, code, label, sort_order) values
  (1, 'Conto',          'Conto',           1),
  (2, 'Filme',          'Filme',           2),
  (3, 'ArtesPlasticas', 'Artes Plásticas', 3),
  (4, 'Poema',          'Poema',           4),
  (5, 'Musica',         'Música',          5);

-- --------------------------------------------------------- perfis e permissões
create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  created_at  timestamptz not null default now()
);

create table public.user_roles (
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     text not null check (role in ('administrator', 'participant')),
  primary key (user_id, role)
);

-- Ao registar: cria o perfil e atribui o perfil de participante (FinishSignUp).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, name, email)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'display_name', ''),
          coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'participant')
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém o e-mail do perfil em sincronia com auth.users.
create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '') where user_id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ------------------------------------------------------------ estado do concurso
create table public.contest_settings (
  id                  smallint primary key default 1 check (id = 1),
  contest_started     boolean not null default false,
  submissions_closed  boolean not null default false,
  started_on          timestamptz,
  started_by          uuid,
  closed_on           timestamptz,
  closed_by           uuid
);
insert into public.contest_settings default values;

create table public.category_voting (
  category_id  smallint primary key references public.categories(id),
  status       public.voting_status not null default 'por_iniciar',
  changed_on   timestamptz,
  changed_by   uuid
);
insert into public.category_voting (category_id) select id from public.categories;

create table public.final_voting_settings (
  id          smallint primary key default 1 check (id = 1),
  status      public.voting_status not null default 'por_iniciar',
  changed_on  timestamptz,
  changed_by  uuid
);
insert into public.final_voting_settings default values;

-- ------------------------------------------------------------------ fotografias
-- A fotografia fica no bucket privado "photos", com o nome = id da submissão
-- (aleatório, sem autor). has_photo só passa a true depois de validada.
create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   smallint not null references public.categories(id),
  file_name     text check (char_length(file_name) <= 250),
  content_type  text check (char_length(content_type) <= 100),
  file_size     integer,
  uploaded_on   timestamptz,
  photo_number  integer not null default 0,
  has_photo     boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint uq_submission_user_category unique (user_id, category_id)
);
create index ix_submission_category_photo on public.submissions (category_id, photo_number);

-- ------------------------------------------------------------------------ votos
create table public.votes (
  id             bigint generated always as identity primary key,
  voter_id       uuid not null references auth.users(id) on delete cascade,
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  category_id    smallint not null references public.categories(id),
  score          smallint not null check (score between 1 and 5),
  voted_on       timestamptz not null default now(),
  constraint uq_vote_voter_submission unique (voter_id, submission_id),
  constraint uq_vote_voter_category_score unique (voter_id, category_id, score)
);
create index ix_vote_submission on public.votes (submission_id);

-- -------------------------------------------------------------- votação final
create table public.final_candidates (
  submission_id  uuid primary key references public.submissions(id) on delete cascade,
  added_on       timestamptz not null default now(),
  added_by       uuid
);

create table public.final_votes (
  voter_id       uuid primary key references auth.users(id) on delete cascade,
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  voted_on       timestamptz not null default now()
);
create index ix_final_vote_submission on public.final_votes (submission_id);

-- ------------------------------------------------------------------ enunciados
create table public.category_statements (
  category_id         smallint primary key references public.categories(id),
  title               text not null default '' check (char_length(title) <= 250),
  subtitle            text not null default '' check (char_length(subtitle) <= 250),
  body                text not null default '' check (char_length(body) <= 20000),
  credits             text not null default '' check (char_length(credits) <= 500),
  has_image           boolean not null default false,
  image_content_type  text,
  changed_on          timestamptz not null default now(),
  changed_by          uuid
);

-- ------------------------------------------------------------------------- RLS
alter table public.categories            enable row level security;
alter table public.profiles              enable row level security;
alter table public.user_roles            enable row level security;
alter table public.contest_settings      enable row level security;
alter table public.category_voting       enable row level security;
alter table public.final_voting_settings enable row level security;
alter table public.submissions           enable row level security;
alter table public.votes                 enable row level security;
alter table public.final_candidates      enable row level security;
alter table public.final_votes           enable row level security;
alter table public.category_statements   enable row level security;

-- Funções auxiliares de permissões (security definer para evitar recursão de RLS).
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles
                 where user_id = auth.uid() and role = 'administrator')
$$;

create function public.is_participant() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles
                 where user_id = auth.uid() and role = 'participant')
$$;

create policy categories_read on public.categories for select to authenticated using (true);
create policy profiles_read_own on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy roles_read_own on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy contest_read on public.contest_settings for select to authenticated using (true);
create policy category_voting_read on public.category_voting for select to authenticated using (true);
create policy final_settings_read on public.final_voting_settings for select to authenticated using (true);
-- Anonimato: um participante só lê as suas próprias submissões e votos.
create policy submissions_read on public.submissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy votes_read on public.votes for select to authenticated
  using (voter_id = auth.uid() or public.is_admin());
create policy final_candidates_read on public.final_candidates for select to authenticated
  using (public.is_admin());
create policy final_votes_read on public.final_votes for select to authenticated
  using (voter_id = auth.uid() or public.is_admin());
-- Enunciados: só o administrador lê a tabela; os participantes usam get_statements().
create policy statements_admin_read on public.category_statements for select to authenticated
  using (public.is_admin());
