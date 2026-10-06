import { FocusState, nextFocus, previousFocus, WorkspaceSnapshot } from "./focusState";

export interface FocusHost {
  snapshot(): WorkspaceSnapshot;
  validateFolder(uri: string): Promise<void>;
  prepareFocus(state: FocusState): Promise<string>;
  prepareRestore(snapshot: WorkspaceSnapshot): Promise<string | undefined>;
  open(uri: string | undefined): Promise<boolean>;
}

/** State is written to the destination workspace before opening it, because opening can restart the host. */
export class WorkspaceFocus {
  private busy = false;
  public constructor(private readonly host: FocusHost, private state?: FocusState) {}
  public getState(): FocusState | undefined { return this.state; }

  public async focus(target: string): Promise<void> {
    await this.exclusive(async () => {
      await this.host.validateFolder(target);
      const next = nextFocus(this.state, this.host.snapshot(), target);
      if (next === this.state) return;
      const destination = await this.host.prepareFocus(next);
      if (await this.host.open(destination)) this.state = next;
    });
  }

  public async restore(): Promise<void> {
    await this.exclusive(() => this.restoreOriginal());
  }

  public async back(): Promise<void> {
    await this.exclusive(async () => {
      if (!this.state) return;
      const next = previousFocus(this.state);
      if (!next) { await this.restoreOriginal(); return; }
      await this.host.validateFolder(next.history[next.cursor]!);
      const destination = await this.host.prepareFocus(next);
      if (await this.host.open(destination)) this.state = next;
    });
  }

  private async restoreOriginal(): Promise<void> {
    if (!this.state) return;
    const destination = await this.host.prepareRestore(this.state.original);
    if (!destination) return; // Recovery picker cancellation keeps the current return state.
    if (await this.host.open(destination)) this.state = undefined;
  }

  private async exclusive(operation: () => Promise<void>): Promise<void> {
    if (this.busy) throw new Error("Workspace switching is already in progress.");
    this.busy = true;
    try { await operation(); } finally { this.busy = false; }
  }
}
