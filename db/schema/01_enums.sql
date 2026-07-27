-- ============================================
-- ENUMS
-- ============================================
create type card_condition as enum ('NM','LP','MP','HP','DMG');
create type listing_kind   as enum ('OFERTA','PROCURA');
-- Acabamento NÃO é enum. Ver 02_finishes.sql e a seção 8 da doc — é tabela de
-- referência, porque cada set novo pode introduzir padrões inéditos.
create type match_kind     as enum ('DIRETO','MULTIPLO','TRIANGULAR');
create type match_status   as enum (
  'SUGERIDO','PENDENTE','ACEITO','RECUSADO',
  'CONCLUIDO','FURADO','EXPIRADO'
);
