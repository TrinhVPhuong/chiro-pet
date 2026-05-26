# AI Agent Architectural Enforcement Protocol

> **🚨 CRITICAL DIRECTIVE FOR CLINE/AI AGENT 🚨**
> This rule is automatically loaded at the start of EVERY session. 
> You **MUST NOT** proceed with any implementation, bug fixing, or architectural decisions without fulfilling this requirement first.

## 1. The Core Dependency Hook
When evaluating a user's request (especially when starting a new task or phase), you are **REQUIRED** to mentally map the task to the project's subsystems.

To do this accurately, you **MUST** read the following file before proposing a plan or writing code:
**`docs/specifications/core_business_specification.md`**

## 2. Actionable Steps for AI
1. **Read the Core Spec:** If the user asks you to implement a feature, read `core_business_specification.md`.
2. **Consult the Dependency Map:** Locate "Section 14. Subsystem dependency map" in that file. Identify which subsystems are affected by the current task.
3. **Read Specific Specs:** Based on the map, use the `read_file` tool to ingest the specific Markdown files for those affected subsystems (e.g., `state-system.md`, `privacy-system.md`) from `docs/specifications/`.
4. **Implement Safely:** Once you have the specific context, you may begin implementation.

## 3. Core Principles to Remember
- **AI Proposes, App Decides:** You (the AI/LLM integration within the app) do NOT write directly to the database or trigger raw OS notifications.
- **Local-first & Privacy-first:** Sensitive memory requires user approval. Desktop context is sanitized.

*Failure to follow this rule will result in architectural degradation and hallucinated implementations.*