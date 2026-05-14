/**
 * シンプルなインメモリ・レートリミッター
 * IPごとに windowMs ミリ秒以内の maxRequests リクエストまで許可する
 * ※ Railway のシングルインスタンス前提（複数インスタンスなら Redis に移行）
 */
const store = new Map<string, number[]>();

export function checkRateLimit(
  ip: string,
  maxRequests = 20,
  windowMs = 60_000,
): { ok: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  const timestamps = (store.get(ip) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= maxRequests) {
    const resetInMs = windowMs - (now - timestamps[0]);
    return { ok: false, remaining: 0, resetInMs };
  }

  timestamps.push(now);
  store.set(ip, timestamps);

  // メモリリーク防止：古いエントリを定期的に削除
  if (store.size > 10_000) {
    for (const [key, ts] of store.entries()) {
      if (ts.every((t) => now - t >= windowMs)) store.delete(key);
    }
  }

  return { ok: true, remaining: maxRequests - timestamps.length, resetInMs: 0 };
}
