#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_NAME="${1:?Usage: create-fargate-integration.sh <integration-name>}"
: "${AWS_REGION:=eu-west-1}"
: "${CLUSTER_NAME:=automation-integrations}"

aws ecs create-cluster --cluster-name "${CLUSTER_NAME}" --region "${AWS_REGION}" >/dev/null
echo "Created/confirmed ECS cluster ${CLUSTER_NAME} for heavy integration ${INTEGRATION_NAME}."
echo "Build and push an image for integrations/${INTEGRATION_NAME}, then register a task definition that runs its worker entrypoint."
