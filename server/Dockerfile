FROM denoland/deno:2.0.0
# curl backs the compose healthcheck. git is here for the test suite only (ST-087):
# server/scripts/awcp.ts derives a checkpoint's repo/branch/commit by running git, and
# server/tests/awcp-cli.test.ts proves it — which it cannot do in a container where the
# binary is absent. The test builds its own throwaway repository in a temp dir rather
# than reading this checkout, so nothing here depends on the repo being mounted.
#
# This image also serves the `mcp` runtime, where the server itself never shells out to
# git. A test-only build stage would keep it out of production, and that was considered.
# The PO accepted the shared image instead (2026-08-03) — a settled decision, not
# deferred work, so do not split the stage as a tidy-up. What would reopen it is the
# runtime image's contents becoming a compliance surface; absent that, one image is the
# choice.
RUN apt-get update && apt-get install -y --no-install-recommends curl git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/. .
COPY shared/. /shared/.
EXPOSE 3000
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "index.ts"]
