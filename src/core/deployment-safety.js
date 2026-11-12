const policy = require('../../config/deployment-safety.json');

function emailSendingEnabled() {
  return policy.emailSendingEnabled === true;
}

function assertEmailSendingAllowed() {
  if (!emailSendingEnabled()) throw Object.assign(
    new Error('שליחת מיילים ובקשות אימות מושבתת בפריסה זו.'),
    { statusCode: 503, code: 'EMAIL_SENDING_DISABLED' }
  );
}

module.exports = { emailSendingEnabled, assertEmailSendingAllowed,
  backgroundJobsEnabled: () => policy.backgroundJobsEnabled === true };
