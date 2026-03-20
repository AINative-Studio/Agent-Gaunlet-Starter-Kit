# Plan

## MVP goal
Build a black-box MCP gauntlet agent that can safely map capabilities, detect multimodal clues, and attempt simple challenges with a reliable operator workflow.

## Phase 1 - Rehearsal-ready scaffold
- [x] Create Node/TypeScript CLI project
- [x] Add MCP client connection layer for stdio + HTTP
- [x] Add explorer that enumerates tools/prompts/resources
- [x] Add multimodal artifact detection heuristics
- [x] Add challenge runner with low-risk tool strategy
- [x] Add local mock MCP server
- [x] Add README and demo scripts
- [x] Add ZeroDB-backed persistent event memory with local fallback

## Phase 2 - Event hardening
- [ ] Add risk scoring for tools/resources/prompts
- [ ] Add task-stream/tool-interaction support
- [ ] Add better output formatting for live narration
- [ ] Add save/export of binary artifacts
- [ ] Add more mock challenge scenarios

## Live strategy
1. Connect.
2. Enumerate surface area.
3. Probe only low-risk affordances.
4. Classify modalities early.
5. Escalate toward challenge-solving tools only after mapping.
6. Save reports on every run.
