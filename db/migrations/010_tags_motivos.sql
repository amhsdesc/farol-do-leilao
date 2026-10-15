-- Motivo de cada tag (ex.: {"universitario": ["a 1,1 km de Estácio Santa Cruz"]}), calculado pelo classificador e mostrado na ficha.
alter table imovel add column if not exists tags_motivos jsonb not null default '{}'::jsonb;
