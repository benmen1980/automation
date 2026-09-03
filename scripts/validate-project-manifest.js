#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_FILE = path.join(ROOT, 'project.manifest.json');
const REQUIRED_CREATION_STEPS = [
  'identify_members',
  'declare_member_credentials',
  'declare_member_tests',
  'define_member_data_contracts',
  'define_full_flow_test',
  'define_unified_logging',
  'generate_automation_package',
  'validate_package',
  'provision_isolated_resources',
  'deploy_independent_pipeline',
  'run_full_flow_verification',
  'register_automation',
];
const REQUIRED_MEMBER_FIELDS = [
  'id',
  'purpose',
  'credentials',
  'tests',
  'input_contract',
  'output_contract',
  'failure_behavior',
  'logging',
];
const REQUIRED_LOG_FIELDS = [
  'automationId',
  'executionId',
  'memberId',
  'step',
  'status',
  'timestamp',
];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(manifest, key, errors) {
  if (!isObject(manifest[key])) errors.push(`${key} must be an object.`);
  return isObject(manifest[key]) ? manifest[key] : {};
}

function requireArray(manifest, key, errors) {
  if (!Array.isArray(manifest[key]) || manifest[key].length === 0) errors.push(`${key} must be a non-empty array.`);
  return Array.isArray(manifest[key]) ? manifest[key] : [];
}

function requireStrings(values, label, errors) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'string' || value.trim() === '')) {
    errors.push(`${label} must contain non-empty strings.`);
  }
}

function validate(manifest) {
  const errors = [];
  if (manifest.manifest_schema !== 1) errors.push('manifest_schema must be 1.');
  if (typeof manifest.project !== 'string' || !manifest.project.trim()) errors.push('project must be a non-empty string.');

  const creation = requireObject(manifest, 'automation_creation', errors);
  if (creation.source !== 'chatgpt_prompt') errors.push('automation_creation.source must be chatgpt_prompt.');
  if (creation.admin_creates_automations !== false) errors.push('automation_creation.admin_creates_automations must be false.');
  const flow = requireArray(creation, 'required_flow', errors);
  for (const step of REQUIRED_CREATION_STEPS) if (!flow.includes(step)) errors.push(`automation_creation.required_flow must include ${step}.`);
  requireArray(creation, 'block_if', errors);

  const member = requireObject(manifest, 'member_contract', errors);
  const memberFields = requireArray(member, 'required_fields', errors);
  for (const field of REQUIRED_MEMBER_FIELDS) if (!memberFields.includes(field)) errors.push(`member_contract.required_fields must include ${field}.`);
  if (member.implementation !== 'automation_specific') errors.push('member_contract.implementation must be automation_specific.');
  if (member.reference_implementations !== false) errors.push('member_contract.reference_implementations must be false.');

  const tests = requireObject(manifest, 'test_contract', errors);
  if (tests.member_tests_required !== true) errors.push('test_contract.member_tests_required must be true.');
  if (tests.full_flow_test_required !== true) errors.push('test_contract.full_flow_test_required must be true.');
  requireStrings(tests.modes, 'test_contract.modes', errors);
  requireStrings(tests.full_flow_must_verify, 'test_contract.full_flow_must_verify', errors);

  const logging = requireObject(manifest, 'logging_contract', errors);
  if (logging.event_schema !== 'automation.log') errors.push('logging_contract.event_schema must be automation.log.');
  const logFields = requireArray(logging, 'required_fields', errors);
  for (const field of REQUIRED_LOG_FIELDS) if (!logFields.includes(field)) errors.push(`logging_contract.required_fields must include ${field}.`);
  if (logging.secret_redaction_required !== true) errors.push('logging_contract.secret_redaction_required must be true.');

  const isolation = requireObject(manifest, 'isolation', errors);
  for (const key of ['code', 'database', 'credentials', 'runtime', 'queue', 'logs', 'iam', 'deployment']) {
    if (typeof isolation[key] !== 'string' || !isolation[key].trim()) errors.push(`isolation.${key} must be a non-empty string.`);
  }

  const shared = requireObject(manifest, 'shared_platform', errors);
  requireStrings(shared.database_contains, 'shared_platform.database_contains', errors);
  requireStrings(shared.database_must_not_contain, 'shared_platform.database_must_not_contain', errors);
  requireStrings(shared.admin_responsibilities, 'shared_platform.admin_responsibilities', errors);

  const layout = requireObject(manifest, 'repository_layout', errors);
  for (const key of ['automation_package', 'automation_runtime', 'automation_database', 'automation_tests', 'automation_deployment', 'shared_runtime', 'platform_runtime', 'platform_ui']) {
    if (typeof layout[key] !== 'string' || !layout[key].trim()) errors.push(`repository_layout.${key} must be a non-empty string.`);
  }

  const provisioning = requireObject(manifest, 'provisioning', errors);
  if (provisioning.owner !== 'chatgpt_project') errors.push('provisioning.owner must be chatgpt_project.');
  if (provisioning.must_be_repeatable !== true) errors.push('provisioning.must_be_repeatable must be true.');
  if (provisioning.must_record_resource_references !== true) errors.push('provisioning.must_record_resource_references must be true.');
  if (provisioning.must_verify_before_registration !== true) errors.push('provisioning.must_verify_before_registration must be true.');
  if (provisioning.database_migration_owner !== 'automation_package') errors.push('provisioning.database_migration_owner must be automation_package.');

  const gitWorkflow = requireObject(manifest, 'git_workflow', errors);
  if (gitWorkflow.repository_count !== 1) errors.push('git_workflow.repository_count must be 1.');
  if (gitWorkflow.canonical_remote !== 'origin') errors.push('git_workflow.canonical_remote must be origin.');
  if (gitWorkflow.branch_count !== 1) errors.push('git_workflow.branch_count must be 1.');
  for (const key of ['branch', 'pull_branch', 'push_branch']) {
    if (gitWorkflow[key] !== 'master') errors.push(`git_workflow.${key} must be master.`);
  }
  if (gitWorkflow.promotion !== 'push_to_master_triggers_staging_pipeline') errors.push('git_workflow.promotion must be push_to_master_triggers_staging_pipeline.');
  if (gitWorkflow.feature_branches_allowed !== false) errors.push('git_workflow.feature_branches_allowed must be false.');
  if (gitWorkflow.direct_staging_changes_allowed !== false) errors.push('git_workflow.direct_staging_changes_allowed must be false.');

  return errors;
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  } catch (error) {
    console.error(`Unable to read ${path.relative(ROOT, MANIFEST_FILE)}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const errors = validate(manifest);
  if (errors.length) {
    console.error(`Project manifest validation failed with ${errors.length} error(s):`);
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(`Validated ${path.relative(ROOT, MANIFEST_FILE)} and its ChatGPT automation contract.`);
}

if (require.main === module) main();

module.exports = { validate };
