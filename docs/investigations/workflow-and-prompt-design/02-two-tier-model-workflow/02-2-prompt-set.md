### 2.2 Prompt Set

`/plan-new` is an intake helper, not a replacement for `/plan`. It adds a story, creates a seed query packet, and stops. Full planning still happens in `/plan` after additional PO back-and-forth.

```
┌──────────────────────────────────────────────────────────────────┐
│                        PO (Human)                                 │
│                                                                    │
│  Decides what to build, adds stories, approves plans, gates execution│
└──────────────┬────────────────────────────┬───────────────────────┘
               │                            │
    ┌──────────▼──────────┐
    │ /plan-new (Opus)    │
    │                     │
    │ • Story intake      │
    │ • Targeted research │
    │ • PO priority scope │
    │ • Seed query packet │
    └──────────┬──────────┘
           │ Creates story + query packet
           ▼
    ┌──────────▼──────────┐     ┌───────────▼──────────────┐
    │  /plan (Opus)       │     │  /recover (Opus)         │
    │                     │     │                          │
    │  • Scoping rounds   │     │  • Session forensics     │
    │  • Story creation   │     │  • Timeline construction │
    │  • ExecPlan writing │     │  • Avoidance rules       │
    │  • Plan-review fix  │     │  • Recovery annotation   │
    └──────────┬──────────┘     └──────────────────────────┘
           │ Produces ExecPlan
           ▼
    ┌────────────────────────┐
    │  /continue (Sonnet)    │
    │                        │
    │  • Find Ready plans    │
    │  • Execute tasks       │
    │  • Atomic commits      │
    │  • Plan-review escal.  │
    └────────────────────────┘
```

