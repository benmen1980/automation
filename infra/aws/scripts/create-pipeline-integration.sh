#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_NAME="${1:?Usage: create-pipeline-integration.sh <integration-name>}"
: "${AWS_REGION:=eu-west-1}"
: "${REPO_ID:=benmen1980/automation}"
: "${BRANCH:=master}"
: "${CODECONNECTION_ARN:?Set CODECONNECTION_ARN.}"
: "${PIPELINE_ROLE_ARN:?Set PIPELINE_ROLE_ARN.}"
: "${CODEBUILD_ROLE_ARN:?Set CODEBUILD_ROLE_ARN.}"
: "${ARTIFACT_BUCKET:?Set ARTIFACT_BUCKET.}"

if [[ ! "${INTEGRATION_NAME}" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Integration name may contain only lowercase letters, numbers, and hyphens." >&2
  exit 2
fi

PROJECT_NAME="integration-${INTEGRATION_NAME}"
PIPELINE_NAME="integration-${INTEGRATION_NAME}"
SOURCE_ACTION_NAME="Source"
EXTRA_SOURCE_PATHS_JSON=""
EXTRA_SOURCE_PATHS_LABEL=""
if [[ "${INTEGRATION_NAME}" == "priority-order-itc" ]]; then
  EXTRA_SOURCE_PATHS_JSON=', "src/integrations/tuf1/priority-quote-whatsapp/**", "scripts/sync-integration-db.js"'
  EXTRA_SOURCE_PATHS_LABEL=", src/integrations/tuf1/priority-quote-whatsapp/**, scripts/sync-integration-db.js"
fi
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

cat >"${TMP_DIR}/codebuild.json" <<JSON
{
  "name": "${PROJECT_NAME}",
  "serviceRole": "${CODEBUILD_ROLE_ARN}",
  "source": { "type": "CODEPIPELINE", "buildspec": "buildspec-lambda-integration.yml" },
  "artifacts": { "type": "CODEPIPELINE" },
  "environment": {
    "type": "LINUX_CONTAINER",
    "computeType": "BUILD_GENERAL1_SMALL",
    "image": "aws/codebuild/standard:7.0",
    "environmentVariables": [
      { "name": "INTEGRATION_NAME", "value": "${INTEGRATION_NAME}", "type": "PLAINTEXT" }
    ]
  }
}
JSON

if aws codebuild batch-get-projects --names "${PROJECT_NAME}" --region "${AWS_REGION}" --query 'projects[0].name' --output text | grep -qx "${PROJECT_NAME}"; then
  aws codebuild update-project --cli-input-json "file://${TMP_DIR}/codebuild.json" --region "${AWS_REGION}" >/dev/null
else
  aws codebuild create-project --cli-input-json "file://${TMP_DIR}/codebuild.json" --region "${AWS_REGION}" >/dev/null
fi

cat >"${TMP_DIR}/pipeline.json" <<JSON
{
  "pipeline": {
    "name": "${PIPELINE_NAME}",
    "roleArn": "${PIPELINE_ROLE_ARN}",
    "artifactStore": { "type": "S3", "location": "${ARTIFACT_BUCKET}" },
    "pipelineType": "V2",
    "executionMode": "SUPERSEDED",
    "stages": [
      {
        "name": "Source",
        "actions": [{
          "name": "${SOURCE_ACTION_NAME}",
          "actionTypeId": { "category": "Source", "owner": "AWS", "provider": "CodeStarSourceConnection", "version": "1" },
          "configuration": {
            "ConnectionArn": "${CODECONNECTION_ARN}",
            "FullRepositoryId": "${REPO_ID}",
            "BranchName": "${BRANCH}",
            "DetectChanges": "false"
          },
          "outputArtifacts": [{ "name": "SourceOutput" }],
          "runOrder": 1
        }]
      },
      {
        "name": "BuildAndDeploy",
        "actions": [{
          "name": "BuildAndDeployWorker",
          "actionTypeId": { "category": "Build", "owner": "AWS", "provider": "CodeBuild", "version": "1" },
          "configuration": { "ProjectName": "${PROJECT_NAME}" },
          "inputArtifacts": [{ "name": "SourceOutput" }],
          "outputArtifacts": [{ "name": "BuildOutput" }],
          "runOrder": 1
        }]
      }
    ],
    "triggers": [{
      "providerType": "CodeStarSourceConnection",
      "gitConfiguration": {
        "sourceActionName": "${SOURCE_ACTION_NAME}",
        "push": [{
          "branches": { "includes": ["${BRANCH}"] },
          "filePaths": { "includes": [
            "integrations/${INTEGRATION_NAME}/**",
            "packages/shared/**",
            "infra/aws/integrations/${INTEGRATION_NAME}/**",
            "buildspec-lambda-integration.yml"${EXTRA_SOURCE_PATHS_JSON}
          ] }
        }]
      }
    }]
  }
}
JSON

if aws codepipeline get-pipeline --name "${PIPELINE_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  aws codepipeline update-pipeline --cli-input-json "file://${TMP_DIR}/pipeline.json" --region "${AWS_REGION}" >/dev/null
else
  aws codepipeline create-pipeline --cli-input-json "file://${TMP_DIR}/pipeline.json" --region "${AWS_REGION}" >/dev/null
fi

echo "Created or updated independent pipeline ${PIPELINE_NAME}."
echo "Watched paths: integrations/${INTEGRATION_NAME}/**, packages/shared/**, infra/aws/integrations/${INTEGRATION_NAME}/**, buildspec-lambda-integration.yml${EXTRA_SOURCE_PATHS_LABEL}"
