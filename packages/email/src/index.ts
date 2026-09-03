export {
  createMailer,
  createResendMailer,
  createConsoleMailer,
  createMemoryMailer,
} from './mailer.js';
export type { Mailer, MailerConfig, OutgoingEmail } from './mailer.js';

export {
  verifyEmail,
  resetPassword,
  organizationInvite,
  magicLink,
  otpCode,
} from './templates/index.js';
export type { Rendered } from './templates/index.js';
