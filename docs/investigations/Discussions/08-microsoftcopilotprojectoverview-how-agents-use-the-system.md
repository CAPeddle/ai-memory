## How Agents Use the System

Agents do not navigate tiers.  
They interact with **views and the brain directly**.

### Typical Agent Loop

1. **Read intent**
   - Query the Storyboard to understand current goals and tasks

2. **Retrieve context**
   - Query the Brain using hybrid search (BM25 + vector)
   - Apply structural filters (project, repo, timeframe)

3. **Optional semantic compression**
   - Read relevant Wiki entries for stabilized knowledge

4. **Act**
   - Modify code, investigate issues, generate output

5. **Write memory**
   - Append new shards to the Brain
   - Update Storyboard state via REST/MCP tools

The Brain remains authoritative throughout.

---

