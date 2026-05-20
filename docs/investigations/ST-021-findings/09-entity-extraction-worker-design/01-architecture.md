### Architecture

The entity extraction worker is a Deno process that runs inside the Docker container alongside the MCP server. It polls `entity_extraction_queue` for `status = 'pending'` rows and processes them.

