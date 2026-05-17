### Option B — Fork OB1

Fork + self-host the PostgreSQL database on a VPS. This unlocks the ability to install Apache AGE (`CREATE EXTENSION age`), enabling openCypher graph queries. The `entity-extraction` schema still provides the base tables; AGE overlays graph traversal.

Entity extraction worker must still be built from scratch (the schema includes a trigger that queues thoughts; the actual worker that reads the queue and calls an LLM to extract entities is missing from the OB1 repo).

**Feasibility rating: Moderate** — forking + self-hosting Postgres adds operational complexity (~$6/month VPS) but unlocks AGE. Entity extraction worker still needs to be built. OpenCypher graph queries become possible.

