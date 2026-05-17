FROM denoland/deno:2.0.0
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["run", "--allow-net", "--allow-env", "index.ts"]
