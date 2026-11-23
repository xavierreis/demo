-- Largada de Fotógrafos — lógica de negócio (parte 2): votação final, enunciados e storage.

-- ------------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotografias', 'fotografias', false, 8388608, array['image/*']),
       ('enunciados', 'enunciados', false, 5242880, array['image/*'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Escrita: só na própria submissão e com as submissões abertas.
create function public.can_write_photo(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_participant()
     and exists (select 1 from public.submissions s
                  where s.id::text = p_name and s.user_id = auth.uid())
     and exists (select 1 from public.contest_settings c
                  where c.id = 1 and c.contest_started and not c.submissions_closed)
$$;

-- Leitura: a própria fotografia; as da categoria enquanto a votação decorre;
-- as que votei depois de encerrada; as candidatas com a votação final aberta/encerrada.
-- (Os nomes dos ficheiros são ids aleatórios: não revelam o autor.)
create function public.can_read_photo(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    public.is_participant() and exists (
      select 1 from public.submissions s
       where s.id::text = p_name and s.has_photo
         and (
           s.user_id = auth.uid()
           or exists (select 1 from public.category_voting cv
                       where cv.category_id = s.category_id and cv.status = 'a_decorrer')
           or exists (select 1 from public.category_voting cv
                       join public.votes v on v.submission_id = s.id and v.voter_id = auth.uid()
                      where cv.category_id = s.category_id and cv.status = 'encerrado')
           or exists (select 1 from public.final_candidates fc
                       cross join public.final_voting_settings f
                      where fc.submission_id = s.id and f.status in ('a_decorrer', 'encerrado'))
         )
    )
  )
$$;

create function public.can_read_statement_image(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    public.is_participant()
    and exists (select 1 from public.contest_settings c
                 where c.id = 1 and (c.contest_started or c.submissions_closed))
    and exists (select 1 from public.category_statements st
                 where st.category_id::text = p_name and st.has_image)
  )
$$;

create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotografias' and public.can_write_photo(name));
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'fotografias' and public.can_write_photo(name))
  with check (bucket_id = 'fotografias' and public.can_write_photo(name));
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'fotografias' and public.can_read_photo(name));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotografias' and (public.is_admin() or public.can_write_photo(name)));

create policy statements_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'enunciados' and public.is_admin() and name ~ '^[1-5]$');
create policy statements_update on storage.objects for update to authenticated
  using (bucket_id = 'enunciados' and public.is_admin() and name ~ '^[1-5]$')
  with check (bucket_id = 'enunciados' and public.is_admin() and name ~ '^[1-5]$');
create policy statements_select on storage.objects for select to authenticated
  using (bucket_id = 'enunciados' and public.can_read_statement_image(name));
create policy statements_delete on storage.objects for delete to authenticated
  using (bucket_id = 'enunciados' and public.is_admin() and name ~ '^[1-5]$');

-- --------------------------------------------------------------- votação final
create function public.get_final_status() returns text
language sql stable security definer set search_path = '' as $$
  select public.final_status()::text where auth.uid() is not null
$$;

create function public.set_final_voting_status(p_new public.voting_status) returns void
language plpgsql security definer set search_path = '' as $$
declare v_cur public.voting_status;
begin
  perform public.require_admin();
  v_cur := public.final_status();
  if v_cur = p_new then return; end if;
  if not ((v_cur = 'por_iniciar' and p_new = 'a_decorrer')
       or (v_cur = 'a_decorrer'  and p_new = 'encerrado')
       or (v_cur = 'encerrado'   and p_new = 'a_decorrer')
       or (v_cur = 'a_decorrer'  and p_new = 'por_iniciar')) then
    raise exception 'Transição de estado inválida.';
  end if;
  if p_new = 'por_iniciar' and exists (select 1 from public.final_votes) then
    raise exception 'Já existem votos finais; não é possível voltar a por iniciar.';
  end if;
  if v_cur = 'por_iniciar' and p_new = 'a_decorrer' then
    if (select count(*) from public.final_candidates) < 2 then
      raise exception 'Seleciona pelo menos 2 fotografias candidatas.';
    end if;
    if exists (select 1 from public.category_voting where status = 'a_decorrer') then
      raise exception 'Ainda há categorias com votação a decorrer.';
    end if;
    if exists (select 1 from public.final_candidates fc
                 join public.submissions s on s.id = fc.submission_id
                where public.category_status(s.category_id) <> 'encerrado') then
      raise exception 'Há candidatas de categorias que não estão encerradas.';
    end if;
  end if;
  update public.final_voting_settings
     set status = p_new, changed_on = now(), changed_by = auth.uid()
   where id = 1;
end $$;

create function public.add_final_candidate(p_submission_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_sub public.submissions;
begin
  perform public.require_admin();
  if public.final_status() <> 'por_iniciar' then
    raise exception 'A votação final já começou; não é possível alterar os candidatos.';
  end if;
  select * into v_sub from public.submissions where id = p_submission_id and has_photo;
  if not found then raise exception 'Fotografia não encontrada.'; end if;
  if public.category_status(v_sub.category_id) <> 'encerrado' then
    raise exception 'A votação desta categoria ainda não foi encerrada.';
  end if;
  insert into public.final_candidates (submission_id, added_by)
  values (p_submission_id, auth.uid())
  on conflict (submission_id) do nothing;
end $$;

create function public.remove_final_candidate(p_submission_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  if public.final_status() <> 'por_iniciar' then
    raise exception 'A votação final já começou; não é possível alterar os candidatos.';
  end if;
  delete from public.final_candidates where submission_id = p_submission_id;
end $$;

-- 1.os lugares (empates incluídos, com pontos > 0) das categorias encerradas.
create function public.select_category_winners() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_added integer := 0; v_cat record; v_n integer;
begin
  perform public.require_admin();
  if public.final_status() <> 'por_iniciar' then
    raise exception 'A votação final já começou; não é possível alterar os candidatos.';
  end if;
  for v_cat in select id from public.categories order by sort_order loop
    continue when public.category_status(v_cat.id) <> 'encerrado';
    insert into public.final_candidates (submission_id, added_by)
    select r.submission_id, auth.uid()
      from public.get_category_results(v_cat.id) r
     where r.rank = 1 and r.total_points > 0
    on conflict (submission_id) do nothing;
    get diagnostics v_n = row_count;
    v_added := v_added + v_n;
  end loop;
  return v_added;
end $$;

-- Candidatas para os participantes: sem autor, sem contagens.
create function public.get_final_candidates()
returns table (submission_id uuid, category_label text, photo_number integer, is_my_choice boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, c.label, s.photo_number,
         coalesce(fv.submission_id = s.id, false)
    from public.final_candidates fc
    join public.submissions s on s.id = fc.submission_id
    join public.categories c on c.id = s.category_id
    left join public.final_votes fv on fv.voter_id = auth.uid()
   where public.is_participant()
     and public.final_status() in ('a_decorrer', 'encerrado')
   order by c.sort_order, s.photo_number
$$;

create function public.save_final_vote(p_submission_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  v_uid := public.require_participant();
  if public.final_status() <> 'a_decorrer' then
    raise exception 'A votação final não está a decorrer.';
  end if;
  if not exists (select 1 from public.final_candidates where submission_id = p_submission_id) then
    raise exception 'Esta fotografia não é candidata.';
  end if;
  insert into public.final_votes (voter_id, submission_id, voted_on)
  values (v_uid, p_submission_id, now())
  on conflict (voter_id) do update
    set submission_id = excluded.submission_id, voted_on = excluded.voted_on;
end $$;

create function public.remove_final_vote() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  v_uid := public.require_participant();
  if public.final_status() <> 'a_decorrer' then
    raise exception 'A votação final não está a decorrer.';
  end if;
  delete from public.final_votes where voter_id = v_uid;
end $$;

-- Resultados da votação final (só administradores).
create function public.get_final_results() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_total integer; v_rows jsonb;
begin
  if not public.is_admin() or public.final_status() = 'por_iniciar' then
    return jsonb_build_object('totalVoters', 0, 'rows', '[]'::jsonb);
  end if;
  select count(*) into v_total from public.final_votes;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.votes_count desc, t.category_order, t.photo_number), '[]'::jsonb)
    into v_rows
    from (
      select s.id as submission_id, c.id as category_id, c.label as category_label,
             c.sort_order as category_order, s.photo_number,
             coalesce(nullif(p.name, ''), p.email, '') as author_name,
             coalesce(p.email, '') as author_username,
             (select count(*) from public.final_votes fv where fv.submission_id = s.id)::int as votes_count,
             (rank() over (order by (select count(*) from public.final_votes fv
                                      where fv.submission_id = s.id) desc))::int as rank
        from public.final_candidates fc
        join public.submissions s on s.id = fc.submission_id
        join public.categories c on c.id = s.category_id
        left join public.profiles p on p.user_id = s.user_id
    ) t;
  return jsonb_build_object('totalVoters', v_total, 'rows', v_rows);
end $$;

-- Candidatas (admin), com a posição e os pontos na respetiva categoria.
create function public.get_final_admin_cards()
returns table (submission_id uuid, category_id integer, category_label text, photo_number integer,
               author_name text, author_username text, category_rank integer, category_points integer)
language sql stable security definer set search_path = '' as $$
  select s.id, c.id::int, c.label, s.photo_number,
         coalesce(nullif(p.name, ''), p.email, ''), coalesce(p.email, ''),
         coalesce(r.rank, 0), coalesce(r.total_points, 0)
    from public.final_candidates fc
    join public.submissions s on s.id = fc.submission_id
    join public.categories c on c.id = s.category_id
    left join public.profiles p on p.user_id = s.user_id
    left join lateral public.get_category_results(s.category_id) r on r.submission_id = s.id
   where public.is_admin()
   order by c.sort_order, s.photo_number
$$;

-- "Escolher manualmente": linhas da categoria (só se estiver encerrada).
create function public.get_final_manual_rows(p_category_id integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_status public.voting_status; v_rows jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('categoryStatus', 'por_iniciar', 'rows', '[]'::jsonb);
  end if;
  v_status := public.category_status(p_category_id);
  if v_status <> 'encerrado' then
    return jsonb_build_object('categoryStatus', v_status::text, 'rows', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'submissionId', r.submission_id, 'photoNumber', r.photo_number,
           'authorName', r.author_name, 'authorUsername', r.author_username,
           'totalPoints', r.total_points, 'votesCount', r.votes_count, 'rank', r.rank,
           'isCandidate', exists (select 1 from public.final_candidates fc
                                   where fc.submission_id = r.submission_id))
           order by r.total_points desc, r.count5 desc, r.count4 desc, r.count3 desc,
                    r.count2 desc, r.photo_number), '[]'::jsonb)
    into v_rows
    from public.get_category_results(p_category_id) r;
  return jsonb_build_object('categoryStatus', v_status::text, 'rows', v_rows);
end $$;

-- --------------------------------------------------------------------- enunciados
-- Participantes: só devolve texto depois de o concurso estar iniciado.
create function public.get_statements() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.contest_settings; v_items jsonb;
begin
  perform public.require_user();
  select * into c from public.contest_settings where id = 1;
  if not (c.contest_started or c.submissions_closed) then
    return jsonb_build_object('available', false, 'items', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'categoryId', k.id, 'categoryLabel', k.label, 'title', st.title,
           'subtitle', st.subtitle, 'body', st.body, 'credits', st.credits,
           'hasImage', st.has_image) order by k.sort_order), '[]'::jsonb)
    into v_items
    from public.category_statements st
    join public.categories k on k.id = st.category_id;
  return jsonb_build_object('available', true, 'items', v_items);
end $$;

-- Admin: todos os enunciados (para edição), mesmo antes de iniciar.
create function public.admin_get_statements() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_items jsonb;
begin
  perform public.require_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
           'categoryId', k.id, 'categoryLabel', k.label, 'title', st.title,
           'subtitle', st.subtitle, 'body', st.body, 'credits', st.credits,
           'hasImage', st.has_image) order by k.sort_order), '[]'::jsonb)
    into v_items
    from public.category_statements st
    join public.categories k on k.id = st.category_id;
  return v_items;
end $$;

create function public.save_statement(p_category_id integer, p_title text, p_subtitle text,
                                      p_body text, p_credits text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.category_statements where category_id = p_category_id) then
    raise exception 'Categoria inválida.';
  end if;
  if not (char_length(coalesce(p_title, '')) <= 250 and char_length(coalesce(p_subtitle, '')) <= 250
          and char_length(coalesce(p_body, '')) <= 20000 and char_length(coalesce(p_credits, '')) <= 500) then
    raise exception 'Um dos textos excede o tamanho máximo permitido.';
  end if;
  update public.category_statements
     set title = coalesce(p_title, ''), subtitle = coalesce(p_subtitle, ''),
         body = coalesce(p_body, ''), credits = coalesce(p_credits, ''),
         changed_on = now(), changed_by = auth.uid()
   where category_id = p_category_id;
end $$;

-- Depois do upload para o bucket "statements" (nome = id da categoria).
create function public.set_statement_image(p_category_id integer, p_content_type text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_size bigint; v_mime text;
begin
  perform public.require_admin();
  if not (char_length(coalesce(p_content_type, '')) >= 6 and lower(left(p_content_type, 6)) = 'image/') then
    raise exception 'O ficheiro tem de ser uma imagem.';
  end if;
  if not exists (select 1 from public.category_statements where category_id = p_category_id) then
    raise exception 'Categoria inválida.';
  end if;
  select (o.metadata->>'size')::bigint, o.metadata->>'mimetype' into v_size, v_mime
    from storage.objects o where o.bucket_id = 'enunciados' and o.name = p_category_id::text;
  if not found then raise exception 'Seleciona uma imagem.'; end if;
  if v_mime is null or lower(left(v_mime, 6)) <> 'image/' then
    raise exception 'O ficheiro tem de ser uma imagem.';
  end if;
  if v_size is null or v_size > 5242880 then
    raise exception 'A imagem excede 5 MB.';
  end if;
  update public.category_statements
     set has_image = true, image_content_type = left(p_content_type, 100),
         changed_on = now(), changed_by = auth.uid()
   where category_id = p_category_id;
end $$;

create function public.remove_statement_image(p_category_id integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.category_statements where category_id = p_category_id) then
    raise exception 'Categoria inválida.';
  end if;
  update public.category_statements
     set has_image = false, image_content_type = null, changed_on = now(), changed_by = auth.uid()
   where category_id = p_category_id;
end $$;

-- Texto oficial dos enunciados (idempotente: nunca sobrescreve edições).
insert into public.category_statements (category_id, title, subtitle, body, credits) values
(3, '“Alcântara – Av. Da Índia”', 'Vhils (Lisboa, 2014)', '', ''),
(1, '“A sesta do português”', 'Rubem Braga (1958?)',
$t$Uma vez me perguntaram se eu conhecera alguém feliz. Lembrei-me de um português que conheci há muitos anos, em uma pensão do Catete. Era ou se dizia piloto mercante, mas estava em férias. Seu quarto tinha uma varanda; ele passava as tardes alí, de pijama deitado com a cabeça no colo da mulher. A mulher era uma morena razoável e seus dedos finos passavam horas acariciando os cabelos do homem.

Um dia o casal sumiu; soubemos então que o homem estava sendo procurado pela polícia por causa de uma falcatrua, e além disso realizara a proeza de ficar devendo quatro meses de pensão. Um mandrião, comentou o porteiro lusitano.

Sim, era um mandrião; mas nunca, nem antes nem depois, homem nenhum me deu a impressão de ter tanta capacidade de ser feliz. Aquele merecia não fazer nada; deleitava-se em ouvir o canário do vizinho, tinha sempre um ar distraído e bem-humorado, e só chamava a mulher de princesa. Espero que jamais o tenham preso; era um tipo amorável e de boa paz, e me disse mais de uma vez: “Eu adoro o Brasil; a gente cá é muito boa.”

Faço votos para que a nossa polícia não o tenha feito mudar de opinião.$t$,
 'In “Desculpem tocar no assunto” (Tinta da China; 2023)'),
(2, '“Aniki Bóbó”', 'Manoel de Oliveira (1942)',
$t$Passado nas ruas da Ribeira, no Porto, e à beira do Rio Douro, o filme retrata o quotidiano e as brincadeiras de um grupo de crianças.

Centra-se no triângulo infantil entre Carlitos, um rapaz tímido e sonhador, Eduardinho, o líder destemido e valentão e, Teresinha, a única rapariga do grupo, que ambos cortejam.

Para provar o seu afeto a Teresinha, Carlitos rouba uma boneca de uma loja de comércio local e, atormentado pela culpa e pelo medo, vive um intenso drama moral

Data de lançamento: 18 de dezembro de 1942
Realizador e Argumento: Manoel de Oliveira
Produtor: António Lopes Ribeiro
Elenco: Horácio Silva; António Santos; Fernanda Matos
Música: Jaime Silva Filho$t$, ''),
(5, '“Encosta-te a mim”', 'Jorge Palma (2007)',
$t$Encosta-te a mim, nós já vivemos cem mil anos
Encosta-te a mim, talvez eu esteja a exagerar
Encosta-te a mim, dá cabo dos teus desenganos
Não queiras ver quem eu não sou, deixa-me chegar

Chegado da guerra, fiz tudo pra sobreviver
Em nome da terra, no fundo, pra te merecer
Recebe-me bem, não desencantes os meus passos
Faz de mim o teu herói, não quero adormecer

Tudo o que eu vi, estou a partilhar contigo
O que não vivi, hei de inventar contigo
Sei que não sei, às vezes, entender o teu olhar
Mas quero-te bem, encosta-te a mim

Encosta-te a mim, desatinamos tantas vezes
Vizinha de mim, deixa ser meu o teu quintal
Recebe esta pomba que não está armadilhada
Foi comprada, foi roubada, seja como for

Eu venho do nada porque arrasei o que não quis
Em nome da estrada, onde só quero ser feliz
Enrosca-te a mim, vai desarmar a flor queimada
Vai beijar o homem-bomba, quero adormecer

Tudo o que eu vi, estou a partilhar contigo
E o que não vivi, um dia hei de inventar contigo
Sei que não sei, às vezes, entender o teu olhar
Mas quero-te bem, encosta-te a mim
Encosta-te a mim
Quero-te bem, encosta-te a mim$t$,
 'in “Voo Nocturno”'),
(4, '“Os espelhos também mudam”', 'Filipa Leal (2024)',
$t$É esta minha mania de nunca olhar para o espelho,
de entrar sempre de costas no elevador,
de não gostar que eles me vejam a ver-me,
eles, os espelhos, os humanos.

É esta minha mania de nunca apanhar narcisos
por saber pouco de botânica
e mesmo assim estar sempre a tropeçar neles no caminho,
neles, nos narcisos,
Nos humanos.

Quando muito raramente,
de X em X anos,
quando olho para um espelho,
reparo que os espelhos são coisas que mudam muito com o tempo.$t$,
 'In Adrenalina (Assírio & Alvim, 2024)')
on conflict (category_id) do nothing;
