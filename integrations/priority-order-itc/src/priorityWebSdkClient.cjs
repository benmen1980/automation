const priority = require('priority-web-sdk');
const { sanitizeProviderString } = require('./itcClient.cjs');

const DEFAULT_ORDER_SORT_OPTION = 'By Order Number';
const PRINT_FORMAT_CODE = -109;
const PRINT_AS_PDF = 1;
const MAX_PROCEDURE_STEPS = 12;

const STAGE_LABELS = {
  login: 'login',
  'procedure-start': 'WWWSHOWORDER startup',
  'initial-options': 'initial option selection',
  'sort-selection': 'Sort selection',
  'parameter-submission': 'order parameter submission',
  'procedure-message': 'Priority procedure validation',
  'document-options': 'document format selection',
  'report-options': 'report format selection',
  'procedure-continue': 'procedure continuation',
  'document-url': 'document URL generation',
};

const STAGE_NEXT_STEPS = {
  login: 'Use Test Priority Web SDK login and verify the saved URL, company, app name, username, and password.',
  'procedure-start': 'Ask the Priority administrator to confirm that this user can run WWWSHOWORDER.',
  'initial-options': 'Confirm that the selected Priority language and WWWSHOWORDER defaults are valid for this user.',
  'sort-selection': 'Check the Order Sort Option setting against the choices returned by Priority.',
  'parameter-submission': 'Confirm that ORDNAME identifies an existing sales order and that the required Sort choice is available.',
  'procedure-message': 'Correct the order or procedure setting described by Priority, then run the test again.',
  'document-options': 'Ask the Priority administrator to configure an active WWWSHOWORDER document format.',
  'report-options': 'Ask the Priority administrator to configure an active WWWSHOWORDER report format.',
  'procedure-continue': 'Run the test again; if the same step fails, check the WWWSHOWORDER configuration and permission.',
  'document-url': 'Confirm that the selected WWWSHOWORDER format is allowed to generate a PDF document URL.',
};

function requiredText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`Missing ${label} credential.`);
  return text;
}

function getConfiguration(credentials = {}) {
  const rawUrl = requiredText(credentials.PRIORITY_WEB_SDK_URL, 'Priority Web SDK URL');
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error('Priority Web SDK URL must be a valid HTTPS URL.');
  }
  if (parsedUrl.protocol !== 'https:') throw new Error('Priority Web SDK URL must use HTTPS.');

  const language = Number(credentials.PRIORITY_WEB_SDK_LANGUAGE || 3);
  if (!Number.isInteger(language) || language < 1) {
    throw new Error('Priority Web SDK language must be a positive integer.');
  }

  const company = requiredText(credentials.PRIORITY_WEB_SDK_COMPANY, 'Priority company');
  return {
    config: {
      url: parsedUrl.toString(),
      tabulaini: String(credentials.PRIORITY_WEB_SDK_TABULAINI || 'tabula.ini').trim(),
      language,
      profile: { company },
      appname: requiredText(credentials.PRIORITY_WEB_SDK_APPNAME || company, 'Priority app name'),
      username: requiredText(credentials.PRIORITY_WEB_SDK_USERNAME, 'Priority username'),
      password: requiredText(credentials.PRIORITY_WEB_SDK_PASSWORD, 'Priority password'),
      devicename: String(credentials.PRIORITY_WEB_SDK_DEVICENAME || '').trim(),
    },
    orderSortOption: String(
      credentials.PRIORITY_WEB_SDK_ORDER_SORT_OPTION || DEFAULT_ORDER_SORT_OPTION
    ).trim(),
  };
}

function normalizeOrderName(orderName) {
  const value = String(orderName || '').trim();
  if (!value) throw new Error('Priority sales order number is required for WWWSHOWORDER.');
  return value;
}

function buildMockSalesOrderPrintUrl(orderName) {
  normalizeOrderName(orderName);
  return 'https://priority.example.test/netfiles/mock-sales-order-confirmation.pdf';
}

function replaceKnownValue(text, value) {
  const knownValue = String(value || '');
  return knownValue ? text.split(knownValue).join('***REDACTED***') : text;
}

function safePriorityErrorText(cause, credentials = {}, orderName = '') {
  const rawMessage = String(
    cause?.message || cause?.error?.message || cause?.error || cause?.type || ''
  ).trim();
  if (!rawMessage) return '';

  let safeMessage = sanitizeProviderString(rawMessage);
  for (const knownValue of [
    credentials.PRIORITY_WEB_SDK_PASSWORD,
    credentials.PRIORITY_WEB_SDK_USERNAME,
    orderName,
  ]) {
    safeMessage = replaceKnownValue(safeMessage, knownValue);
  }
  return safeMessage.slice(0, 600);
}

function explainPriorityMessage(message) {
  if (/מיון.*חובה/u.test(message)) {
    return 'Priority requires a value selected from the Sort choice list.';
  }
  return message;
}

function getPriorityHttpStatus(cause) {
  for (const candidate of [
    cause?.httpStatus,
    cause?.statusCode,
    cause?.status,
    cause?.response?.status,
    cause?.error?.statusCode,
    cause?.error?.status,
  ]) {
    const status = Number(candidate);
    if (Number.isInteger(status) && status >= 100 && status <= 599) return status;
  }
  return null;
}

function getPriorityErrorCode(cause) {
  for (const candidate of [
    cause?.code,
    cause?.errorCode,
    cause?.error?.code,
    cause?.response?.data?.code,
    cause?.type,
  ]) {
    const code = String(candidate || '').trim();
    if (/^[A-Za-z0-9_.-]{1,80}$/.test(code)) return code;
  }
  return '';
}

function isRetryablePriorityFailure(cause) {
  const httpStatus = getPriorityHttpStatus(cause);
  if (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500) return true;
  if (httpStatus && httpStatus >= 400) return false;
  if (typeof cause?.retryable === 'boolean') return cause.retryable;

  const signature = [
    cause?.name,
    cause?.code,
    cause?.type,
    cause?.message,
    cause?.error?.message,
  ].join(' ');
  if (
    /(?:Timeout|TimedOut|Abort|ECONNRESET|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|EAI_AGAIN|Networking|NetworkError|FetchError|ServerBusy|ServiceUnavailable|Throttl)/i.test(
      signature
    )
  ) {
    return true;
  }
  return false;
}

function priorityStageError(stage, cause, { credentials, orderName, stepType, message } = {}) {
  if (cause?.providerError?.api === 'Priority Web SDK') return cause;

  const serverMessage = safePriorityErrorText(
    message ? { message } : cause,
    credentials,
    orderName
  );
  const explanation = explainPriorityMessage(serverMessage);
  const stageLabel = STAGE_LABELS[stage] || stage || 'procedure execution';
  const nextStep =
    STAGE_NEXT_STEPS[stage] ||
    'Check the Priority Web SDK settings and WWWSHOWORDER configuration, then run the test again.';
  const httpStatus = getPriorityHttpStatus(cause);
  const errorCode = getPriorityErrorCode(cause);
  const diagnosticParts = [
    httpStatus ? `HTTP ${httpStatus}` : '',
    errorCode ? `code ${errorCode}` : '',
  ].filter(Boolean);
  const diagnosticSuffix = diagnosticParts.length
    ? ` (${diagnosticParts.join(', ')})`
    : '';
  const error = new Error(
    `Priority Web SDK failed during ${stageLabel}: ${
      explanation || 'Priority did not provide an error message.'
    }${diagnosticSuffix} Next step: ${nextStep}`
  );
  error.retryable = isRetryablePriorityFailure(cause);
  error.providerError = {
    api: 'Priority Web SDK',
    action: 'WWWSHOWORDER sales order confirmation',
    procedure: 'WWWSHOWORDER',
    stage,
    ...(stepType ? { stepType } : {}),
    ...(httpStatus ? { httpStatus } : {}),
    ...(errorCode ? { errorCode } : {}),
    explanation:
      explanation ||
      `Priority failed during ${stageLabel} before the ITC message could be sent.`,
    nextStep,
    ...(serverMessage ? { serverMessage } : {}),
    errorName: String(cause?.name || 'PriorityWebSdkError').slice(0, 80),
  };
  return error;
}

async function runStage(stage, action, details) {
  try {
    return await action();
  } catch (cause) {
    throw priorityStageError(stage, cause, details);
  }
}

function numericObjectValues(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value)
    .sort((left, right) => Number(left) - Number(right))
    .map((key) => value[key]);
}

function getChooseRows(result) {
  const search = result?.Search || {};
  return numericObjectValues(
    search.ChooseLine ||
      search.SearchLine ||
      search.SearchResult ||
      search.Rows
  ).filter(Boolean);
}

function optionValues(option) {
  return [
    option?.retval,
    option?.string1,
    option?.string2,
    option?.title,
    option?.name,
    option?.value,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
}

function findSortSelection(rows, configuredOption, defaultFieldValue) {
  const configured = String(configuredOption || '').trim().toLocaleLowerCase();
  const exact = rows.find((row) =>
    optionValues(row).some((value) => value.toLocaleLowerCase() === configured)
  );
  if (exact) return exact;

  const defaultValue = String(defaultFieldValue || '').trim().toLocaleLowerCase();
  if (
    configured === DEFAULT_ORDER_SORT_OPTION.toLocaleLowerCase() ||
    (defaultValue && configured === defaultValue)
  ) {
    return rows[0];
  }
  return null;
}

function getSelectedFormat(procedure) {
  const formats = Array.isArray(procedure?.formats) ? procedure.formats : [];
  return formats.find((format) => Number(format?.format) === PRINT_FORMAT_CODE) || {
    format: PRINT_FORMAT_CODE,
  };
}

function getSelectedInputOption(procedure) {
  const options = Array.isArray(procedure?.input?.Options)
    ? procedure.input.Options
    : [];
  return options.find((option) => Number(option?.selected) === 1) || options[0];
}

function getReportUrl(procedure) {
  return String(procedure?.Urls?.[0]?.url || '').trim();
}

async function resolveIntroductorySteps(procedure, details) {
  let current = procedure;
  for (let count = 0; count < 4; count += 1) {
    if (current?.type === 'inputOptions') {
      const selected = getSelectedInputOption(current);
      current = await runStage(
        'initial-options',
        () => current.proc.inputOptions(1, selected?.field ?? 1),
        { ...details, stepType: current.type }
      );
      continue;
    }
    if (current?.type === 'inputHelp') {
      current = await runStage(
        'procedure-continue',
        () => current.proc.inputHelp(1),
        { ...details, stepType: current.type }
      );
      continue;
    }
    if (!current?.type && typeof current?.proc?.inputOptions === 'function') {
      current = await runStage(
        'initial-options',
        () => current.proc.inputOptions(1, 1),
        { ...details, stepType: 'legacy-inputOptions' }
      );
      continue;
    }
    break;
  }
  return current;
}

async function submitOrderParameters(
  procedure,
  normalizedOrderName,
  orderSortOption,
  details
) {
  const inputFields = Array.isArray(procedure?.input?.EditFields)
    ? procedure.input.EditFields
    : [
        { field: 1, operator: 0, value: '' },
        { field: 2, operator: 0, value: orderSortOption },
      ];
  const orderField = inputFields.find((field) => Number(field?.field) === 1);
  const sortField = inputFields.find((field) => Number(field?.field) === 2);

  if (!orderField || !sortField || typeof procedure?.proc?.inputFields !== 'function') {
    throw priorityStageError('parameter-submission', null, {
      ...details,
      stepType: procedure?.type,
      message: 'WWWSHOWORDER did not provide the expected order and Sort input fields.',
    });
  }

  let activeProcedure = procedure;
  let selectedSortValue = orderSortOption;
  if (typeof activeProcedure.proc.choose === 'function') {
    const chooseFields = inputFields.map((field) => ({
      field: field.field,
      value:
        Number(field.field) === 1
          ? normalizedOrderName
          : Number(field.field) === 2
            ? ''
            : field.value || '',
    }));
    activeProcedure = await runStage(
      'sort-selection',
      () => activeProcedure.proc.choose(2, '', { ChooseFields: chooseFields }),
      { ...details, stepType: procedure?.type }
    );
    const choices = getChooseRows(activeProcedure);
    const selected = findSortSelection(choices, orderSortOption, sortField.value);
    selectedSortValue = optionValues(selected)[0] || '';
    if (!selectedSortValue) {
      const available = choices
        .slice(0, 5)
        .map((choice) => optionValues(choice)[0])
        .filter(Boolean)
        .join(', ');
      throw priorityStageError('sort-selection', null, {
        ...details,
        stepType: activeProcedure?.type,
        message: available
          ? `The configured Sort option was not found. Available choices: ${available}.`
          : 'Priority returned no values for the required Sort choice list.',
      });
    }
  }

  const payload = {
    EditFields: [
      {
        field: 1,
        op: Number(orderField.operator ?? 0),
        value: normalizedOrderName,
        op2: 0,
        value2: '',
      },
      {
        field: 2,
        op: Number(sortField.operator ?? 0),
        value: selectedSortValue,
        op2: 0,
        value2: '',
      },
    ],
  };
  return runStage(
    'parameter-submission',
    () => activeProcedure.proc.inputFields(1, payload),
    { ...details, stepType: activeProcedure?.type }
  );
}

async function finishProcedure(procedure, details) {
  let current = procedure;
  for (let count = 0; count < MAX_PROCEDURE_STEPS; count += 1) {
    const reportUrl = getReportUrl(current);
    if (reportUrl) return reportUrl;

    if (current?.type === 'message') {
      if (String(current.messagetype || '').toLowerCase() === 'error') {
        throw priorityStageError('procedure-message', null, {
          ...details,
          stepType: current.type,
          message: current.message,
        });
      }
      current = await runStage(
        'procedure-continue',
        () => current.proc.message(1),
        { ...details, stepType: current.type }
      );
      continue;
    }

    if (current?.type === 'documentOptions') {
      const selected = getSelectedFormat(current);
      if (selected?.format === undefined) {
        throw priorityStageError('document-options', null, {
          ...details,
          stepType: current.type,
          message: `Priority did not return print format code ${PRINT_FORMAT_CODE}.`,
        });
      }
      current = await runStage(
        'document-options',
        () => current.proc.documentOptions(1, PRINT_FORMAT_CODE, PRINT_AS_PDF),
        { ...details, stepType: current.type }
      );
      continue;
    }

    if (current?.type === 'reportOptions') {
      const selected = getSelectedFormat(current);
      if (selected?.format === undefined) {
        throw priorityStageError('report-options', null, {
          ...details,
          stepType: current.type,
          message: `Priority did not return print format code ${PRINT_FORMAT_CODE}.`,
        });
      }
      current = await runStage(
        'report-options',
        () => current.proc.reportOptions(1, PRINT_FORMAT_CODE),
        { ...details, stepType: current.type }
      );
      continue;
    }

    if (current?.type === 'inputHelp') {
      current = await runStage(
        'procedure-continue',
        () => current.proc.inputHelp(1),
        { ...details, stepType: current.type }
      );
      continue;
    }

    if (current?.type === 'inputOptions') {
      const selected = getSelectedInputOption(current);
      current = await runStage(
        'initial-options',
        () => current.proc.inputOptions(1, selected?.field ?? 1),
        { ...details, stepType: current.type }
      );
      continue;
    }

    if (current?.type === 'inputFields') {
      throw priorityStageError('parameter-submission', null, {
        ...details,
        stepType: current.type,
        message: 'Priority requested additional input fields after the order parameters were submitted.',
      });
    }

    if (current?.type === 'end' || current?.type === 'displayUrl') {
      throw priorityStageError('document-url', null, {
        ...details,
        stepType: current.type,
        message: 'WWWSHOWORDER finished without returning a document URL.',
      });
    }

    if (typeof current?.proc?.continueProc !== 'function') {
      throw priorityStageError('procedure-continue', null, {
        ...details,
        stepType: current?.type,
        message: 'Priority returned an unsupported procedure step.',
      });
    }
    current = await runStage(
      'procedure-continue',
      () => current.proc.continueProc(),
      { ...details, stepType: current?.type || 'unknown' }
    );
  }

  throw priorityStageError('document-url', null, {
    ...details,
    stepType: current?.type,
    message: `WWWSHOWORDER exceeded ${MAX_PROCEDURE_STEPS} steps without returning a document URL.`,
  });
}

async function generateSalesOrderPrintUrl(orderName, credentials, { sdk = priority } = {}) {
  const normalizedOrderName = normalizeOrderName(orderName);
  const { config, orderSortOption } = getConfiguration(credentials);
  let procedure;
  const details = { credentials, orderName: normalizedOrderName };

  try {
    await runStage('login', () => sdk.login(config), details);
    procedure = await runStage(
      'procedure-start',
      () => sdk.procStart('WWWSHOWORDER', 'P', null),
      details
    );
    procedure = await resolveIntroductorySteps(procedure, details);
    procedure = await submitOrderParameters(
      procedure,
      normalizedOrderName,
      orderSortOption,
      details
    );
    const reportUrl = await finishProcedure(procedure, details);
    return await runStage(
      'document-url',
      () => {
        const resolvedUrl = new URL(reportUrl, config.url);
        if (resolvedUrl.protocol !== 'https:') {
          throw new Error('Priority returned a document URL that does not use HTTPS.');
        }
        return resolvedUrl.toString();
      },
      { ...details, stepType: procedure?.type }
    );
  } catch (cause) {
    throw priorityStageError('procedure-continue', cause, details);
  } finally {
    if (procedure?.proc?.cancel) await procedure.proc.cancel().catch(() => {});
  }
}

function safeDocumentUrlSummary(value) {
  try {
    const parsed = new URL(value);
    return { available: true, host: parsed.host, protocol: parsed.protocol };
  } catch {
    return { available: Boolean(value), validUrl: false };
  }
}

module.exports = {
  DEFAULT_ORDER_SORT_OPTION,
  buildMockSalesOrderPrintUrl,
  generateSalesOrderPrintUrl,
  getConfiguration,
  safePriorityErrorText,
  safeDocumentUrlSummary,
};
