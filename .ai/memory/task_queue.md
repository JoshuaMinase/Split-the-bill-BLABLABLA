# Task Queue

## Format
Each task block:
```
[TASK-ID] title
status: pending | in_progress | done | failed
assigned_to: kiro | gemini | devin | opencode | kilocode
priority: high | medium | low
description: ...
output_file: .ai/outputs/TASK-ID.md
created_at: YYYY-MM-DD HH:MM
updated_at: YYYY-MM-DD HH:MM
```

---
<!-- Tasks are managed automatically by orchestrator.py -->
<!-- Kiro (PM) writes tasks here; agents pick them up -->
