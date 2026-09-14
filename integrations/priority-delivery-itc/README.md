# שליחת וואצפ מתעודת משלוח

Automation `aut_11928873df0ae7ea`, integration key `int_1a8136b51db455ee`, assigned to the owner of TUF1's source automation.

POST `/webhooks/int_1a8136b51db455ee` with `Content-Type: application/json` and the same `Priority-BPM-Token` configured for the source automation.

The payload contains `DOCUMENTS_D`: `ORDNAME`, `CURDATE`, `YARD_CUSTDES`, `YARD_PHONENUM`, `YARD_NAME`, `YARD_FAX`.
Each non-empty name/phone pair prepares one message, first contact then second. Variables are contact name, order number, and the exact CURDATE string. No date conversion, document generation, Web SDK call, or document URL is used. Missing pairs are skipped; a first-request failure prevents the second call, matching the source.

Template: https://sv1.effective-oc.com/api/v2/msg/sendMsg/tempMsg/6a4b8dc15c44e81728f3d095

Run `node --test integrations/priority-delivery-itc/test/handler.test.js` for offline contract tests. Safe modes prepare messages without external calls. Live messages use the independent SQS/Lambda worker and its durable finalization state.

Deployment uses the master branch and `integration-priority-delivery-itc` pipeline. Register the deployed automation with `node scripts/register-priority-delivery-itc.js`; it preserves configured secrets and copies the source ITC/webhook credentials to the new scope only when missing.
