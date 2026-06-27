#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_NAME="${1:?Usage: create-eventbridge-schedule-for-integration.sh <integration-name> <schedule-expression>}"
SCHEDULE_EXPRESSION="${2:?Usage: create-eventbridge-schedule-for-integration.sh <integration-name> <schedule-expression>}"
: "${AWS_REGION:=eu-west-1}"

echo "Create EventBridge schedule for ${INTEGRATION_NAME}:"
echo "- Region: ${AWS_REGION}"
echo "- Schedule expression: ${SCHEDULE_EXPRESSION}"
echo "- Target: enqueue message to ${INTEGRATION_NAME}-queue"
echo "- Payload: {\"jobType\":\"scheduled-integration\",\"integrationSlug\":\"${INTEGRATION_NAME}\"}"
echo "Wire account-specific scheduler role ARN and SQS queue ARN before running in AWS."
