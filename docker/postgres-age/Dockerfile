FROM postgres:15

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    postgresql-server-dev-15 \
    postgresql-15-pgvector \
 && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch v1.7.0 https://github.com/apache/age.git /tmp/age \
 && cd /tmp/age \
 && make \
 && make install \
 && rm -rf /tmp/age

# Init scripts run in lexicographic order:
# 01 — create extensions (vector, age)
# 02 — create thoughts table and supporting schema
# 03 — create AGE memory_graph and entity extraction queue
COPY docker/postgres-age/init/01-extensions.sql /docker-entrypoint-initdb.d/01-extensions.sql
COPY server/db/schema.sql                        /docker-entrypoint-initdb.d/02-schema.sql
COPY server/db/graph.sql                         /docker-entrypoint-initdb.d/03-graph.sql
