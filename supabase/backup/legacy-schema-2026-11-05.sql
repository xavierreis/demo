-- BACKUP do schema anterior do projeto Supabase "app-fotografias" (xjcpucztmkkwjcavghud),
-- guardado antes de ser substituído pelo modelo da "Largada de Fotógrafos" (migração 20261123000000).
-- Reconstrói o schema e os dados antigos, se for preciso voltar atrás.
-- Nota: o ficheiro da fotografia de teste (bucket "photos", 208 515 bytes, image/png) NÃO foi apagado
-- do storage; o bucket antigo fica intocado (sem políticas) e a app nova usa os buckets
-- "fotografias" e "enunciados".

-- ------------------------------------------------------------------------ tabelas
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.app_settings (
  id              boolean primary key default true check (id),
  allow_self_vote boolean not null default false
);

create table public.categories (
  id             smallint generated always as identity primary key,
  slug           text not null unique,
  name           text not null,
  sort_order     smallint not null default 0,
  uploads_open   boolean not null default true,
  voting_open    boolean not null default false,
  results_public boolean not null default false,
  constraint uploads_and_voting_exclusive check (not (uploads_open and voting_open))
);

create table public.photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  category_id  smallint not null references public.categories(id),
  storage_path text not null unique,
  title        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint one_photo_per_user_per_category unique (user_id, category_id),
  constraint photos_id_category_unique unique (id, category_id)
);
create index photos_category_idx on public.photos (category_id);

create table public.votes (
  id          uuid primary key default gen_random_uuid(),
  voter_id    uuid not null references public.profiles(id) on delete cascade,
  photo_id    uuid not null,
  category_id smallint not null,
  points      smallint not null check (points between 1 and 5),
  created_at  timestamptz not null default now(),
  constraint one_vote_per_photo_per_voter unique (voter_id, photo_id),
  constraint one_score_per_category_per_voter unique (voter_id, category_id, points),
  constraint votes_photo_fk foreign key (photo_id, category_id)
    references public.photos(id, category_id) on delete cascade
);
create index votes_photo_idx on public.votes (photo_id);

-- ------------------------------------------------------------------------ funções
create function public.is_admin() returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create function public.category_photos_visible(p_category_id smallint) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select voting_open or results_public from public.categories where id = p_category_id), false);
$$;

create function public.category_uploads_open(p_category_id smallint) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select uploads_open from public.categories where id = p_category_id), false);
$$;

create function public.category_voting_open(p_category_id smallint) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select voting_open from public.categories where id = p_category_id), false);
$$;

create function public.check_vote() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_owner uuid; v_allow boolean;
begin
  select user_id into v_owner from public.photos where id = new.photo_id;
  select allow_self_vote into v_allow from public.app_settings;
  if v_owner = new.voter_id and not coalesce(v_allow, false) then
    raise exception 'Não pode votar na sua própria fotografia';
  end if;
  return new;
end; $$;

create function public.get_results(p_category_id smallint)
returns table(photo_id uuid, storage_path text, title text, author text, total_points bigint,
              vote_count bigint, pts_5 bigint, pts_4 bigint, pts_3 bigint, pts_2 bigint, pts_1 bigint)
language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
begin
  if not (public.is_admin()
          or exists (select 1 from public.categories c where c.id = p_category_id and c.results_public)) then
    raise exception 'Resultados ainda não publicados';
  end if;
  return query
  select p.id, p.storage_path, p.title, pr.display_name,
         coalesce(sum(v.points), 0)::bigint, count(v.id)::bigint,
         count(*) filter (where v.points = 5), count(*) filter (where v.points = 4),
         count(*) filter (where v.points = 3), count(*) filter (where v.points = 2),
         count(*) filter (where v.points = 1)
  from public.photos p
  join public.profiles pr on pr.id = p.user_id
  left join public.votes v on v.photo_id = p.id
  where p.category_id = p_category_id
  group by p.id, pr.display_name
  order by 5 desc, 7 desc, 8 desc, 9 desc, 10 desc, 11 desc, p.created_at;
end; $$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end; $$;

create function public.protect_admin_flag() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null and not public.is_admin() then
    raise exception 'Só um administrador pode alterar is_admin';
  end if;
  return new;
end; $$;

create function public.submit_votes(p_category_id smallint, p_votes jsonb) returns void
language plpgsql set search_path to '' as $$
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  if not public.category_voting_open(p_category_id) then
    raise exception 'A votação desta categoria está fechada';
  end if;
  if jsonb_array_length(p_votes) > 5 then raise exception 'Máximo de 5 votos por categoria'; end if;
  delete from public.votes where voter_id = auth.uid() and category_id = p_category_id;
  insert into public.votes (voter_id, photo_id, category_id, points)
  select auth.uid(), (v->>'photo_id')::uuid, p_category_id, (v->>'points')::smallint
  from jsonb_array_elements(p_votes) as v;
end; $$;

-- ------------------------------------------------------------------------ triggers
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
create trigger profiles_protect_admin before update on public.profiles
  for each row execute function public.protect_admin_flag();
create trigger votes_check before insert or update on public.votes
  for each row execute function public.check_vote();

-- ----------------------------------------------------------------------- políticas
alter table public.profiles     enable row level security;
alter table public.app_settings enable row level security;
alter table public.categories   enable row level security;
alter table public.photos       enable row level security;
alter table public.votes        enable row level security;

create policy "settings: ler" on public.app_settings for select to authenticated using (true);
create policy "settings: admin altera" on public.app_settings for update to authenticated
  using (is_admin()) with check (is_admin());
create policy "categories: ler" on public.categories for select to authenticated using (true);
create policy "categories: admin altera" on public.categories for update to authenticated
  using (is_admin()) with check (is_admin());
create policy "profiles: ver autenticado" on public.profiles for select to authenticated using (true);
create policy "profiles: editar o próprio" on public.profiles for update to authenticated
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());
create policy "photos: ver próprias, em votação, ou admin" on public.photos for select to authenticated
  using (user_id = auth.uid() or category_photos_visible(category_id) or is_admin());
create policy "photos: inserir com uploads abertos" on public.photos for insert to authenticated
  with check (user_id = auth.uid() and category_uploads_open(category_id));
create policy "photos: substituir com uploads abertos" on public.photos for update to authenticated
  using (user_id = auth.uid() and category_uploads_open(category_id))
  with check (user_id = auth.uid() and category_uploads_open(category_id));
create policy "photos: apagar com uploads abertos (ou admin)" on public.photos for delete to authenticated
  using ((user_id = auth.uid() and category_uploads_open(category_id)) or is_admin());
create policy "votes: ver os próprios" on public.votes for select to authenticated
  using (voter_id = auth.uid() or is_admin());
create policy "votes: votar com votação aberta" on public.votes for insert to authenticated
  with check (voter_id = auth.uid() and category_voting_open(category_id));
create policy "votes: retirar com votação aberta" on public.votes for delete to authenticated
  using (voter_id = auth.uid() and category_voting_open(category_id));

-- storage.objects (bucket "photos": 10 MB, image/jpeg|png|webp|heic, privado)
create policy "storage photos: ver quando a fotografia é visível" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[2] = auth.uid()::text
         or is_admin() or category_photos_visible(((storage.foldername(name))[1])::smallint)));
create policy "storage photos: upload próprio com uploads abertos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[2] = auth.uid()::text
         and category_uploads_open(((storage.foldername(name))[1])::smallint));
create policy "storage photos: apagar próprio com uploads abertos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[2] = auth.uid()::text
         and category_uploads_open(((storage.foldername(name))[1])::smallint));

-- ------------------------------------------------------------------------- dados
insert into public.profiles (id, display_name, is_admin, created_at) values
  ('f21e1852-58f7-4474-a286-bc18e8f515de', 'Xavier', true, '2026-11-05T21:44:41.439488+00:00');
insert into public.app_settings (id, allow_self_vote) values (true, false);
insert into public.categories (id, slug, name, sort_order, uploads_open, voting_open, results_public)
overriding system value values
  (1, 'conto', 'Conto', 1, true, false, false),
  (2, 'poema', 'Poema', 2, true, false, false),
  (3, 'filme', 'Filme', 3, true, false, false),
  (4, 'artes-plasticas', 'Artes Plásticas', 4, true, false, false),
  (5, 'musica', 'Música', 5, true, false, false);
insert into public.photos (id, user_id, category_id, storage_path, title, created_at, updated_at) values
  ('ffbcb6c1-8388-4292-8cba-bbffb1ed239d', 'f21e1852-58f7-4474-a286-bc18e8f515de', 1,
   '1/f21e1852-58f7-4474-a286-bc18e8f515de/6ec87b63-f0e8-4efa-bac1-2ae532028d66.png', '',
   '2026-11-05T21:46:50.542576+00:00', '2026-11-05T21:46:50.542576+00:00');
-- votes: vazia.
