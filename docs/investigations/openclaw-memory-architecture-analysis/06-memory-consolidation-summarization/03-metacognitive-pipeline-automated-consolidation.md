### Metacognitive Pipeline (Automated Consolidation)

```
Conversation → Metabolism (extract facts + gaps)
                    ↓                    ↓
              facts.db            pending-gaps.json
              (superseded_at        ↓
               invalidation)   Nightshift cron (23:00-08:00)
                                     ↓
                              Contemplation (3-pass: explore → reflect → synthesize)
                                     ↓
                              Growth Vectors (19 active, deduped from 902 via Jaccard)
                                     ↓
                              Crystallization (30+ day gate → permanent traits)
```

