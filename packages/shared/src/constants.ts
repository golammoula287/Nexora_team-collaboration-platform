/** Limits and windows referenced by both the API and the UI. */

export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 200;

/** Trash retention before a soft-deleted row is purged by the cleanup job. */
export const TRASH_RETENTION_DAYS = 30;

/** Invitation validity window. */
export const INVITE_EXPIRY_DAYS = 7;

/** Upload ceiling enforced by the presign route and mirrored in the picker UI. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Task title bounds, used by the Zod schema and the input's maxLength. */
export const TASK_TITLE_MAX = 500;

/** Project key, e.g. the ACME in ACME-123. */
export const PROJECT_KEY_MIN = 2;
export const PROJECT_KEY_MAX = 10;
export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]*$/;
