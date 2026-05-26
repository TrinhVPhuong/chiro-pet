# Product Context: Chiro-Pet

## Purpose
Chiro-Pet exists to provide users with a lively, interactive, and personalized virtual companion directly on their desktop. It aims to reduce loneliness, provide proactive assistance/reminders, and create an emotional bond through a simulated relationship without disrupting the user's daily digital workflow.

## Problems Solved
- **Workflow Disruption:** Traditional desktop pets often get in the way. Chiro-Pet uses transparent overlays and dynamic click-through mechanisms (Hitbox calculation & Cursor polling) to ensure it only intercepts clicks when intended.
- **Privacy Concerns:** By being "Offline-first", it guarantees that user interaction data, habits, and preferences stay on the local machine.
- **Stale Interactions:** Static pets become boring. Chiro-Pet introduces dynamic states (Mood, Energy, Affinity) and relationship stages (from Stranger to Bonded) to keep interactions fresh and meaningful.

## Character Business Logic
The virtual entity is defined by several systems:
1. **Static Identity:** Personality Archetype, Speaking Style, Core Values & Taboos.
2. **Dynamic State:** 
   - *Mood (-100 to 100)*: Short term emotional state.
   - *Energy (0 to 100)*: Diminishes with activity, recharges with rest.
   - *Affinity/Trust/Familiarity*: Long-term relationship metrics.
3. **Relationship Stages:** Stranger -> Acquaintance -> Friend -> Close -> Bonded.

## Behavior & Interaction Models
- **Proactivity:** Character can initiate actions based on a calculated `proactivity_score` (Relevance + Importance + Availability + Relationship - Penalties). Constrained by a daily budget depending on the mode.
- **Idle Behavior:** Random actions (blinking, looking around, yawning) based on context to maintain the illusion of life.
- **User Reactions:** Reacts to Clicks, Drag & Drop, Hover, and Chat messages.
- **Modes:** Adapts to user activities via distinct modes (Normal, Focus, Gaming, Meeting, Watching, Private, Sleep).