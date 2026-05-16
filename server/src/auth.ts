/**
 * Validates the Authorization: Bearer header against MEMORY_API_KEY.
 * Fails closed: if the env var is missing, throws rather than accepting
 * 'Bearer undefined' as a valid credential.
 */
export function requireApiKey(req: Request): Response | null {
  const key = Deno.env.get("MEMORY_API_KEY");
  if (!key) {
    throw new Error("MEMORY_API_KEY environment variable is not set");
  }
  const auth = req.headers.get("Authorization");
  if (!auth || auth !== `Bearer ${key}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
