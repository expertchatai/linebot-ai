// Upstash Redis over its REST API. Names are set by the Vercel Upstash integration, or by Upstash directly.
const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const hasRedis = () => !!url();

export async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(url(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}` },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { result: unknown }).result;
}
