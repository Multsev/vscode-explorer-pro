export class DoubleClickTracker {
  private lastId: string | undefined;
  private lastAtMs = 0;

  public reset(): void { this.lastId = undefined; this.lastAtMs = 0; }

  public isDoubleClick(id: string, nowMs: number, timeoutMs: number): boolean {
    const double = this.lastId === id && nowMs >= this.lastAtMs && nowMs - this.lastAtMs <= timeoutMs;
    this.lastId = double ? undefined : id;
    this.lastAtMs = nowMs;
    return double;
  }
}
