// Transactional mail abstraction (server-only), backed by the official Resend
// SDK. This module is never imported from client code (see "server-only").
//
// Configuration (see .env.example):
//
//   RESEND_API_KEY   Resend API key (https://resend.com/api-keys).
//   MAIL_FROM        Sender for every transactional email. The domain MUST be
//                    verified in Resend (add domain -> DNS records -> verify).
//
// When either variable is missing or empty, mail is safely skipped: the no-op
// provider resolves without side effects and a one-time server-side warning is
// emitted. This keeps local/dev and test environments fully functional while
// guaranteeing that sensitive values — password-reset tokens, reset/verification
// URLs, passwords, API keys, full user emails, and secrets — are NEVER written
// to application logs, server output, or any other observable sink. When
// delivery is attempted and the provider fails, the error rethrown to the
// application is generic: it contains only a static description and the mail
// kind, never message body content or the provider's error payload (providers
// may echo the message — including reset/verification URLs — back in error
// documents).
//
// Operational diagnostics (server-side console only, never the browser) are
// limited to non-sensitive facts: provider configured yes/no, delivery
// attempt/success/failure with a sanitized status category, the sender/recipient
// DOMAIN (never the full address), and the static message subject.

import "server-only";
import { Resend } from "resend";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

export type MailKind = "password-reset" | "email-verification" | "password-changed";

export const RESEND_API_KEY_ENV = "RESEND_API_KEY";
export const MAIL_FROM_ENV = "MAIL_FROM";
export const RESEND_PROVIDER_NAME = "resend";

/** Shape of the subset of the Resend client used for delivery. */
export interface ResendClientLike {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }): Promise<{
      data?: unknown;
      error?: { name?: string; message?: string; statusCode?: number | null } | null;
    }>;
  };
}

export interface ResendSendResult {
  data?: unknown;
  error?: { name?: string; message?: string; statusCode?: number | null } | null;
}

/**
 * Creates the Resend client from `RESEND_API_KEY`. Returns null when the key is
 * missing or empty — callers must treat a null client as "mail not configured".
 * Passing a test key here never performs network activity; the SDK is a thin
 * HTTP client and only talks to Resend when `emails.send()` is called.
 */
export function createResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

/** The configured sender; only meaningful when `isMailConfigured()` is true. */
export function resendFrom(): string {
  return process.env.MAIL_FROM as string;
}

/** True only when both the API key and a sender are configured. */
export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && Boolean(process.env.MAIL_FROM);
}

/** Sender/recipient domain only — never the full address (PII stays out of logs). */
function mailboxDomain(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "(unknown)" : address.slice(at + 1);
}

export function createResendProvider(client: ResendClientLike, from: string): MailProvider {
  return {
    name: RESEND_PROVIDER_NAME,
    async send(message) {
      const toDomain = mailboxDomain(message.to);
      let result: ResendSendResult;
      try {
        result = await client.emails.send({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      } catch {
        // Network failure / timeout: no provider payload passes through the
        // error text — only the kind is attributed at the logging layer.
        console.warn(
          `[auth/mail] resend request FAILED to=@${toDomain} category=network`,
        );
        throw new Error(`Mail delivery failed (${RESEND_PROVIDER_NAME})`);
      }
      if (result.error) {
        // Never include the error payload — the provider may echo the message
        // body (which contains the reset/verify URL and token) back in it.
        console.warn(
          `[auth/mail] resend REJECTED to=@${toDomain} status=${result.error.statusCode ?? "unknown"}`,
        );
        throw new Error(
          `Mail delivery failed (${RESEND_PROVIDER_NAME} HTTP ${result.error.statusCode ?? "unknown"})`,
        );
      }
      const dashboardId =
        result.data && typeof result.data === "object" && "id" in result.data ? "present" : "missing";
      console.info(
        `[auth/mail] request=real-api result=accepted dashboardId=${dashboardId} from=@${mailboxDomain(from)} to=@${toDomain}`,
      );
    },
  };
}

function noopMailProvider(): MailProvider {
  return {
    name: "noop",
    async send(_message) {
      void _message;
      // Not configured (dev/test or pre-launch): drop silently. No logging of
      // recipients, subjects, tokens, or URLs — see module header.
    },
  };
}

let unconfiguredWarningEmitted = false;
let configuredInfoEmitted = false;

function infoConfigured(from: string): void {
  if (configuredInfoEmitted) return;
  configuredInfoEmitted = true;
  console.info(
    `[auth/mail] provider=${RESEND_PROVIDER_NAME} configured=true from=@${mailboxDomain(from)}`,
  );
}

function warnUnconfigured(): void {
  if (unconfiguredWarningEmitted) return;
  unconfiguredWarningEmitted = true;
  if (!process.env.RESEND_API_KEY && !process.env.MAIL_FROM) {
    console.warn(
      `[auth/mail] Transactional mail is NOT configured (missing ${RESEND_API_KEY_ENV} and ${MAIL_FROM_ENV}) — ` +
        `password-reset / email-verification emails are being skipped. Set both in .env.local and restart.`,
    );
    return;
  }
  const missing = !process.env.RESEND_API_KEY
    ? RESEND_API_KEY_ENV
    : MAIL_FROM_ENV;
  console.warn(
    `[auth/mail] Transactional mail is NOT configured (missing ${missing}) — ` +
      `password-reset / email-verification emails are being skipped. See .env.example and DEPLOYMENT.md.`,
  );
}

/** Test hook: clear the one-time "not configured" warning flag. */
export function resetMailWarningForTests(): void {
  unconfiguredWarningEmitted = false;
}

export function providerName(): string {
  return isMailConfigured() ? RESEND_PROVIDER_NAME : "noop";
}

export function getMailProvider(): MailProvider {
  if (!isMailConfigured()) {
    warnUnconfigured();
    return noopMailProvider();
  }
  const client = createResendClient();
  if (!client) {
    warnUnconfigured();
    return noopMailProvider();
  }
  infoConfigured(resendFrom());
  return createResendProvider(client, resendFrom());
}

export async function sendMail(message: MailMessage): Promise<void> {
  const p = getMailProvider();
  if (p.name === "noop") return;
  await p.send(message);
}

/**
 * Password-reset email.
 *
 * `resetUrl` embeds the single-use reset token and MUST be treated as a
 * credential: it is passed to the provider inside the message body only, and
 * is never logged anywhere by this module.
 */
export async function sendPasswordResetMail(
  user: { name: string; email: string },
  resetUrl: string,
  expiresInMinutes: number,
): Promise<void> {
  await sendMail(buildPasswordResetMessage(user, resetUrl, expiresInMinutes));
}

/**
 * Email-verification email (also used by the verification-resend flow).
 *
 * `verifyUrl` embeds a signed verification token and is likewise never logged.
 */
export async function sendVerificationMail(
  user: { name: string; email: string },
  verifyUrl: string,
  expiresInMinutes: number,
): Promise<void> {
  await sendMail(buildVerificationMessage(user, verifyUrl, expiresInMinutes));
}

/**
 * Password-changed confirmation email.
 *
 * Not wired to a Better Auth hook yet (no in-app change-password email flow
 * currently exists); provided as the canonical message a future hook can send.
 */
export async function sendPasswordChangedMail(
  user: { name: string; email: string },
): Promise<void> {
  await sendMail(buildPasswordChangedMessage(user));
}

export function buildPasswordResetMessage(
  user: { name: string; email: string },
  resetUrl: string,
  expiresInMinutes: number,
): MailMessage {
  const subject = "Reset your BizLedger password";
  const text =
    `Hi ${user.name},\n\n` +
    `We received a request to reset the password for ${user.email}.\n\n` +
    `Open the link below to choose a new password. This link expires in ${expiresInMinutes} minutes and can only be used once.\n\n` +
    `${resetUrl}\n\n` +
    `If you did not request this, you can safely ignore this email — your password has not been changed. ` +
    `If you are concerned about your account, contact support at ${SUPPORT_EMAIL}.\n\n` +
    `— BizLedger\n${SUPPORT_EMAIL}`;
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">` +
    `<h2 style="margin:0 0 12px">Reset your BizLedger password</h2>` +
    `<p style="color:#333;font-size:14px;line-height:1.6">Hi ${escapeHtml(user.name)},</p>` +
    `<p style="color:#333;font-size:14px;line-height:1.6">We received a request to reset the password for ` +
    `<strong>${escapeHtml(user.email)}</strong>.</p>` +
    `<p style="margin:20px 0"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 20px;background:#4f46e5;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px">Choose a new password</a></p>` +
    `<p style="color:#666;font-size:12px;line-height:1.6">This link expires in ${expiresInMinutes} minutes and can only be used once. ` +
    `If you did not request a reset, you can safely ignore this email — your password has not been changed.</p>` +
    `<p style="color:#666;font-size:12px;line-height:1.6">If you have any questions, contact ${escapeHtml(SUPPORT_EMAIL)}.</p>` +
    `<p style="color:#999;font-size:12px">— BizLedger</p>` +
    `</div>`;
  return { to: user.email, subject, text, html };
}

export function buildVerificationMessage(
  user: { name: string; email: string },
  verifyUrl: string,
  expiresInMinutes: number,
): MailMessage {
  const subject = "Verify your BizLedger email";
  const text =
    `Hi ${user.name},\n\n` +
    `Confirm that ${user.email} belongs to your BizLedger account by opening the link below.\n\n` +
    `${verifyUrl}\n\n` +
    `This link expires in ${expiresInMinutes} minutes.\n\n` +
    `If you did not request this, you can safely ignore this email.\n\n` +
    `— BizLedger\n${SUPPORT_EMAIL}`;
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">` +
    `<h2 style="margin:0 0 12px">Verify your BizLedger email</h2>` +
    `<p style="color:#333;font-size:14px;line-height:1.6">Hi ${escapeHtml(user.name)},</p>` +
    `<p style="color:#333;font-size:14px;line-height:1.6">Confirm that <strong>${escapeHtml(
      user.email,
    )}</strong> belongs to your BizLedger account:</p>` +
    `<p style="margin:20px 0"><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;padding:12px 20px;background:#4f46e5;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px">Verify email address</a></p>` +
    `<p style="color:#666;font-size:12px;line-height:1.6">This link expires in ${expiresInMinutes} minutes.</p>` +
    `<p style="color:#666;font-size:12px;line-height:1.6">If you did not request this, you can safely ignore this email.</p>` +
    `<p style="color:#666;font-size:12px;line-height:1.6">Questions? Contact ${escapeHtml(SUPPORT_EMAIL)}.</p>` +
    `<p style="color:#999;font-size:12px">— BizLedger</p>` +
    `</div>`;
  return { to: user.email, subject, text, html };
}

export function buildPasswordChangedMessage(user: { name: string; email: string }): MailMessage {
  const subject = "Your BizLedger password was changed";
  const text =
    `Hi ${user.name},\n\n` +
    `The password for your BizLedger account (${user.email}) was recently changed.\n\n` +
    `If this was you, no further action is needed.\n\n` +
    `If you did NOT change your password, contact support immediately at ${SUPPORT_EMAIL} so we can help you secure your account.\n\n` +
    `— BizLedger\n${SUPPORT_EMAIL}`;
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">` +
    `<h2 style="margin:0 0 12px">Your BizLedger password was changed</h2>` +
    `<p style="color:#333;font-size:14px;line-height:1.6">Hi ${escapeHtml(user.name)},</p>` +
    `<p style="color:#333;font-size:14px;line-height:1.6">The password for your BizLedger account (` +
    `<strong>${escapeHtml(user.email)}</strong>) was recently changed.</p>` +
    `<p style="color:#333;font-size:14px;line-height:1.6">If this was you, no further action is needed. ` +
    `If you did <strong>not</strong> change your password, contact ${escapeHtml(SUPPORT_EMAIL)} immediately so we can secure your account.</p>` +
    `<p style="color:#999;font-size:12px">— BizLedger</p>` +
    `</div>`;
  return { to: user.email, subject, text, html };
}

const SUPPORT_EMAIL = "support@bizledger.io";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}