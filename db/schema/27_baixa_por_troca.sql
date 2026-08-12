-- ============================================
-- BAIXA DE ESTOQUE NA TROCA CONCLUÍDA
-- ============================================
-- A quantidade sempre existiu no cadastro e nunca era consumida: quem trocava a
-- única cópia da carta continuava com ela anunciada na vitrine, e a segunda
-- pessoa que aparecesse propunha por algo que já tinha ido embora. Agora, na
-- conclusão da troca (os dois lados confirmando), cai uma unidade da OFERTA de
-- quem deu e uma da PROCURA de quem recebeu — ver `services/listings.baixar_por_troca`.
--
-- O que muda no schema é só o piso. `quantidade` começava em 1 porque não havia
-- caminho que a zerasse; agora há, e o zero é um estado legítimo: significa "eu
-- tinha e não tenho mais", que é diferente de "nunca cadastrei". A linha
-- continua existindo, desativada, e é o que faz o recadastro voltar a ser um
-- upsert que reativa em vez de um insert que esbarra no índice único.
alter table listings drop constraint if exists listings_quantidade_check;

alter table listings
  add constraint listings_quantidade_check check (quantidade between 0 and 99);
