# NEXUM Part 7 — Merge Instructions

Скопируй файлы в корень проекта nexum-bot/:

```
src/agent/policies/safety.ts        → src/agent/policies/safety.ts
src/agent/policies/path-policy.ts   → src/agent/policies/path-policy.ts
src/agent/policies/exec-approvals.ts → src/agent/policies/exec-approvals.ts
src/agent/policies/audit.ts         → src/agent/policies/audit.ts
src/agent/policies/tool-policy.ts   → src/agent/policies/tool-policy.ts
src/infra/monitor.ts                → src/infra/monitor.ts
pc_agent/utils/websocket_client.py  → pc_agent/utils/websocket_client.py
pc_agent/policies/path_policy.py    → pc_agent/policies/path_policy.py
pc_agent/policies/blocked_commands.py → pc_agent/policies/blocked_commands.py
pc_agent/state/user.json            → pc_agent/state/user.json
```

Эти файлы ДОПОЛНЯЮТ существующий ZIP — не заменяют!
