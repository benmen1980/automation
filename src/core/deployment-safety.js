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

function notificationEmailSendingEnabled() {
  return policy.notificationEmailSendingEnabled === true;
}

function assertNotificationEmailSendingAllowed() {
  if (!notificationEmailSendingEnabled()) throw Object.assign(
    new Error('שליחת מיילי ניסיון והתראות מושבתת בפריסה זו.'),
    { statusCode: 503, code: 'EMAIL_SENDING_DISABLED' }
  );
}

function recipientManagementEnabled() {
  return policy.recipientManagementEnabled === true;
}

function assertRecipientManagementAllowed() {
  if (!recipientManagementEnabled()) throw Object.assign(
    new Error('שינוי רשימת התפוצה מושבת בפריסה זו.'),
    { statusCode: 503, code: 'RECIPIENT_MANAGEMENT_DISABLED' }
  );
}

module.exports = { emailSendingEnabled, assertEmailSendingAllowed,
  notificationEmailSendingEnabled, assertNotificationEmailSendingAllowed,
  recipientManagementEnabled, assertRecipientManagementAllowed,
  verificationEmailsEnabled: () => policy.verificationEmailsEnabled === true,
  schedulerEnabled: () => policy.schedulerEnabled === true,
  watchdogEnabled: () => policy.watchdogEnabled === true };
