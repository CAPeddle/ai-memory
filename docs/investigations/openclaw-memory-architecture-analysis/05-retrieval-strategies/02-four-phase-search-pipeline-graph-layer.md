### Four-Phase Search Pipeline (Graph Layer)

1. **Entity + Intent** (score 95): Query matches known entity AND intent keyword (birthday, phone, port, stack)
2. **Entity Facts** (score 70): Query matches entity via aliases → return all facts
3. **FTS Facts** (score 50): Full-text search across `facts_fts`
4. **FTS Relations** (score 40): Full-text search across relations

