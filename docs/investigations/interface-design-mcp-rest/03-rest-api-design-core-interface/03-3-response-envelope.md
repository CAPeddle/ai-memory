### 3.3 Response Envelope

```json
{
  "data": { ... },
  "meta": {
    "cursor": "01HXY...",
    "total": 42,
    "took_ms": 12
  },
  "errors": null
}
```

Error response:
```json
{
  "data": null,
  "errors": [
    {
      "code": "MEMORY_NOT_FOUND",
      "message": "No memory found with id '01HXY...'",
      "field": "id"
    }
  ]
}
```

