# Restart Skill

`scripts/restart-skill.js` is a restart helper that:

- runs one or more candidate restart commands,
- saves every attempt (success + failures) in `RESTART_APP_HISTORY_PATH`,
- uses that history to reorder command priority on future runs by deprioritizing recently failing commands.

Run it with:

```bash
npm run skill:restart-app
```

To configure commands and learning behavior, set these variables:

- `RESTART_APP_COMMANDS` (required): semicolon-separated list of commands to try.
- `RESTART_APP_HISTORY_PATH`: file path where history is stored.
- `RESTART_APP_HISTORY_LIMIT`: max attempts kept in history.
- `RESTART_APP_HISTORY_WINDOW_MS`: recency window used to penalize old failures.
- `RESTART_APP_COMMAND_TIMEOUT_MS`: timeout for each command (ms).

Every run is append-only and persists back to the history file. When a command succeeds, the skill stops and records that success for later learning. When all commands fail, history is still written so the next run can learn from each failed attempt.
