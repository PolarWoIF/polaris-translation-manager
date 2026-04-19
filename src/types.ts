
export interface Translation {
  id: string;
  name: string;
  version: string;
  type: "official" | "community" | "legacy";
  description: string;
  releaseDate: string;
  downloadUrl?: string;
  assetKey?: string;
  archiveFormat?: string;
  changelog: string[];
  size: string;
  author: string;
}

export interface Game {
  id: string;
  title: string;
  category: string;
  rating: number;
  description: string;
  bannerImage: string;
  thumbnailImage: string;
  executable: string;
  translations: Translation[];
}

export interface GameStatus {
  gameId: string;
  status: "not-installed" | "installing" | "installed" | "error";
  progress: number;
  statusText: string;
  installPath: string;
  installedPatchId?: string;
  installedFiles?: string[];
  error?: string;
}

export interface AppData {
  games: Game[];
  lastUpdated: string;
  categories: string[];
  contentVersion?: string;
}

export type InstallationStep = "idle" | "downloading" | "extracting" | "selecting-folder" | "validating" | "backing-up" | "copying" | "success" | "error";

export interface InstallationState {
  step: InstallationStep;
  progress: number;
  message: string;
  installedFiles?: string[];
  error?: string;
}
