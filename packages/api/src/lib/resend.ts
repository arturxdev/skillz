export async function sendAuthCodeEmail(
  env: Env,
  email: string,
  code: string,
): Promise<void> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: email,
      subject: 'Your skillz sign-in code',
      text: `Your skillz code:\n\n  ${code}\n\nExpires in 10 minutes. If you did not request this, ignore this email.\n`,
      html: `<p>Your skillz sign-in code:</p>
<pre style="font-size:20px;padding:12px;background:#f5f5f5;border-radius:6px;display:inline-block;">${code}</pre>
<p style="color:#666;">Expires in 10 minutes. If you did not request this, ignore this email.</p>`,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`resend_failed: ${resp.status} ${body}`);
  }
}
