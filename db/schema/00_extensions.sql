-- ============================================
-- EXTENSÕES
-- ============================================
-- No Supabase, uuid-ossp e pg_trgm estão disponíveis diretamente.
-- pg_cron precisa ser habilitado uma vez pelo painel (Database > Extensions)
-- ou via SQL com privilégio adequado; por isso fica isolado aqui.
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;      -- busca por similaridade de nome
create extension if not exists pg_cron;      -- agendamento (habilitar no painel do Supabase)
