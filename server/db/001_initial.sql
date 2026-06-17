-- 001: Baseline schema marker.
-- The baseline schema is created by the Docker init entrypoint from schema.sql,
-- graph.sql, and search.sql. This marker anchors version numbering so the
-- runtime migration runner can bootstrap an existing database consistently.
SELECT 1;