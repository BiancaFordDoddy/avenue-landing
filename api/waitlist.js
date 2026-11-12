// Waitlist signup endpoint (Vercel serverless function).
// The page posts { email } here; this function adds the signup to Airtable.
// The Airtable token lives only in Vercel environment variables, never in page code.
//
// Required environment variables (Vercel > Project > Settings > Environment Variables):
//   AIRTABLE_TOKEN    - personal access token with data.records:write on the waitlist base only
//   AIRTABLE_BASE_ID  - the base ID (starts with "app")
//   AIRTABLE_TABLE    - the table name, e.g. "Table 1"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function createRecord(fields) {
  const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(
    process.env.AIRTABLE_TABLE
  )}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const detail = response.ok ? null : await response.text();
  return { ok: response.ok, status: response.status, detail };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID || !process.env.AIRTABLE_TABLE) {
    console.error('Waitlist: missing Airtable environment variables');
    return res.status(500).json({ error: 'Signup is not configured' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};

  // Honeypot: real visitors never see or fill this field; simple bots do.
  if (body.company) {
    return res.status(200).json({ ok: true });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  // First try with the extra fields. If Airtable rejects one of them (a field name
  // or select option that doesn't match the table), retry with the email alone so
  // the signup is never lost, and log the reason for fixing the table later.
  let result = await createRecord({ Email: email, Status: 'New', Source: 'Direct' });
  if (!result.ok && result.status === 422) {
    console.error('Waitlist: full record rejected, retrying with email only:', result.detail);
    result = await createRecord({ Email: email });
  }

  if (!result.ok) {
    console.error('Waitlist: Airtable error', result.status, result.detail);
    return res.status(502).json({ error: 'Signup failed' });
  }

  return res.status(200).json({ ok: true });
};

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
