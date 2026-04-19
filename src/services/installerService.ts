
import JSZip from "jszip";
import {
  DOWNLOAD_GATEWAY_AUTHORIZE_PATH,
  DOWNLOAD_GATEWAY_DOWNLOAD_PATH,
  DOWNLOAD_GATEWAY_STRICT,
  DOWNLOAD_GATEWAY_TIMEOUT_MS,
  DOWNLOAD_GATEWAY_URL,
} from "../constants";
import { InstallationState, Game, Translation, TranslationDownloadPart } from "../types";

interface NodeRuntime {
  fs: typeof import("node:fs/promises");
  fsSync: typeof import("node:fs");
  path: typeof import("node:path");
  http: typeof import("node:http");
  https: typeof import("node:https");
  os: typeof import("node:os");
  childProcess: typeof import("node:child_process");
  sevenZipBinaryPath: string | null;
}

function getNodeRuntime(): NodeRuntime | null {
  if (typeof window === "undefined") return null;
  const windowWithRequire = window as typeof window & {
    require?: (name: string) => unknown;
  };

  if (typeof windowWithRequire.require !== "function") {
    return null;
  }

  try {
    let sevenZipBinaryPath: string | null = null;
    try {
      const sevenZipModule = windowWithRequire.require("7zip-bin") as {
        path7za?: string;
        path7x?: string;
      };
      sevenZipBinaryPath = sevenZipModule.path7za || sevenZipModule.path7x || null;
    } catch {
      // Keep optional 7z runtime null and fallback to system candidates later.
    }

    return {
      fs: windowWithRequire.require("node:fs/promises") as typeof import("node:fs/promises"),
      fsSync: windowWithRequire.require("node:fs") as typeof import("node:fs"),
      path: windowWithRequire.require("node:path") as typeof import("node:path"),
      http: windowWithRequire.require("node:http") as typeof import("node:http"),
      https: windowWithRequire.require("node:https") as typeof import("node:https"),
      os: windowWithRequire.require("node:os") as typeof import("node:os"),
      childProcess: windowWithRequire.require("node:child_process") as typeof import("node:child_process"),
      sevenZipBinaryPath,
    };
  } catch {
    return null;
  }
}

function sanitizeZipPath(entryPath: string): string {
  const normalized = entryPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);

  if (parts.length === 0) {
    throw new Error("Patch archive contains an invalid empty path.");
  }

  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error(`Patch archive contains an unsafe path: ${entryPath}`);
  }

  return parts.join("/");
}

interface DownloadResolutionResult {
  url: string;
  extensionHint: string;
  source: "gateway" | "direct";
  label: string;
}

interface DownloadRequestTarget {
  label: string;
  downloadUrl?: string;
  assetKey?: string;
  archiveFormat?: string;
}

interface DownloadAuthorizationResponse {
  downloadUrl?: string;
  url?: string;
  signedUrl?: string;
  token?: string;
  expiresAt?: string;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeArchiveFormat(value: string | undefined): string {
  if (!value) return "";
  const cleaned = value.trim().toLowerCase().replace(/^\./, "");
  if (!/^[a-z0-9]{2,8}$/.test(cleaned)) return "";
  return cleaned ? `.${cleaned}` : "";
}

function inferAssetKeyFromDownloadUrl(downloadUrl: string): string {
  if (!downloadUrl) return "";
  try {
    const parsed = new URL(downloadUrl);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    return "";
  }
}

function requestDownloadAuthorization(
  gatewayEndpoint: string,
  payload: {
    gameId: string;
    translationId: string;
    assetKey?: string;
  },
  runtime: NodeRuntime
): Promise<DownloadAuthorizationResponse> {
  const parsedUrl = new URL(gatewayEndpoint);
  const transport =
    parsedUrl.protocol === "https:"
      ? runtime.https
      : parsedUrl.protocol === "http:"
        ? runtime.http
        : null;

  if (!transport) {
    return Promise.reject(new Error(`Unsupported gateway protocol: ${parsedUrl.protocol}`));
  }

  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(payload);
    const timeout = DOWNLOAD_GATEWAY_TIMEOUT_MS;
    const request = transport.request(
      parsedUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
          Accept: "application/json",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "X-Polar-Client": "desktop-app",
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const chunks: Uint8Array[] = [];
        response.on("data", (chunk: Uint8Array) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");

          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`Gateway authorize request failed (HTTP ${statusCode}): ${body.slice(0, 240)}`));
            return;
          }

          try {
            const parsed = JSON.parse(body) as DownloadAuthorizationResponse;
            resolve(parsed);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            reject(new Error(`Gateway authorize response is not valid JSON: ${message}`));
          }
        });
      }
    );

    const timer = setTimeout(() => {
      request.destroy(new Error(`Gateway authorize request timed out after ${timeout}ms.`));
    }, timeout);

    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.on("close", () => {
      clearTimeout(timer);
    });

    request.write(requestBody);
    request.end();
  });
}

async function resolveTranslationDownload(
  game: Game,
  translationId: string,
  target: DownloadRequestTarget,
  runtime: NodeRuntime
): Promise<DownloadResolutionResult> {
  const directUrl = (target.downloadUrl ?? "").trim();
  const declaredFormat = normalizeArchiveFormat(target.archiveFormat);
  const label = target.label.trim() || "patch";

  if (!DOWNLOAD_GATEWAY_URL) {
    if (!directUrl) {
      throw new Error(`No download URL available for ${game.title} (${label}).`);
    }
    return {
      url: directUrl,
      extensionHint: declaredFormat || getArchiveExtensionFromUrl(directUrl),
      source: "direct",
      label,
    };
  }

  const gatewayEndpoint = new URL(DOWNLOAD_GATEWAY_AUTHORIZE_PATH, DOWNLOAD_GATEWAY_URL).toString();
  const assetKey = (target.assetKey ?? "").trim() || inferAssetKeyFromDownloadUrl(directUrl);

  try {
    const authorized = await requestDownloadAuthorization(
      gatewayEndpoint,
      {
        gameId: game.id,
        translationId,
        assetKey: assetKey || undefined,
      },
      runtime
    );

    const signed =
      (authorized.downloadUrl ?? "").trim() ||
      (authorized.url ?? "").trim() ||
      (authorized.signedUrl ?? "").trim();

    if (signed && isHttpUrl(signed)) {
      return {
        url: signed,
        extensionHint: declaredFormat || getArchiveExtensionFromUrl(signed) || getArchiveExtensionFromUrl(directUrl),
        source: "gateway",
        label,
      };
    }

    const token = (authorized.token ?? "").trim();
    if (token) {
      const tokenUrl = new URL(DOWNLOAD_GATEWAY_DOWNLOAD_PATH, DOWNLOAD_GATEWAY_URL);
      tokenUrl.searchParams.set("token", token);
      return {
        url: tokenUrl.toString(),
        extensionHint: declaredFormat || getArchiveExtensionFromUrl(directUrl),
        source: "gateway",
        label,
      };
    }

    throw new Error("Gateway authorize response did not include a signed URL or token.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (DOWNLOAD_GATEWAY_STRICT || !directUrl) {
      throw new Error(`Secure download authorization failed: ${message}`);
    }

    console.warn(`[Install] Gateway authorization failed (${message}). Falling back to direct URL.`);
    return {
      url: directUrl,
      extensionHint: declaredFormat || getArchiveExtensionFromUrl(directUrl),
      source: "direct",
      label,
    };
  }
}

async function resolveTranslationDownloads(
  game: Game,
  translation: Translation,
  runtime: NodeRuntime
): Promise<DownloadResolutionResult[]> {
  const parts = Array.isArray(translation.downloadParts) ? translation.downloadParts : [];

  const targets: DownloadRequestTarget[] =
    parts.length > 0
      ? parts.map((part: TranslationDownloadPart, index) => ({
          label:
            (part.name ?? "").trim() ||
            (part.id ?? "").trim() ||
            `Part ${index + 1}`,
          downloadUrl: part.downloadUrl,
          assetKey: part.assetKey,
          archiveFormat: part.archiveFormat,
        }))
      : [
          {
            label: translation.name,
            downloadUrl: translation.downloadUrl,
            assetKey: translation.assetKey,
            archiveFormat: translation.archiveFormat,
          },
        ];

  const resolved: DownloadResolutionResult[] = [];
  for (const target of targets) {
    const item = await resolveTranslationDownload(game, translation.id, target, runtime);
    resolved.push(item);
  }
  return resolved;
}

function downloadArchive(url: string, runtime: NodeRuntime): Promise<Uint8Array> {
  const maxRedirects = 5;

  const getFromUrl = (targetUrl: string, redirectCount: number): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
      } catch {
        reject(new Error("Invalid patch download URL."));
        return;
      }

      const transport =
        parsedUrl.protocol === "https:"
          ? runtime.https
          : parsedUrl.protocol === "http:"
            ? runtime.http
            : null;

      if (!transport) {
        reject(new Error(`Unsupported download protocol: ${parsedUrl.protocol}`));
        return;
      }

      const request = transport.get(parsedUrl, (response) => {
        const statusCode = response.statusCode ?? 0;

        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          if (redirectCount >= maxRedirects) {
            reject(new Error("Too many redirects while downloading patch."));
            return;
          }

          response.resume();
          const redirectUrl = new URL(response.headers.location, parsedUrl).toString();
          getFromUrl(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`Failed to download patch file (HTTP ${statusCode}).`));
          return;
        }

        const chunks: Uint8Array[] = [];
        response.on("data", (chunk: Uint8Array) => {
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          resolve(Buffer.concat(chunks));
        });
      });

      request.on("error", reject);
    });

  return getFromUrl(url, 0);
}

function getArchiveExtensionFromUrl(downloadUrl: string): string {
  const directHint = normalizeArchiveFormat(downloadUrl);
  if (directHint) {
    return directHint;
  }

  try {
    const parsed = new URL(downloadUrl);
    const pathname = decodeURIComponent(parsed.pathname);
    return pathname.toLowerCase().match(/(\.[a-z0-9]+)$/i)?.[1] ?? "";
  } catch {
    return "";
  }
}

function getSevenZipCandidates(runtime: NodeRuntime): string[] {
  const candidates: string[] = [];
  const pushCandidate = (value: string | null | undefined) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed || candidates.includes(trimmed)) return;
    candidates.push(trimmed);
  };

  const bundledPath = runtime.sevenZipBinaryPath;
  if (bundledPath) {
    pushCandidate(bundledPath);
    pushCandidate(bundledPath.replace(/\.asar([\\/])/gi, ".asar.unpacked$1"));
  }

  // Fallback to typical system installations.
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (programFiles) {
    pushCandidate(runtime.path.join(programFiles, "7-Zip", "7z.exe"));
  }
  if (programFilesX86) {
    pushCandidate(runtime.path.join(programFilesX86, "7-Zip", "7z.exe"));
  }

  // Fallback to PATH-resolved commands.
  pushCandidate("7z.exe");
  pushCandidate("7z");
  pushCandidate("7za.exe");
  pushCandidate("7za");

  return candidates;
}

function isLikelyFilePath(value: string, runtime: NodeRuntime): boolean {
  return value.includes(runtime.path.sep) || value.includes("/") || value.includes("\\");
}

function isPathInsideTarget(targetRoot: string, destinationPath: string, runtime: NodeRuntime): boolean {
  const normalizedDestination = destinationPath.toLowerCase();
  const normalizedTarget = targetRoot.toLowerCase();
  const targetPrefix = `${normalizedTarget}${runtime.path.sep}`;

  return normalizedDestination === normalizedTarget || normalizedDestination.startsWith(targetPrefix);
}

async function removeEmptyParentDirectories(
  startDirectory: string,
  targetRoot: string,
  runtime: NodeRuntime
) {
  let currentDirectory = startDirectory;

  while (currentDirectory && currentDirectory !== targetRoot) {
    if (!isPathInsideTarget(targetRoot, currentDirectory, runtime)) {
      break;
    }

    let entries: string[];
    try {
      entries = await runtime.fs.readdir(currentDirectory);
    } catch {
      break;
    }

    if (entries.length > 0) {
      break;
    }

    try {
      await runtime.fs.rmdir(currentDirectory);
    } catch {
      break;
    }

    const parentDirectory = runtime.path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }
    currentDirectory = parentDirectory;
  }
}

const TLOU_GAME_ID = "the-last-of-us-part-i";
const TLOU_CORE_FILE_NAME = "core.psarc";
const TLOU_TOOL_FILE_NAME = "TLOU PSARC Tool.exe";
const TLOU_MAIN_SEGMENTS = ["build", "pc", "main"] as const;

function toInstallRelativePath(targetRoot: string, absolutePath: string, runtime: NodeRuntime): string {
  const relative = runtime.path.relative(targetRoot, absolutePath);
  return relative.replace(/\\/g, "/");
}

async function listFilesRecursively(directory: string, runtime: NodeRuntime): Promise<string[]> {
  const files: string[] = [];
  const stack: string[] = [directory];

  while (stack.length > 0) {
    const currentDirectory = stack.pop()!;
    const entries = await runtime.fs.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = runtime.path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function findPathByNameRecursively(
  rootDirectory: string,
  targetName: string,
  directoryOnly: boolean,
  runtime: NodeRuntime
): Promise<string | null> {
  const wanted = targetName.toLowerCase();
  const stack: string[] = [rootDirectory];

  while (stack.length > 0) {
    const currentDirectory = stack.pop()!;
    const entries = await runtime.fs.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = runtime.path.join(currentDirectory, entry.name);
      const lowerName = entry.name.toLowerCase();

      if (entry.isDirectory()) {
        if (directoryOnly && lowerName === wanted) {
          return fullPath;
        }
        stack.push(fullPath);
      } else if (!directoryOnly && entry.isFile() && lowerName === wanted) {
        return fullPath;
      }
    }
  }

  return null;
}

async function resolveCorePsarcPath(
  targetRoot: string,
  mainDirectory: string,
  runtime: NodeRuntime
): Promise<string> {
  const expectedCorePath = runtime.path.resolve(mainDirectory, TLOU_CORE_FILE_NAME);

  if (!isPathInsideTarget(targetRoot, expectedCorePath, runtime)) {
    throw new Error("Blocked unsafe core.psarc path.");
  }

  let coreStats: import("node:fs").Stats;
  try {
    coreStats = await runtime.fs.stat(expectedCorePath);
  } catch {
    throw new Error("core.psarc was not found in build\\pc\\main.");
  }

  if (!coreStats.isFile()) {
    throw new Error("core.psarc exists but is not a file in build\\pc\\main.");
  }

  const canonicalCorePath = await runtime.fs.realpath(expectedCorePath);
  if (!isPathInsideTarget(targetRoot, canonicalCorePath, runtime)) {
    throw new Error("Blocked unsafe resolved core.psarc path.");
  }

  return canonicalCorePath;
}

async function runExecutable(
  executablePath: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  runtime: NodeRuntime
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const child = runtime.childProcess.spawn(executablePath, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

interface ArchiveExtractionResult {
  extractionRoot: string;
  extractedFiles: string[];
}

async function extractArchiveToTempDirectory(
  archiveBuffer: Uint8Array,
  archiveUrl: string,
  runtime: NodeRuntime,
  onProgress: (state: InstallationState) => void,
  progressStart: number,
  progressEnd: number,
  progressLabel: string
): Promise<ArchiveExtractionResult> {
  const extension = getArchiveExtensionFromUrl(archiveUrl);
  const extractionRoot = await runtime.fs.mkdtemp(
    runtime.path.join(runtime.os.tmpdir(), "polaris-archive-")
  );

  try {
    if (extension === ".zip") {
      const zip = await JSZip.loadAsync(archiveBuffer);
      const archiveFiles = Object.values(zip.files).filter((entry) => !entry.dir);
      if (archiveFiles.length === 0) {
        throw new Error("Patch archive has no installable files.");
      }

      for (let index = 0; index < archiveFiles.length; index += 1) {
        const archiveFile = archiveFiles[index];
        const relativePath = sanitizeZipPath(archiveFile.name);
        const destinationPath = runtime.path.resolve(extractionRoot, relativePath);

        if (!isPathInsideTarget(extractionRoot, destinationPath, runtime)) {
          throw new Error(`Blocked unsafe path in archive: ${archiveFile.name}`);
        }

        await runtime.fs.mkdir(runtime.path.dirname(destinationPath), { recursive: true });
        const fileData = await archiveFile.async("uint8array");
        await runtime.fs.writeFile(destinationPath, fileData);

        const progress =
          progressStart + Math.round(((index + 1) / archiveFiles.length) * (progressEnd - progressStart));
        onProgress({
          step: "extracting",
          progress: Math.min(progress, progressEnd),
          message: `${progressLabel} ${index + 1}/${archiveFiles.length}...`,
        });
      }
    } else {
      const archivePath = runtime.path.join(extractionRoot, `archive${extension || ".bin"}`);
      await runtime.fs.writeFile(archivePath, archiveBuffer);

      onProgress({
        step: "extracting",
        progress: progressStart,
        message: `${progressLabel} (7z engine)...`,
      });

      const extractionArgs = ["x", archivePath, `-o${extractionRoot}`, "-y", "-bb1"];
      const candidates = getSevenZipCandidates(runtime);
      const candidateErrors: string[] = [];
      let result: { code: number | null; stdout: string; stderr: string; timedOut: boolean } | null = null;
      let succeeded = false;

      for (const candidate of candidates) {
        if (isLikelyFilePath(candidate, runtime) && !runtime.fsSync.existsSync(candidate)) {
          continue;
        }

        try {
          result = await runExecutable(candidate, extractionArgs, extractionRoot, 15 * 60 * 1000, runtime);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          candidateErrors.push(`${candidate}: ${message}`);
          continue;
        }

        if (result.timedOut) {
          throw new Error(`Archive extraction timed out while running ${candidate}.`);
        }

        if (result.code === 0) {
          succeeded = true;
          break;
        }

        const details = `${result.stdout}\n${result.stderr}`
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line.length > 0);
        candidateErrors.push(
          `${candidate}: exit ${result.code ?? "null"}${details ? ` (${details})` : ""}`
        );
      }

      await runtime.fs.rm(archivePath, { force: true });

      if (!succeeded) {
        const summary = candidateErrors.length > 0 ? ` Tried: ${candidateErrors.join(" | ")}` : "";
        throw new Error(
          `Archive extraction failed for ${extension || "unknown"} format.${summary}`
        );
      }
    }

    const extractedFiles = await listFilesRecursively(extractionRoot, runtime);
    if (extractedFiles.length === 0) {
      throw new Error("Archive extraction produced no files.");
    }

    return { extractionRoot, extractedFiles };
  } catch (error) {
    try {
      await runtime.fs.rm(extractionRoot, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup for failed extraction.
    }
    throw error;
  }
}

function getTlouToolAutomationScript(): string {
  return String.raw`param(
  [Parameter(Mandatory = $true)][string]$ToolPath,
  [Parameter(Mandatory = $true)][string]$CorePath,
  [Parameter(Mandatory = $true)][string]$MainDirectory,
  [int]$TimeoutSeconds = 2700
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class NativeWin
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    public const uint WM_SETTEXT = 0x000C;
    public const uint WM_COMMAND = 0x0111;
    public const uint WM_CLOSE = 0x0010;
    public const uint BM_CLICK = 0x00F5;

    public const int IDOK = 1;
    public const int IDYES = 6;
    public const int SW_MINIMIZE = 6;

    public static string GetText(IntPtr hWnd)
    {
        int length = GetWindowTextLength(hWnd);
        StringBuilder sb = new StringBuilder(Math.Max(length + 1, 512));
        GetWindowText(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }

    public static string GetClass(IntPtr hWnd)
    {
        StringBuilder sb = new StringBuilder(256);
        GetClassName(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }

    public static uint GetPid(IntPtr hWnd)
    {
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        return pid;
    }

    public static List<IntPtr> GetAllTopWindows()
    {
        List<IntPtr> handles = new List<IntPtr>();
        EnumWindows((hWnd, lParam) => {
            handles.Add(hWnd);
            return true;
        }, IntPtr.Zero);
        return handles;
    }

    public static List<IntPtr> GetTopWindowsByProcessId(int processId)
    {
        List<IntPtr> handles = new List<IntPtr>();
        EnumWindows((hWnd, lParam) => {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pid == processId)
            {
                handles.Add(hWnd);
            }
            return true;
        }, IntPtr.Zero);
        return handles;
    }

    public static List<IntPtr> GetDescendantWindows(IntPtr parent)
    {
        List<IntPtr> result = new List<IntPtr>();
        WalkChildren(parent, result);
        return result;
    }

    private static void WalkChildren(IntPtr parent, List<IntPtr> result)
    {
        EnumChildWindows(parent, (child, lParam) => {
            result.Add(child);
            WalkChildren(child, result);
            return true;
        }, IntPtr.Zero);
    }
}
"@

function Find-ToolMainWindow {
  param([int]$ProcessId)

  foreach ($handle in [NativeWin]::GetTopWindowsByProcessId($ProcessId)) {
    $title = [NativeWin]::GetText($handle)
    if ($title -and $title.ToLower().Contains('the last of us psarc tool')) {
      return $handle
    }
  }

  return [IntPtr]::Zero
}

function Find-ButtonByCaption {
  param(
    [IntPtr]$Parent,
    [string[]]$Captions
  )

  foreach ($child in [NativeWin]::GetDescendantWindows($Parent)) {
    $className = [NativeWin]::GetClass($child)
    if (-not $className.ToUpper().Contains('BUTTON')) {
      continue
    }

    $caption = [NativeWin]::GetText($child)
    foreach ($wanted in $Captions) {
      if ($caption -eq $wanted) {
        return $child
      }
    }
  }

  return [IntPtr]::Zero
}

function Try-SetPathOnDialog {
  param(
    [IntPtr]$DialogHandle,
    [string]$TargetPath
  )

  $edits = @()
  foreach ($child in [NativeWin]::GetDescendantWindows($DialogHandle)) {
    if ([NativeWin]::GetClass($child).ToUpper().Contains('EDIT')) {
      $edits += $child
    }
  }

  if ($edits.Count -eq 0) {
    return $false
  }

  foreach ($edit in $edits) {
    [void][NativeWin]::SendMessage($edit, [NativeWin]::WM_SETTEXT, [IntPtr]::Zero, $TargetPath)
  }

  return $true
}

function Submit-DialogByCommand {
  param(
    [IntPtr]$DialogHandle,
    [int]$CommandId
  )

  return [NativeWin]::PostMessage($DialogHandle, [NativeWin]::WM_COMMAND, [IntPtr]$CommandId, [IntPtr]::Zero)
}

function Try-HandleFileDialog {
  param(
    [IntPtr]$DialogHandle,
    [string]$TargetPath
  )

  if (-not (Try-SetPathOnDialog -DialogHandle $DialogHandle -TargetPath $TargetPath)) {
    return $false
  }

  if (Submit-DialogByCommand -DialogHandle $DialogHandle -CommandId ([NativeWin]::IDOK)) {
    return $true
  }

  $submitButton = Find-ButtonByCaption -Parent $DialogHandle -Captions @('Open', '&Open', 'Save', '&Save', 'OK', '&OK')
  if ($submitButton -ne [IntPtr]::Zero) {
    return [NativeWin]::PostMessage($submitButton, [NativeWin]::BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero)
  }

  return $false
}

function Get-DialogMessage {
  param([IntPtr]$DialogHandle)

  foreach ($child in [NativeWin]::GetDescendantWindows($DialogHandle)) {
    if (-not [NativeWin]::GetClass($child).ToUpper().Contains('STATIC')) {
      continue
    }

    $text = [NativeWin]::GetText($child)
    if ($text -and $text.Trim().Length -gt 0) {
      return $text.Trim()
    }
  }

  return ''
}

$toolPath = [System.IO.Path]::GetFullPath($ToolPath)
$corePath = [System.IO.Path]::GetFullPath($CorePath)
$mainDirectory = [System.IO.Path]::GetFullPath($MainDirectory)
$expectedCorePath = [System.IO.Path]::GetFullPath((Join-Path $mainDirectory 'core.psarc'))
$filesMapPath = Join-Path $mainDirectory 'FilesMap.txt'

if (!(Test-Path -LiteralPath $toolPath -PathType Leaf)) {
  throw "Tool not found: $toolPath"
}

if (!(Test-Path -LiteralPath $corePath -PathType Leaf)) {
  throw "core.psarc not found: $corePath"
}

if ([System.String]::Compare($corePath, $expectedCorePath, $true) -ne 0) {
  throw "Invalid core.psarc targeting. Expected path: $expectedCorePath"
}

if (!(Test-Path -LiteralPath $mainDirectory -PathType Container)) {
  throw "Main directory not found: $mainDirectory"
}

if (Test-Path -LiteralPath $filesMapPath) {
  Remove-Item -LiteralPath $filesMapPath -Force
}

$toolDirectory = Split-Path -Parent $toolPath
$process = Start-Process -FilePath $toolPath -WorkingDirectory $toolDirectory -WindowStyle Minimized -PassThru
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$startTime = Get-Date

$clickedExport = $false
$selectedCore = $false
$selectedFilesMap = $false
$completed = $false
$errorMessage = $null

while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 250
  $elapsedSeconds = ((Get-Date) - $startTime).TotalSeconds

  if ($process.HasExited) {
    if ($completed -and $process.ExitCode -eq 0) {
      Write-Output 'AUTOMATION_OK'
      exit 0
    }

    if ($errorMessage) {
      throw $errorMessage
    }

    if (-not $selectedCore) {
      throw 'Failed to handle the first PSARC file prompt automatically.'
    }

    if (-not $selectedFilesMap) {
      throw 'Failed to handle the second extraction path prompt automatically.'
    }

    throw "TLOU PSARC Tool exited before completion. Exit code: $($process.ExitCode)"
  }

  $mainWindow = Find-ToolMainWindow -ProcessId $process.Id
  if ($mainWindow -ne [IntPtr]::Zero) {
    [void][NativeWin]::ShowWindow($mainWindow, [NativeWin]::SW_MINIMIZE)
  }

  if ($mainWindow -ne [IntPtr]::Zero -and -not $clickedExport) {
    $exportButton = Find-ButtonByCaption -Parent $mainWindow -Captions @('Export')
    if ($exportButton -ne [IntPtr]::Zero) {
      [void][NativeWin]::PostMessage($exportButton, [NativeWin]::BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero)
      $clickedExport = $true
    } elseif ($elapsedSeconds -gt 20) {
      throw 'Could not find the Export button in TLOU PSARC Tool automatically.'
    }
  }

  foreach ($windowHandle in [NativeWin]::GetAllTopWindows()) {
    $windowClass = [NativeWin]::GetClass($windowHandle)
    if ($windowClass -ne '#32770') {
      continue
    }

    $windowTitle = [NativeWin]::GetText($windowHandle)
    $windowPid = [NativeWin]::GetPid($windowHandle)

    if ($windowTitle -like '*Select PSARC File*') {
      if (Try-HandleFileDialog -DialogHandle $windowHandle -TargetPath $corePath) {
        $selectedCore = $true
      }
      continue
    }

    if ($windowTitle -like '*Select where you want to extract files*') {
      if (Try-HandleFileDialog -DialogHandle $windowHandle -TargetPath $filesMapPath) {
        $selectedFilesMap = $true
      }
      continue
    }

    if ($windowTitle -like '*Confirm Save As*') {
      [void](Submit-DialogByCommand -DialogHandle $windowHandle -CommandId ([NativeWin]::IDYES))
      continue
    }

    if ($windowPid -ne $process.Id) {
      continue
    }

    $dialogMessage = Get-DialogMessage -DialogHandle $windowHandle
    if (-not $dialogMessage) {
      continue
    }

    if ($dialogMessage -eq 'Done!') {
      $completed = $true
      [void](Submit-DialogByCommand -DialogHandle $windowHandle -CommandId ([NativeWin]::IDOK))
      continue
    }

    if (
      $dialogMessage -match "Invalid 'PSAR' file" -or
      $dialogMessage -match "Can't find this file" -or
      $dialogMessage -match 'entry in PSARC file' -or
      $dialogMessage -match 'error'
    ) {
      $errorMessage = "TLOU PSARC Tool error: $dialogMessage"
      [void](Submit-DialogByCommand -DialogHandle $windowHandle -CommandId ([NativeWin]::IDOK))
      continue
    }

    [void](Submit-DialogByCommand -DialogHandle $windowHandle -CommandId ([NativeWin]::IDOK))
  }

  if ($errorMessage) {
    try {
      if (-not $process.HasExited) {
        $process.Kill()
      }
    } catch {
      # Best-effort cleanup.
    }
    throw $errorMessage
  }

  if ($clickedExport -and -not $selectedCore -and $elapsedSeconds -gt 90) {
    throw 'Timed out while handling first PSARC file prompt automatically.'
  }

  if ($selectedCore -and -not $selectedFilesMap -and $elapsedSeconds -gt 150) {
    throw 'Timed out while handling second extraction path prompt automatically.'
  }

  if ($completed -and $mainWindow -ne [IntPtr]::Zero) {
    [void][NativeWin]::PostMessage($mainWindow, [NativeWin]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 300

    if ($process.HasExited) {
      if ($process.ExitCode -eq 0) {
        Write-Output 'AUTOMATION_OK'
        exit 0
      }

      throw "TLOU PSARC Tool finished but exited with code $($process.ExitCode)."
    }
  }
}

try {
  if (-not $process.HasExited) {
    $process.Kill()
  }
} catch {
  # Best-effort cleanup.
}

if (-not $selectedCore) {
  throw 'Timed out while handling first PSARC file prompt automatically.'
}

if (-not $selectedFilesMap) {
  throw 'Timed out while handling second extraction path prompt automatically.'
}

throw "Timed out while automating TLOU PSARC Tool. clickedExport=$clickedExport selectedCore=$selectedCore selectedFilesMap=$selectedFilesMap completed=$completed"
`;
}

async function runTlouToolAutomatedExport(
  toolPath: string,
  corePsarcPath: string,
  mainDirectory: string,
  runtime: NodeRuntime,
  onProgress: (state: InstallationState) => void
) {
  const toolDirectory = runtime.path.dirname(toolPath);
  let coreStats: import("node:fs").Stats;
  try {
    coreStats = await runtime.fs.stat(corePsarcPath);
  } catch {
    throw new Error(`core.psarc was not found at: ${corePsarcPath}`);
  }

  if (!coreStats.isFile()) {
    throw new Error(`core.psarc path is invalid (not a file): ${corePsarcPath}`);
  }

  console.info(`[TLOU] Resolved core.psarc path: ${corePsarcPath}`);

  onProgress({
    step: "copying",
    progress: 60,
    message: `Resolved core.psarc: ${corePsarcPath}`,
  });

  const scriptPath = runtime.path.join(
    runtime.os.tmpdir(),
    `polaris-tlou-automation-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`
  );

  await runtime.fs.writeFile(scriptPath, getTlouToolAutomationScript(), "utf8");

  try {
    onProgress({
      step: "copying",
      progress: 62,
      message: "Running TLOU PSARC Tool (automatic export mode)...",
    });

    const result = await runExecutable(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        scriptPath,
        "-ToolPath",
        toolPath,
        "-CorePath",
        corePsarcPath,
        "-MainDirectory",
        mainDirectory,
        "-TimeoutSeconds",
        "600",
      ],
      toolDirectory,
      12 * 60 * 1000,
      runtime
    );

    if (result.timedOut) {
      throw new Error("Timed out while automating TLOU PSARC Tool.");
    }

    if (result.code !== 0) {
      const combinedOutput = `${result.stdout}\n${result.stderr}`;
      const toolErrorMatch = combinedOutput.match(/TLOU PSARC Tool error:[^\r\n]+/i);
      const firstCleanLine = combinedOutput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(
          (line) =>
            line.length > 0 &&
            !line.startsWith("At ") &&
            !line.startsWith("+") &&
            !line.startsWith("CategoryInfo") &&
            !line.startsWith("FullyQualifiedErrorId")
        );
      const details =
        toolErrorMatch?.[0] ??
        firstCleanLine?.slice(0, 380) ??
        `Exit code ${result.code ?? "null"}`;
      throw new Error(`TLOU PSARC Tool automation failed: ${details}`);
    }

    if (!result.stdout.includes("AUTOMATION_OK")) {
      const stdoutSample = result.stdout.replace(/\s+/g, " ").trim().slice(0, 380);
      throw new Error(
        `TLOU PSARC Tool automation finished without success marker.${stdoutSample ? ` Output: ${stdoutSample}` : ""}`
      );
    }
  } finally {
    try {
      await runtime.fs.rm(scriptPath, { force: true });
    } catch {
      // Best-effort cleanup for temporary script.
    }
  }
}

async function copyDirectoryIntoGame(
  sourceDirectory: string,
  destinationDirectory: string,
  targetRoot: string,
  runtime: NodeRuntime,
  onProgress: (state: InstallationState) => void,
  progressStart: number,
  progressEnd: number,
  label: string,
  installedFiles: string[]
) {
  await runtime.fs.mkdir(destinationDirectory, { recursive: true });

  const sourceFiles = await listFilesRecursively(sourceDirectory, runtime);
  if (sourceFiles.length === 0) {
    onProgress({
      step: "copying",
      progress: progressEnd,
      message: `Folder ${label} is empty; continuing...`,
    });
    return;
  }

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const sourceFilePath = sourceFiles[index];
    const relativeInsideFolder = runtime.path.relative(sourceDirectory, sourceFilePath);
    const destinationPath = runtime.path.resolve(destinationDirectory, relativeInsideFolder);

    if (!isPathInsideTarget(targetRoot, destinationPath, runtime)) {
      throw new Error(`Blocked unsafe destination path while copying ${label}.`);
    }

    await runtime.fs.mkdir(runtime.path.dirname(destinationPath), { recursive: true });
    await runtime.fs.copyFile(sourceFilePath, destinationPath);

    installedFiles.push(toInstallRelativePath(targetRoot, destinationPath, runtime));

    const progress =
      progressStart +
      Math.round(((index + 1) / sourceFiles.length) * (progressEnd - progressStart));
    onProgress({
      step: "copying",
      progress: Math.min(progress, progressEnd),
      message: `Copying ${label} files ${index + 1}/${sourceFiles.length}...`,
    });
  }
}

async function installTheLastOfUsPartI(
  game: Game,
  translation: Translation,
  targetRoot: string,
  runtime: NodeRuntime,
  onProgress: (state: InstallationState) => void
) {
  let temporaryExtractionRoot = "";

  try {
    const mainDirectory = runtime.path.resolve(targetRoot, ...TLOU_MAIN_SEGMENTS);
    if (!isPathInsideTarget(targetRoot, mainDirectory, runtime)) {
      throw new Error("Blocked unsafe game sub-path for The Last of Us Part I.");
    }

    let mainDirectoryStats: import("node:fs").Stats;
    try {
      mainDirectoryStats = await runtime.fs.stat(mainDirectory);
    } catch {
      throw new Error("The Last of Us Part I path is missing build\\pc\\main.");
    }
    if (!mainDirectoryStats.isDirectory()) {
      throw new Error("The Last of Us Part I build\\pc\\main path is not a folder.");
    }

    const corePsarcPath = await resolveCorePsarcPath(targetRoot, mainDirectory, runtime);

    onProgress({
      step: "downloading",
      progress: 12,
      message: "Authorizing secure tool package download...",
    });
    const tlouDownloads = await resolveTranslationDownloads(game, translation, runtime);
    if (tlouDownloads.length !== 1) {
      throw new Error("The Last of Us Part I expects a single tool package download.");
    }
    const toolPackageDownload = tlouDownloads[0];
    const zipBuffer = await downloadArchive(toolPackageDownload.url, runtime);

    const extractionResult = await extractArchiveToTempDirectory(
      zipBuffer,
      toolPackageDownload.extensionHint || toolPackageDownload.url,
      runtime,
      onProgress,
      30,
      52,
      "Extracting tool package"
    );
    temporaryExtractionRoot = extractionResult.extractionRoot;

    const toolPath = await findPathByNameRecursively(
      temporaryExtractionRoot,
      TLOU_TOOL_FILE_NAME,
      false,
      runtime
    );
    if (!toolPath) {
      throw new Error("TLOU PSARC Tool.exe was not found in toolandfilles.");
    }

    const fontsDirectory = await findPathByNameRecursively(
      temporaryExtractionRoot,
      "fonts",
      true,
      runtime
    );
    if (!fontsDirectory) {
      throw new Error("fonts folder was not found in toolandfilles.");
    }

    const text2Directory = await findPathByNameRecursively(
      temporaryExtractionRoot,
      "text2",
      true,
      runtime
    );
    if (!text2Directory) {
      throw new Error("text2 folder was not found in toolandfilles.");
    }

    onProgress({
      step: "copying",
      progress: 56,
      message: "Using local core.psarc from build\\pc\\main...",
    });

    onProgress({
      step: "copying",
      progress: 58,
      message: "Launching TLOU PSARC Tool...",
    });
    await runTlouToolAutomatedExport(toolPath, corePsarcPath, mainDirectory, runtime, onProgress);

    const installedFiles: string[] = [];

    await copyDirectoryIntoGame(
      fontsDirectory,
      runtime.path.join(mainDirectory, "fonts"),
      targetRoot,
      runtime,
      onProgress,
      72,
      84,
      "fonts",
      installedFiles
    );

    await copyDirectoryIntoGame(
      text2Directory,
      runtime.path.join(mainDirectory, "text2"),
      targetRoot,
      runtime,
      onProgress,
      84,
      96,
      "text2",
      installedFiles
    );

    onProgress({
      step: "copying",
      progress: 98,
      message: "Finalizing The Last of Us Part I installation...",
    });

    try {
      await runtime.fs.rm(corePsarcPath, { force: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown delete error";
      throw new Error(`Failed to delete core.psarc: ${errorMessage}`);
    }

    onProgress({
      step: "success",
      progress: 100,
      message: "The Last of Us Part I translation installed successfully.",
      installedFiles,
    });
  } finally {
    if (temporaryExtractionRoot) {
      try {
        await runtime.fs.rm(temporaryExtractionRoot, { recursive: true, force: true });
      } catch {
        // Best-effort temporary folder cleanup.
      }
    }
  }
}

export const installerService = {
  async install(
    game: Game,
    translation: Translation,
    targetPath: string,
    onProgress: (state: InstallationState) => void
  ) {
    try {
      const runtime = getNodeRuntime();
      if (!runtime) {
        throw new Error("Desktop installation requires running inside the Electron app.");
      }

      const targetRoot = runtime.path.resolve(targetPath.trim());
      if (!targetRoot) {
        throw new Error("Invalid installation path.");
      }

      // 1. Validate selected folder.
      onProgress({ step: "validating", progress: 5, message: "Validating selected game path..." });
      try {
        const targetStats = await runtime.fs.stat(targetRoot);
        if (!targetStats.isDirectory()) {
          throw new Error("Selected path is not a directory.");
        }
      } catch {
        throw new Error("Selected game path is invalid or inaccessible.");
      }

      // If executable is configured, try to validate it, but do not block install.
      if (game.executable) {
        const executablePath = runtime.path.join(targetRoot, game.executable);
        try {
          await runtime.fs.access(executablePath);
        } catch {
          onProgress({
            step: "validating",
            progress: 8,
            message: `Warning: ${game.executable} not found. Continuing anyway...`,
          });
        }
      }

      // Remove legacy backup folder from older installer versions.
      await runtime.fs.rm(runtime.path.join(targetRoot, ".polaris-backup"), {
        recursive: true,
        force: true,
      });

      if (game.id === TLOU_GAME_ID) {
        await installTheLastOfUsPartI(game, translation, targetRoot, runtime, onProgress);
        return;
      }

      const installedFiles: string[] = [];
      // 2. Resolve one or more patch archives.
      onProgress({ step: "downloading", progress: 10, message: "Authorizing patch download..." });
      const archiveDownloads = await resolveTranslationDownloads(game, translation, runtime);
      const totalParts = archiveDownloads.length;

      for (let partIndex = 0; partIndex < archiveDownloads.length; partIndex += 1) {
        const archiveDownload = archiveDownloads[partIndex];
        const partLabel =
          totalParts > 1 ? `${archiveDownload.label} (${partIndex + 1}/${totalParts})` : archiveDownload.label;

        const baseOffset = Math.floor((partIndex / totalParts) * 86);
        const nextOffset = Math.floor(((partIndex + 1) / totalParts) * 86);
        const partStart = 10 + baseOffset;
        const partEnd = 10 + nextOffset;
        const extractionStart = Math.max(partStart + 4, Math.min(partStart + 18, partEnd - 8));
        const extractionEnd = Math.max(extractionStart + 1, Math.min(extractionStart + 12, partEnd - 4));
        const copyStart = Math.max(extractionEnd + 1, partEnd - 3);
        const copyEnd = Math.max(copyStart, partEnd);

        onProgress({
          step: "downloading",
          progress: Math.min(partStart, 95),
          message:
            archiveDownload.source === "gateway"
              ? `Downloading ${partLabel} via secure gateway...`
              : `Downloading ${partLabel}...`,
        });

        const archiveBuffer = await downloadArchive(archiveDownload.url, runtime);
        const extractionResult = await extractArchiveToTempDirectory(
          archiveBuffer,
          archiveDownload.extensionHint || archiveDownload.url,
          runtime,
          onProgress,
          extractionStart,
          extractionEnd,
          `Extracting ${partLabel}`
        );
        const temporaryExtractionRoot = extractionResult.extractionRoot;
        const files = extractionResult.extractedFiles;

        try {
          // 3. Copy patched files to game folder (overwrite in place) preserving archive relative paths.
          for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
            const sourcePath = files[fileIndex];
            const archiveRelativePath = runtime.path.relative(temporaryExtractionRoot, sourcePath);
            const relativePath = sanitizeZipPath(archiveRelativePath);
            const destinationPath = runtime.path.resolve(targetRoot, relativePath);

            if (!isPathInsideTarget(targetRoot, destinationPath, runtime)) {
              throw new Error(`Blocked unsafe file path in archive: ${archiveRelativePath}`);
            }

            await runtime.fs.mkdir(runtime.path.dirname(destinationPath), { recursive: true });
            await runtime.fs.copyFile(sourcePath, destinationPath);
            installedFiles.push(relativePath);

            const fileProgress = copyStart + Math.round(((fileIndex + 1) / files.length) * (copyEnd - copyStart));
            onProgress({
              step: "copying",
              progress: Math.min(fileProgress, 99),
              message: `Applying ${partLabel} files ${fileIndex + 1}/${files.length}...`,
            });
          }
        } finally {
          try {
            await runtime.fs.rm(temporaryExtractionRoot, { recursive: true, force: true });
          } catch {
            // Best-effort cleanup for temporary extraction files.
          }
        }
      }

      onProgress({
        step: "success",
        progress: 100,
        message: `Translation installed successfully (${installedFiles.length} files).`,
        installedFiles,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      onProgress({ 
        step: "error", 
        progress: 0, 
        message: errorMessage, 
        error: errorMessage
      });
    }
  },
  async uninstall(
    targetPath: string,
    installedFiles: string[],
    onProgress: (state: InstallationState) => void
  ) {
    try {
      const runtime = getNodeRuntime();
      if (!runtime) {
        throw new Error("Desktop uninstall requires running inside the Electron app.");
      }

      const targetRoot = runtime.path.resolve(targetPath.trim());
      if (!targetRoot) {
        throw new Error("Invalid installation path.");
      }

      onProgress({ step: "validating", progress: 5, message: "Validating selected game path..." });

      let targetStats: import("node:fs").Stats;
      try {
        targetStats = await runtime.fs.stat(targetRoot);
      } catch {
        throw new Error("Selected game path is invalid or inaccessible.");
      }

      if (!targetStats.isDirectory()) {
        throw new Error("Selected game path is not a directory.");
      }

      const uniqueRelativePaths = Array.from(new Set(installedFiles.map((pathPart) => sanitizeZipPath(pathPart))));
      if (uniqueRelativePaths.length === 0) {
        throw new Error("No installed translation file list was found for this game.");
      }

      let removedCount = 0;

      for (let index = 0; index < uniqueRelativePaths.length; index += 1) {
        const relativePath = uniqueRelativePaths[index];
        const destinationPath = runtime.path.resolve(targetRoot, relativePath);

        if (!isPathInsideTarget(targetRoot, destinationPath, runtime)) {
          throw new Error(`Blocked unsafe uninstall path: ${relativePath}`);
        }

        try {
          await runtime.fs.rm(destinationPath, { force: true });
          removedCount += 1;
          await removeEmptyParentDirectories(runtime.path.dirname(destinationPath), targetRoot, runtime);
        } catch {
          // Ignore missing files and continue deleting what exists.
        }

        const progress = 10 + Math.round(((index + 1) / uniqueRelativePaths.length) * 89);
        onProgress({
          step: "copying",
          progress: Math.min(progress, 99),
          message: `Removing files ${index + 1}/${uniqueRelativePaths.length}...`,
        });
      }

      onProgress({
        step: "success",
        progress: 100,
        message: `Translation removed successfully (${removedCount} files).`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      onProgress({
        step: "error",
        progress: 0,
        message: errorMessage,
        error: errorMessage,
      });
    }
  },
};
