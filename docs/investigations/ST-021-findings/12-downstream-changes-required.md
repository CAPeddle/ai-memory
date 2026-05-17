## Downstream Changes Required

1. **ADR-007** (Consolidation Pipeline): The `consolidation_queue` table schema is defined in `server/db/schema.sql`. The Deno consolidation worker implementation is a separate story.
2. **ST-XXX** (Entity Extraction Worker): The design in §R8 is ready. Create an implementation story for the Deno entity extraction worker process.
3. **ST-XXX** (Consolidation Worker): Implement the Deno consolidation worker using the queue pattern in `server/db/schema.sql`.
4. **ST-XXX** (Cloud Deployment): After local Docker validation, evaluate Fly.io / Railway / DigitalOcean per ADR-009.
5. **Local validation**: Docker image build (AGE compilation) and `docker compose up` full stack test must be confirmed locally before the Docker-related DoD criteria are fully signed off.
