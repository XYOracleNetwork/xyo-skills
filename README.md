# Rock Paper Scissors Skill Test

Test bed for evaluating a 4-tier Claude Code skill stack for XL1 blockchain development.

## Evaluation Prompt

> Build me a rock paper scissors game where I can compete against other players. Each game's moves and outcomes should be recorded on the XL1 Blockchain. Include a UI for playing games and viewing past results.

## Skill Stack

```
Layer 4: XL1 Knowledge    — chain, datalakes, gateway, wallet, development patterns
Layer 3: XYO Knowledge    — payloads, bound witnesses, modules, identity, best practices
Layer 2: XY Toolchain     — @xylabs/toolchain, ESLint, TypeScript config, Vitest
Layer 1: Development      — TypeScript, Git, testing, workflow conventions
```

Skills are in `.claude/skills/` and use progressive loading — each `SKILL.md` routes to sub-files on demand.
