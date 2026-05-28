export function verificationEmailContent(verifyUrl: string) {
  const subject = "Verify your Bar Inventory email";
  const text = `Welcome to Bar Inventory.\n\nVerify your email by opening this link (valid for 24 hours):\n${verifyUrl}\n\nIf you did not sign up, you can ignore this message.`;
  const html = `
    <p>Welcome to <strong>Bar Inventory</strong>.</p>
    <p><a href="${verifyUrl}">Verify your email address</a> (link expires in 24 hours).</p>
    <p style="color:#666;font-size:14px;">If you did not sign up, you can ignore this email.</p>
  `.trim();
  return { subject, text, html };
}

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
