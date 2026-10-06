export type NavigationHistorySnapshot<T> = {
  history: T[];
  cursor: number;
};

export class NavigationHistory<T> {
  private history: T[];
  private cursor: number;
  private maxLength: number;

  public constructor(initial: T, maxLength: number) {
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw new Error("maxLength must be >= 1");
    }
    this.history = [initial];
    this.cursor = 0;
    this.maxLength = maxLength;
  }

  public static fromSnapshot<T>(
    snapshot: NavigationHistorySnapshot<T>,
    maxLength: number,
    fallback: T
  ): NavigationHistory<T> {
    const normalizedMax = Number.isInteger(maxLength) ? Math.max(1, maxLength) : 100;
    const h = new NavigationHistory<T>(fallback, normalizedMax);

    const snapshotHistory = Array.isArray(snapshot.history)
      ? [...snapshot.history]
      : [fallback];
    const snapshotCursor =
      Number.isInteger(snapshot.cursor) ? snapshot.cursor : 0;

    h.history = snapshotHistory.length > 0 ? snapshotHistory : [fallback];
    h.cursor = clamp(snapshotCursor, 0, h.history.length - 1);
    h.maxLength = normalizedMax;
    h.enforceMaxLength();
    return h;
  }

  public snapshot(): NavigationHistorySnapshot<T> {
    return { history: [...this.history], cursor: this.cursor };
  }

  public current(): T {
    return this.history[this.cursor]!;
  }

  public canGoBack(): boolean {
    return this.cursor > 0;
  }

  public canGoForward(): boolean {
    return this.cursor < this.history.length - 1;
  }

  public entries(): readonly T[] {
    return this.history;
  }

  public cursorIndex(): number {
    return this.cursor;
  }

  public setMaxLength(maxLength: number): void {
    this.maxLength = Number.isInteger(maxLength) ? Math.max(1, maxLength) : 100;
    this.enforceMaxLength();
  }

  public navigateTo(next: T): void {
    if (next === this.current()) return;
    if (this.cursor < this.history.length - 1) {
      this.history = this.history.slice(0, this.cursor + 1);
    }

    this.history.push(next);
    this.cursor++;
    this.enforceMaxLength();
  }

  public back(): T | null {
    if (!this.canGoBack()) {
      return null;
    }
    this.cursor--;
    return this.current();
  }

  public forward(): T | null {
    if (!this.canGoForward()) {
      return null;
    }
    this.cursor++;
    return this.current();
  }

  public removeAt(index: number): void {
    if (index < 0 || index >= this.history.length) {
      return;
    }

    if (this.history.length === 1) return;
    this.history.splice(index, 1);

    if (this.history.length === 0) {
      throw new Error("history cannot be empty");
    }

    if (this.cursor > index) {
      this.cursor--;
    } else if (this.cursor === index) {
      this.cursor = clamp(this.cursor, 0, this.history.length - 1);
    }
  }

  private enforceMaxLength(): void {
    if (this.history.length <= this.maxLength) {
      return;
    }

    const start = Math.min(this.cursor, this.history.length - this.maxLength);
    this.history = this.history.slice(start, start + this.maxLength);
    this.cursor -= start;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
