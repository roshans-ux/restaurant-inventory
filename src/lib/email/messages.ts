export function passwordResetEmailContent(resetUrl: string) {
  const subject = "Reset your Bar Inventory password";
  const text = `We received a request to reset your password.\n\nReset your password (valid for 1 hour):\n${resetUrl}\n\nIf you did not request this, you can ignore this message.`;
  const html = `
    <p>We received a request to reset your <strong>Bar Inventory</strong> password.</p>
    <p><a href="${resetUrl}">Reset your password</a> (link expires in 1 hour).</p>
    <p style="color:#666;font-size:14px;">If you did not request a reset, you can ignore this email.</p>
  `.trim();
  return { subject, text, html };
}
