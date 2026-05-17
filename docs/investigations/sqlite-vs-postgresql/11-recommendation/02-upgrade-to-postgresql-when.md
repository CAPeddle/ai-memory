### Upgrade to PostgreSQL when:
- ⬜ Service becomes multi-user (team memory server)
- ⬜ Vector search at >100K embeddings needs sub-10ms HNSW performance
- ⬜ Write concurrency from >5 simultaneous heavy writers
- ⬜ Cloud deployment with managed database (RDS, Cloud SQL, Azure Database)
- ⬜ Advanced FTS features needed (synonyms, domain-specific dictionaries, fuzzy matching)

