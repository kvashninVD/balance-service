export function balanceCacheKey(userId: number): string {
  return `balance:${userId}`;
}
