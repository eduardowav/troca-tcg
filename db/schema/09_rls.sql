-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
-- RLS ativo em todas as tabelas de usuário. A API usa a service_role key e aplica
-- autorização própria, mas o RLS é a rede de segurança caso alguém acesse o
-- Postgres direto ou o client Supabase seja exposto no frontend.
alter table profiles            enable row level security;
alter table listings            enable row level security;
alter table matches             enable row level security;
alter table match_participants  enable row level security;
alter table match_items         enable row level security;
alter table notifications       enable row level security;
alter table push_subscriptions  enable row level security;
alter table term_acceptances    enable row level security;
alter table user_reports        enable row level security;

-- Perfis são públicos para leitura (reputação precisa ser visível)
create policy "perfis publicos"
  on profiles for select using (true);

create policy "edita proprio perfil"
  on profiles for update using (auth.uid() = id);

-- Anúncios ativos são públicos: é isso que torna a troca possível
create policy "le anuncios ativos"
  on listings for select using (ativo = true);

create policy "gerencia proprios anuncios"
  on listings for all using (auth.uid() = user_id);

-- Matches: só participantes veem
create policy "ve proprios matches"
  on matches for select using (
    exists (
      select 1 from match_participants mp
      where mp.match_id = matches.id and mp.user_id = auth.uid()
    )
  );

create policy "ve propria participacao"
  on match_participants for select using (
    exists (
      select 1 from match_participants mp
      where mp.match_id = match_participants.match_id
        and mp.user_id = auth.uid()
    )
  );

create policy "ve itens dos proprios matches"
  on match_items for select using (
    exists (
      select 1 from match_participants mp
      where mp.match_id = match_items.match_id and mp.user_id = auth.uid()
    )
  );

create policy "ve proprias notificacoes"
  on notifications for all using (auth.uid() = user_id);

create policy "gerencia propria inscricao push"
  on push_subscriptions for all using (auth.uid() = user_id);

create policy "ve proprios aceites"
  on term_acceptances for select using (auth.uid() = user_id);

create policy "cria propria denuncia"
  on user_reports for insert with check (auth.uid() = autor_id);
