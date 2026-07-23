#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_NAME="${1:?Usage: create-dynamodb-finalization-for-integration.sh <integration-name>}"
: "${AWS_REGION:=eu-west-1}"
TABLE_NAME="${FINALIZATION_TABLE_NAME:-${INTEGRATION_NAME}-finalization}"

if ! aws dynamodb describe-table --table-name "${TABLE_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  aws dynamodb create-table \
    --table-name "${TABLE_NAME}" \
    --attribute-definitions AttributeName=executionId,AttributeType=S \
    --key-schema AttributeName=executionId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${AWS_REGION}" >/dev/null
  aws dynamodb wait table-exists --table-name "${TABLE_NAME}" --region "${AWS_REGION}"
fi

aws dynamodb update-time-to-live \
  --table-name "${TABLE_NAME}" \
  --time-to-live-specification Enabled=true,AttributeName=expiresAt \
  --region "${AWS_REGION}" >/dev/null 2>&1 || true

echo "Created or verified DynamoDB finalization table ${TABLE_NAME} with TTL field expiresAt."
