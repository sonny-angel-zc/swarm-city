export const FAILURE_CODES = [
  'TASK_TITLE_REQUIRED',
  'TASK_PROVIDER_UNSUPPORTED',
  'TASKS_INTERNAL_ERROR',
  'AGENT_MESSAGE_REQUIRED_FIELDS',
  'AGENT_MESSAGE_INTERNAL_ERROR',
  'AUTONOMOUS_ENABLED_REQUIRED',
  'AUTONOMOUS_UPDATE_FAILED',
  'AUTONOMOUS_SEED_FAILED',
  'TASK_NOT_FOUND',
  'LINEAR_UNKNOWN_ACTION',
  'LINEAR_REQUEST_FAILED',
  'LINEAR_UPSTREAM_ERROR',
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

type FieldRule = {
  required: boolean;
  type: FieldType;
  nonEmpty?: boolean;
  literal?: unknown;
};

type FailureSchema = {
  fields: Record<string, FieldRule>;
  forbiddenKeys: string[];
};

const BASE_FORBIDDEN_KEYS = ['stack', 'details', 'debug', 'trace', 'data', 'task', 'taskId', 'ok'];

function defineFailureSchema(code: FailureCode): FailureSchema {
  return {
    fields: {
      code: { required: true, type: 'string', nonEmpty: true, literal: code },
      error: { required: true, type: 'string', nonEmpty: true },
    },
    forbiddenKeys: BASE_FORBIDDEN_KEYS,
  };
}

export const FAILURE_CONTRACT_BY_CODE: Record<FailureCode, FailureSchema> = {
  TASK_TITLE_REQUIRED: defineFailureSchema('TASK_TITLE_REQUIRED'),
  TASK_PROVIDER_UNSUPPORTED: defineFailureSchema('TASK_PROVIDER_UNSUPPORTED'),
  TASKS_INTERNAL_ERROR: defineFailureSchema('TASKS_INTERNAL_ERROR'),
  AGENT_MESSAGE_REQUIRED_FIELDS: defineFailureSchema('AGENT_MESSAGE_REQUIRED_FIELDS'),
  AGENT_MESSAGE_INTERNAL_ERROR: defineFailureSchema('AGENT_MESSAGE_INTERNAL_ERROR'),
  AUTONOMOUS_ENABLED_REQUIRED: defineFailureSchema('AUTONOMOUS_ENABLED_REQUIRED'),
  AUTONOMOUS_UPDATE_FAILED: defineFailureSchema('AUTONOMOUS_UPDATE_FAILED'),
  AUTONOMOUS_SEED_FAILED: defineFailureSchema('AUTONOMOUS_SEED_FAILED'),
  TASK_NOT_FOUND: defineFailureSchema('TASK_NOT_FOUND'),
  LINEAR_UNKNOWN_ACTION: defineFailureSchema('LINEAR_UNKNOWN_ACTION'),
  LINEAR_REQUEST_FAILED: defineFailureSchema('LINEAR_REQUEST_FAILED'),
  LINEAR_UPSTREAM_ERROR: defineFailureSchema('LINEAR_UPSTREAM_ERROR'),
};

function detectType(value: unknown): FieldType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as FieldType;
}

export function validateFailurePayload(payload: unknown, code: FailureCode): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['payload must be a JSON object'];
  }

  const schema = FAILURE_CONTRACT_BY_CODE[code];
  const record = payload as Record<string, unknown>;
  const errors: string[] = [];

  for (const [field, rule] of Object.entries(schema.fields)) {
    const hasField = Object.prototype.hasOwnProperty.call(record, field);
    if (!hasField) {
      if (rule.required) {
        errors.push(`missing required field: ${field}`);
      }
      continue;
    }

    const actual = record[field];
    const actualType = detectType(actual);
    if (actualType !== rule.type) {
      errors.push(`field ${field} expected type ${rule.type}, received ${actualType}`);
      continue;
    }

    if (rule.nonEmpty && typeof actual === 'string' && actual.trim().length === 0) {
      errors.push(`field ${field} must be non-empty`);
    }

    if (rule.literal !== undefined && actual !== rule.literal) {
      errors.push(`field ${field} must equal ${String(rule.literal)}`);
    }
  }

  for (const key of schema.forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      errors.push(`forbidden field present: ${key}`);
    }
  }

  return errors;
}
