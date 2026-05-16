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

COPY init/ /docker-entrypoint-initdb.d/
