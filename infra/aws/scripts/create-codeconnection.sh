#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=eu-west-1}"
: "${CONNECTION_NAME:=automation-github}"

aws codestar-connections create-connection \
  --provider-type GitHub \
  --connection-name "${CONNECTION_NAME}" \
  --region "${AWS_REGION}"

echo "Open the AWS Console and complete the pending GitHub connection handshake."
