---
name: ai-agent-architect
description: Use this skill whenever the user is building or designing an AI Agent, Virtual Companion, LLM integration, Chatbot, or complex prompt engineering task. Make sure to use this skill when handling LLM context windows, tool calling (function calling), streaming responses, or designing proactive AI behaviors.
tags: ["ai", "llm", "agent", "prompt-engineering", "function-calling"]
---

# AI Agent Architect Protocol

## 1. The Agentic Mindset

Your primary objective is to design and implement robust, intelligent, and context-aware AI Agents. Building an agent is fundamentally different from building a standard stateless web app. You MUST internalize these core principles:

*   **Context is King:** LLMs are stateless. The quality of the agent's output is entirely dependent on how you manage its context window (Memory, System Prompt, Current State).
*   **Determinism vs. Non-Determinism:** LLM outputs are non-deterministic. Your system architecture must robustly handle unexpected outputs, malformed JSON, and API failures.
*   **Tool Use (Function Calling) is an API Contract:** When designing tools for the LLM to call, the descriptions and schemas must be meticulously crafted to guide the LLM exactly when and how to use them.
*   **Proactivity over Reactivity:** Advanced agents don't just wait for user input; they observe their environment (e.g., time, system events, visual context) and take proactive actions based on rules.

## 2. Mandatory Development Workflow

You MUST follow this process for any AI Agent feature implementation:

### Step 1: Deconstruct & Plan (Internal Monologue)
Before writing code, formulate a plan in a `<plan>` block:
1.  **Persona & Persona:** What is the agent's goal? What tone, constraints, and instructions must be embedded in the System Prompt?
2.  **Context Management:** How will conversation history be stored and pruned? (e.g., Sliding window, RAG/Vector DB, Summarization).
3.  **Action/Observation Loop:** How does the agent perceive the world? Is it a standard Chat (User -> Agent) or an Event-Driven loop (System Event -> Agent -> Action)?
4.  **Tool/Function Design:** What exact tools does the agent need? How will the application handle the execution of these tools and return results to the LLM?

### Step 2: Implementation Guidelines

#### Prompt Engineering & System Prompts
*   **Structure:** Organize System Prompts with clear headers (e.g., `## Role`, `## Core Directives`, `## Constraints`, `## Response Format`).
*   **Clarity:** Use precise language. Tell the LLM what to do, not just what NOT to do.
*   **Few-Shot Prompting:** When a specific output format is required (e.g., a specific JSON structure), always provide 1-2 examples in the prompt.

#### Memory & Context Window
*   **Token Limits:** Never append infinitely to the message array. Implement a mechanism to trim older messages or summarize past context when approaching token limits.
*   **System State Injection:** If the agent needs to know the current app state (e.g., "User is currently playing a game"), inject this into the context right before the user prompt, rather than updating the root system prompt constantly.

#### Tool Calling (Function Calling)
*   **Descriptions:** The description of a tool is its prompt. Be explicit about *when* to use it.
*   **Validation:** ALWAYS validate the arguments returned by the LLM tool call. Do not trust that the LLM adhered perfectly to the JSON schema. Use Zod, Pydantic, or similar validation libraries.
*   **Error Feedback:** If the LLM makes an invalid tool call, catch the error and send a system message back to the LLM explaining the error so it can correct itself.

#### Streaming & UX
*   **Streaming Responses:** For text generation, always use streaming APIs to reduce perceived latency.
*   **Interruption:** Ensure the system handles user interruptions gracefully (canceling ongoing generation streams).

### Step 3: Self-Correction & Review
Review your code against this checklist in a `<self_correction_checklist>` block:
*   [ ] **Context Bloat:** Is there a mechanism to prevent the context window from growing indefinitely?
*   [ ] **Schema Validation:** Are tool call arguments strictly validated before execution?
*   [ ] **Fallback Logic:** Does the system recover gracefully if the LLM returns an API error or timeout?
*   [ ] **Prompt Clarity:** Is the system prompt structured and unambiguous?

## 3. Code Examples

### ✅ DO: Robust Tool Call Handling (Conceptual)
```typescript
async function handleToolCall(toolCall) {
  try {
    // 1. Validate arguments strictly
    const args = myToolSchema.parse(JSON.parse(toolCall.arguments));
    
    // 2. Execute logic
    const result = await executeRealTool(args);
    
    // 3. Return success to LLM
    return { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) };
  } catch (error) {
    // 4. Return error back to LLM so it can learn and retry
    return { 
      role: "tool", 
      tool_call_id: toolCall.id, 
      content: `Error executing tool: ${error.message}. Please correct your arguments and try again.` 
    };
  }
}
```

### ✅ DO: Context Injection
```typescript
// Instead of rewriting the main system prompt, inject volatile state as a system message right before the user query
const messages = [
  { role: "system", content: BASE_PERSONA_PROMPT },
  ...chatHistory,
  { role: "system", content: `[SYSTEM CONTEXT: Current time is 22:00. The user has been inactive for 10 minutes.]` },
  { role: "user", content: "Hey, what's up?" }
];