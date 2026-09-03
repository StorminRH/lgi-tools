async function sha256(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

export async function bearerMatches(
  authorization: string | null,
  secret: string,
): Promise<boolean> {
  const [provided, expected] = await Promise.all([
    sha256(authorization ?? ''),
    sha256(`Bearer ${secret}`),
  ]);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= (provided[i] ?? 0) ^ (expected[i] ?? 0);
  return diff === 0;
}
