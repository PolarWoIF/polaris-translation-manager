export type DesktopUpdaterPhase =
  | "idle"
  | "unsupported"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export interface DesktopUpdaterState {
  phase: DesktopUpdaterPhase;
  currentVersion: string | null;
  latestVersion: string | null;
  progressPercent: number;
  message: string;
  error?: string;
}

type UpdaterEventPayload = Partial<DesktopUpdaterState> & {
  phase?: DesktopUpdaterPhase;
};

type Unsubscribe = () => void;

const initialState: DesktopUpdaterState = {
  phase: "idle",
  currentVersion: null,
  latestVersion: null,
  progressPercent: 0,
  message: "Waiting for update check...",
};

function getIpcRenderer():
  | {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, listener: (_event: unknown, payload: UpdaterEventPayload) => void) => void;
      removeListener: (channel: string, listener: (_event: unknown, payload: UpdaterEventPayload) => void) => void;
    }
  | null {
  if (typeof window === "undefined") return null;
  const windowWithRequire = window as typeof window & {
    require?: (name: string) => unknown;
  };
  if (typeof windowWithRequire.require !== "function") return null;

  try {
    const electron = windowWithRequire.require("electron") as {
      ipcRenderer?: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
        on: (channel: string, listener: (_event: unknown, payload: UpdaterEventPayload) => void) => void;
        removeListener: (channel: string, listener: (_event: unknown, payload: UpdaterEventPayload) => void) => void;
      };
    };
    return electron.ipcRenderer ?? null;
  } catch {
    return null;
  }
}

class DesktopUpdaterService {
  private state: DesktopUpdaterState = { ...initialState };

  private subscribers = new Set<(state: DesktopUpdaterState) => void>();

  private initialized = false;

  private ipc = getIpcRenderer();

  private onUpdateEvent = (_event: unknown, payload: UpdaterEventPayload) => {
    this.setState(payload);
  };

  private notify() {
    for (const subscriber of this.subscribers) {
      subscriber(this.state);
    }
  }

  private setState(patch: UpdaterEventPayload) {
    this.state = {
      ...this.state,
      ...patch,
      phase: patch.phase ?? this.state.phase,
      progressPercent: typeof patch.progressPercent === "number" ? patch.progressPercent : this.state.progressPercent,
    };
    this.notify();
  }

  getState(): DesktopUpdaterState {
    return this.state;
  }

  subscribe(listener: (state: DesktopUpdaterState) => void): Unsubscribe {
    this.subscribers.add(listener);
    listener(this.state);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    if (!this.ipc) {
      this.setState({
        phase: "unsupported",
        message: "Native updater is not available in this runtime.",
      });
      return;
    }

    this.ipc.on("desktop-updater:event", this.onUpdateEvent);

    try {
      const state = (await this.ipc.invoke("desktop-updater:get-state")) as UpdaterEventPayload | null;
      if (state) {
        this.setState(state);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setState({
        phase: "error",
        message: "Failed to initialize updater state.",
        error: message,
      });
    }
  }

  async checkNow() {
    if (!this.ipc) return;
    await this.ipc.invoke("desktop-updater:check-now");
  }

  async restartAndInstall() {
    if (!this.ipc) return;
    await this.ipc.invoke("desktop-updater:restart-and-install");
  }

  dispose() {
    if (!this.ipc) return;
    this.ipc.removeListener("desktop-updater:event", this.onUpdateEvent);
    this.initialized = false;
  }
}

export const desktopUpdaterService = new DesktopUpdaterService();
