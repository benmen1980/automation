#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
console.log('Installed repository Git hooks at .githooks.');
console.log('Set CODEX_SCOPE=PLATFORM/ADMIN or CODEX_SCOPE=AUTOMATION with CODEX_AUTOMATION_ID before pushing.');
