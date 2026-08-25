/** Map SMTP / mail transport errors to short admin hints (safe for API responses). */
export function mailDeliveryHint(raw: string | undefined): string {
  const msg = String(raw || '');
  if (!msg) return '';
  if (/554|5\.7\.1|disabled by user from hpanel/i.test(msg)) {
    return ' (Hostinger outbound SMTP is disabled for mams@mimitotracking.com — open hPanel → Emails → mams@mimitotracking.com and enable email / SMTP sending)';
  }
  if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ESOCKET/i.test(msg)) {
    return ' (SMTP connection blocked or timed out from the server)';
  }
  if (/auth|invalid login|535|534|authentication/i.test(msg)) {
    return ' (SMTP authentication failed — check mailbox password in Hostinger env)';
  }
  if (/PHP CLI not found|PHPMailer source missing/i.test(msg)) {
    return ' (use MAIL_TRANSPORT=nodemailer on Hostinger Node — PHP CLI is usually unavailable)';
  }
  return '';
}
