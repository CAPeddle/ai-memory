FROM postgres:15

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    flex \
    bison \
    postgresql-server-dev-15 \
    postgresql-15-pgvector \
 && rm -rf /var/lib/apt/lists/*

COPY docker/postgres-age/age-v1.6.0-rc0.tar.gz /tmp/age.tar.gz
RUN tar -xzf /tmp/age.tar.gz -C /tmp \
 && mv /tmp/age-PG15-v1.6.0-rc0 /tmp/age \
 && cd /tmp/age \
 && make \
 && make install \
 && rm -rf /tmp/age /tmp/age.tar.gz

# Init scripts run in lexicographic order:
# 01 — create extensions (vector, age)
# 02 — create thoughts table and supporting schema
# 03 — create AGE memory_graph and entity extraction queue
# 04 — ST-039 embedding-resilience columns (needs_embedding, embedding_model, ...)
COPY docker/postgres-age/init/01-extensions.sql /docker-entrypoint-initdb.d/01-extensions.sql
COPY server/db/schema.sql                        /docker-entrypoint-initdb.d/02-schema.sql
COPY server/db/graph.sql                         /docker-entrypoint-initdb.d/03-graph.sql
COPY server/db/002_needs_embedding.sql           /docker-entrypoint-initdb.d/04-needs-embedding.sql
