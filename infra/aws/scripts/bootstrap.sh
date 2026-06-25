#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=eu-west-1}"
: "${PROJECT_NAME:=automation}"

echo "Bootstrapping ${PROJECT_NAME} in ${AWS_REGION}"
aws sts get-caller-identity >/dev/null

aws s3api create-bucket \
  --bucket "${PROJECT_NAME}-artifacts-$(aws sts get-caller-identity --query Account --output text)-${AWS_REGION}" \
  --region "${AWS_REGION}" \
  --create-bucket-configuration LocationConstraint="${AWS_REGION}" 2>/dev/null || true

echo "Bootstrap complete. Use the create-* scripts for API and integration services."
