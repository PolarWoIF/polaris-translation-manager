import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "motion/react";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Logo from "./components/Logo";
import GameCard from "./components/GameCard";
import LocalizationModal from "./components/LocalizationModal";
import { Search, Filter, LayoutGrid, List, ChevronRight, RefreshCw, ArrowUpRight } from "lucide-react";
import { installerService } from "./services/installerService";
import { AppData, Game, GameStatus, InstallationState } from "./types";
import { dataService, ContentLoadResult } from "./services/dataService";
import { updateService, AppUpdateState } from "./services/updateService";
import { desktopUpdaterService, DesktopUpdaterState } from "./services/desktopUpdaterService";
import { APP_VERSION } from "./constants";

const GAMES_PER_PAGE = 15;
const CONTENT_AUTO_REFRESH_INTERVAL_MS = 90 * 1000;

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoadError, setContentLoadError] = useState<string | null>(null);
  const [isRefreshingContent, setIsRefreshingContent] = useState(false);
  const [contentState, setContentState] = useState<ContentLoadResult | null>(null);
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState | null>(null);
  const [desktopUpdateState, setDesktopUpdateState] = useState<DesktopUpdaterState | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const isBackgroundSyncRunningRef = useRef(false);
  const latestContentVersionRef = useRef("");
  const latestGameCountRef = useRef(0);

  const loadContent = useCallback(async (forceRemote = false) => {
    if (forceRemote) {
      setIsRefreshingContent(true);
    } else {
      setLoading(true);
    }

    try {
      const result = forceRemote ? await dataService.refreshData() : await dataService.fetchData();
      setData(result.data);
      setContentState(result);
      setContentLoadError(null);
      if (result.warning) {
        console.warn(`[Content] ${result.warning}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load game library.";
      setContentLoadError(message);
      console.error(`[Content] ${message}`);
    } finally {
      setLoading(false);
      setIsRefreshingContent(false);
    }
  }, []);

  const checkAppUpdates = useCallback(async () => {
    const result = await updateService.checkForUpdates();
    setAppUpdateState(result);
    if (result.error) {
      console.warn(`[App Update] ${result.error}`);
    }
  }, []);

  const refreshContentInBackground = useCallback(async () => {
    if (isBackgroundSyncRunningRef.current) return;
    isBackgroundSyncRunningRef.current = true;

    try {
      const result = await dataService.refreshData();
      const hasVersionChanged = result.contentVersion !== latestContentVersionRef.current;
      const hasGameCountChanged = result.data.games.length !== latestGameCountRef.current;

      if (!hasVersionChanged && !hasGameCountChanged) {
        return;
      }

      setData(result.data);
      setContentState(result);
      setContentLoadError(null);
      if (result.warning) {
        console.warn(`[Content] ${result.warning}`);
      } else {
        console.info(
          `[Content] Auto-refresh applied. Version: ${result.contentVersion} | Games: ${result.data.games.length}`
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[Content] Background refresh skipped (${reason}).`);
    } finally {
      isBackgroundSyncRunningRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadContent(false);
    void checkAppUpdates();
  }, [checkAppUpdates, loadContent]);

  useEffect(() => {
    latestContentVersionRef.current = contentState?.contentVersion ?? "";
    latestGameCountRef.current = data?.games.length ?? 0;
  }, [contentState?.contentVersion, data?.games.length]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshContentInBackground();
    }, CONTENT_AUTO_REFRESH_INTERVAL_MS);

    const handleWindowFocus = () => {
      void refreshContentInBackground();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshContentInBackground();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshContentInBackground]);

  useEffect(() => {
    const unsubscribe = desktopUpdaterService.subscribe((state) => {
      setDesktopUpdateState(state);
    });
    void desktopUpdaterService.initialize();
    return () => {
      unsubscribe();
      desktopUpdaterService.dispose();
    };
  }, []);
  
  // Manage status for all games
  const [gameStatuses, setGameStatuses] = useState<Record<string, GameStatus>>(() => {
    const saved = localStorage.getItem("gameStatuses");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Reset any stuck "installing" states to "not-installed" or "error" on load
      Object.keys(parsed).forEach(id => {
        if (parsed[id].status === "installing") {
          parsed[id].status = "not-installed";
          parsed[id].progress = 0;
        }
      });
      return parsed;
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem("gameStatuses", JSON.stringify(gameStatuses));
  }, [gameStatuses]);

  const getGameStatus = (gameId: string): GameStatus => {
    return gameStatuses[gameId] || {
      gameId,
      status: "not-installed",
      progress: 0,
      statusText: "Ready to install",
      installPath: ""
    };
  };

  const updateGameStatus = (gameId: string, updates: Partial<GameStatus>) => {
    setGameStatuses(prev => ({
      ...prev,
      [gameId]: { ...getGameStatus(gameId), ...updates }
    }));
  };

  const handleGameClick = (game: Game) => {
    setSelectedGame(game);
    setIsModalOpen(true);
  };

  const handlePathChange = (gameId: string, path: string) => {
    updateGameStatus(gameId, { installPath: path });
  };

  const handleInstall = async (gameId: string, translationId: string) => {
    const game = data?.games.find(g => g.id === gameId);
    if (!game) return;

    const translation = game.translations.find(t => t.id === translationId);
    if (!translation) return;

    const status = getGameStatus(gameId);
    if (!status.installPath) {
      updateGameStatus(gameId, { status: "error", statusText: "No installation path selected" });
      return;
    }

    updateGameStatus(gameId, { 
      status: "installing", 
      progress: 0, 
      statusText: "Initializing..." 
    });

    try {
      await installerService.install(
        game,
        translation,
        status.installPath,
        (installState: InstallationState) => {
          const updates: Partial<GameStatus> = {
            status:
              installState.step === "error"
                ? "error"
                : installState.step === "success"
                  ? "installed"
                  : "installing",
            progress: installState.progress,
            statusText: installState.message,
            error: installState.error,
          };

          if (installState.step === "success") {
            updates.installedPatchId = translationId;
            updates.installedFiles = installState.installedFiles;
            updates.error = undefined;
          }

          updateGameStatus(gameId, updates);
        }
      );
    } catch (err) {
      updateGameStatus(gameId, { 
        status: "error", 
        statusText: "Installation failed unexpectedly"
      });
    }
  };

  const handleUninstall = (gameId: string) => {
    const status = getGameStatus(gameId);

    if (!status.installPath) {
      updateGameStatus(gameId, {
        status: "error",
        progress: 0,
        statusText: "No installation path selected",
      });
      return;
    }

    if (!status.installedFiles || status.installedFiles.length === 0) {
      updateGameStatus(gameId, {
        status: "error",
        progress: 0,
        statusText: "No tracked files for uninstall. Reinstall patch then try again.",
      });
      return;
    }

    updateGameStatus(gameId, {
      status: "installing",
      progress: 0,
      statusText: "Preparing translation removal...",
      error: undefined,
    });

    installerService.uninstall(status.installPath, status.installedFiles, (uninstallState: InstallationState) => {
      if (uninstallState.step === "success") {
        updateGameStatus(gameId, {
          status: "not-installed",
          progress: 0,
          statusText: "Ready to install",
          installedPatchId: undefined,
          installedFiles: undefined,
          error: undefined,
        });
        return;
      }

      updateGameStatus(gameId, {
        status: uninstallState.step === "error" ? "error" : "installing",
        progress: uninstallState.progress,
        statusText: uninstallState.message,
        error: uninstallState.error,
      });
    });
  };

  const filteredGames = data?.games.filter((game) => {
    const matchesSearch = game.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGenre = selectedGenre === "All" || game.category.toLowerCase().includes(selectedGenre.toLowerCase());
    return matchesSearch && matchesGenre;
  }) || [];

  const totalPages = Math.ceil(filteredGames.length / GAMES_PER_PAGE);
  const startIndex = (currentPage - 1) * GAMES_PER_PAGE;
  const paginatedGames = filteredGames.slice(startIndex, startIndex + GAMES_PER_PAGE);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };


  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(1);
      return;
    }

    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const formatSyncTime = (isoDate: string) => {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return isoDate;
    return parsed.toLocaleString();
  };

  const showDesktopUpdateBanner =
    desktopUpdateState &&
    ["checking", "available", "downloading", "downloaded", "error"].includes(desktopUpdateState.phase);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex flex-col items-center justify-center gap-8">
        <Logo className="w-32 h-32 animate-pulse drop-shadow-[0_0_30px_rgba(0,210,255,0.3)]" />
        <div className="flex flex-col items-center gap-2">
          <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-[#00D2FF]"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <span className="text-[10px] font-black text-[#00D2FF] uppercase tracking-[0.4em]">Loading Assets</span>
        </div>
      </div>
    );
  }

  if (contentLoadError && !data) {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex flex-col items-center justify-center gap-6 px-6 text-center">
        <Logo className="w-24 h-24" />
        <div className="max-w-xl">
          <h1 className="text-xl font-black text-white uppercase tracking-widest mb-3">Content Sync Failed</h1>
          <p className="text-sm text-white/60 leading-relaxed">{contentLoadError}</p>
        </div>
        <button
          onClick={() => void loadContent(true)}
          className="px-6 py-3 rounded-xl bg-[#00D2FF] text-black text-xs font-black uppercase tracking-[0.2em] hover:shadow-[0_0_25px_rgba(0,210,255,0.35)] transition-all"
        >
          Retry Cloudflare Sync
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0C10] text-white selection:bg-[#00D2FF] selection:text-black overflow-x-hidden">
      <Navbar />
      
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <Hero 
          installedCount={Object.values(gameStatuses).filter((s: GameStatus) => s.status === "installed").length} 
          totalGames={data?.games.length || 0}
        />

        {showDesktopUpdateBanner && desktopUpdateState && (
          <section className="max-w-7xl mx-auto px-6 pt-6">
            <div className="w-full border border-[#00D2FF]/30 bg-[#00D2FF]/10 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs font-bold text-white/90 uppercase tracking-[0.2em]">
                {desktopUpdateState.phase === "checking" &&
                  `Checking App Updates (Current v${desktopUpdateState.currentVersion ?? APP_VERSION})...`}
                {desktopUpdateState.phase === "available" &&
                  `App Update Found: v${desktopUpdateState.latestVersion ?? "latest"} (downloading...)`}
                {desktopUpdateState.phase === "downloading" &&
                  `Downloading Update v${desktopUpdateState.latestVersion ?? "latest"} (${Math.round(
                    desktopUpdateState.progressPercent
                  )}%)`}
                {desktopUpdateState.phase === "downloaded" &&
                  `Update Ready: v${desktopUpdateState.latestVersion ?? "latest"}. Restart to install.`}
                {desktopUpdateState.phase === "error" &&
                  `App Update Check Failed: ${desktopUpdateState.error ?? desktopUpdateState.message}`}
              </p>
              {desktopUpdateState.phase === "downloaded" ? (
                <button
                  onClick={() => void desktopUpdaterService.restartAndInstall()}
                  className="inline-flex items-center gap-2 text-xs font-black text-[#00D2FF] hover:text-white uppercase tracking-[0.2em] transition-colors"
                >
                  Restart & Install
                </button>
              ) : (
                <button
                  onClick={() => void desktopUpdaterService.checkNow()}
                  className="inline-flex items-center gap-2 text-xs font-black text-[#00D2FF] hover:text-white uppercase tracking-[0.2em] transition-colors"
                >
                  Check Again
                </button>
              )}
            </div>
          </section>
        )}

        {!showDesktopUpdateBanner && appUpdateState?.available && (
          <section className="max-w-7xl mx-auto px-6 pt-6">
            <div className="w-full border border-[#00D2FF]/30 bg-[#00D2FF]/10 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs font-bold text-white/90 uppercase tracking-[0.2em]">
                App Update Available: v{appUpdateState.latestVersion}
              </p>
              {appUpdateState.releaseUrl && (
                <a
                  href={appUpdateState.releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-xs font-black text-[#00D2FF] hover:text-white uppercase tracking-[0.2em] transition-colors"
                >
                  Open Release
                  <ArrowUpRight size={14} />
                </a>
              )}
            </div>
          </section>
        )}

        {/* Game Library Section */}
        <section id="library" className="max-w-7xl mx-auto px-6 py-20 relative">
          {/* Decorative Elements */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00D2FF]/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 blur-[120px] rounded-full pointer-events-none" />

          {/* Most Popular Moving Carousel */}
          {selectedGenre === "All" && !searchQuery && (
            <motion.div 
              className="mb-32 overflow-hidden"
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <div className="flex items-center justify-between mb-12 px-2">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <motion.div 
                      className="w-12 h-1.5 bg-gradient-to-r from-[#00D2FF] to-[#0080FF] rounded-full" 
                      animate={{ width: [48, 80, 48] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    />
                    <span className="text-sm font-black text-[#00D2FF] uppercase tracking-[0.4em]">Trending Now</span>
                  </div>
                  <h2 className="text-5xl font-black text-white uppercase tracking-tighter">Most <span className="text-white/30 italic">Popular</span></h2>
                </div>
                <div className="hidden md:flex items-center gap-4">
                  <div className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 backdrop-blur-md">
                    Auto-Scrolling
                  </div>
                </div>
              </div>
              
              <div className="relative group/carousel">
                <motion.div 
                  className="flex gap-8"
                  animate={{ 
                    x: [0, -1920] 
                  }}
                  transition={{ 
                    duration: 50, 
                    repeat: Infinity, 
                    ease: "linear" 
                  }}
                  whileHover={{ transition: { duration: 100 } }}
                >
                  {(data?.games || []).slice(0, 10).map((game, idx) => (
                    <div key={`popular-${game.id}-${idx}`} className="w-[380px] shrink-0">
                      <GameCard 
                        game={game} 
                        onClick={handleGameClick} 
                        isInstalled={getGameStatus(game.id).status === "installed"}
                        hideTitle
                      />
                    </div>
                  ))}
                </motion.div>
                
                {/* Fade Gradients */}
                <div className="absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-[#0B0C10] to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-[#0B0C10] to-transparent z-10 pointer-events-none" />
              </div>
            </motion.div>
          )}

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-1 bg-[#00D2FF] rounded-full" />
                <span className="text-xs font-black text-[#00D2FF] uppercase tracking-[0.3em]">Explore Library</span>
              </div>
              <h2 className="text-4xl font-black text-white uppercase tracking-tight">Game <span className="text-white/40 italic">Collection</span></h2>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 md:w-80">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                  <input
                    type="text"
                    placeholder="Search your game..."
                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-medium focus:border-[#00D2FF]/50 outline-none transition-all"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-3 rounded-xl border transition-all ${
                    showFilters || selectedGenre !== "All"
                      ? "bg-[#00D2FF] text-black border-[#00D2FF]" 
                      : "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                  }`}
                >
                  <Filter size={18} />
                </button>
                <button
                  onClick={() => void loadContent(true)}
                  disabled={isRefreshingContent}
                  className={`p-3 rounded-xl border transition-all ${
                    isRefreshingContent
                      ? "bg-[#00D2FF]/20 text-[#00D2FF] border-[#00D2FF]/40"
                      : "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                  }`}
                  title="Refresh Cloudflare content"
                >
                  <RefreshCw size={18} className={isRefreshingContent ? "animate-spin" : ""} />
                </button>
                <div className="hidden sm:flex items-center p-1 bg-white/5 rounded-xl border border-white/10">
                  <button className="p-2 bg-[#00D2FF] text-black rounded-lg">
                    <LayoutGrid size={18} />
                  </button>
                  <button className="p-2 text-white/40 hover:text-white transition-colors">
                    <List size={18} />
                  </button>
                </div>
              </div>

              {/* Genre Filter Chips */}
              {showFilters && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap gap-2 p-3 bg-white/5 border border-white/10 rounded-2xl"
                >
                  {(data?.categories.includes("All") ? data?.categories : ["All", ...(data?.categories || [])]).map((genre) => (
                    <button
                      key={genre}
                      onClick={() => {
                        setSelectedGenre(genre);
                        setCurrentPage(1);
                      }}
                      className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                        selectedGenre === genre
                          ? "bg-[#00D2FF] text-black shadow-[0_0_15px_rgba(0,210,255,0.3)]"
                          : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {genre}
                    </button>
                  ))}
                </motion.div>
              )}

            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8 mb-16">
            {paginatedGames.map((game, index) => (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (index % GAMES_PER_PAGE) * 0.05 }}
              >
                <GameCard 
                  game={game} 
                  onClick={handleGameClick} 
                  isInstalled={getGameStatus(game.id).status === "installed"}
                />
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-12">
              <button 
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-3 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white disabled:opacity-20 transition-all"
              >
                <ChevronRight className="rotate-180" size={18} />
              </button>
              {Array.from({ length: totalPages }).map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`w-12 h-12 rounded-xl font-black text-xs transition-all duration-500 border ${
                      currentPage === pageNum
                        ? "bg-[#00D2FF] text-black border-[#00D2FF] shadow-[0_0_30px_rgba(0,210,255,0.4)] scale-110"
                        : "bg-white/5 text-white/40 border-white/10 hover:border-[#00D2FF]/50 hover:text-white"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button 
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-3 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white disabled:opacity-20 transition-all"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          {filteredGames.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-white/40 font-bold uppercase tracking-widest">No games found matching your search.</p>
            </div>
          )}

          {contentState && (
            <div className="mt-16 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl flex flex-wrap items-center justify-center md:justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
              <div className="flex flex-wrap items-center gap-3">
                <span>Content: {contentState.source}</span>
                <span>Version: {contentState.contentVersion}</span>
                <span>Synced: {formatSyncTime(contentState.syncedAt)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {contentState.warning && <span className="text-amber-300">{contentState.warning}</span>}
                {contentLoadError && <span className="text-red-300">{contentLoadError}</span>}
                <button
                  onClick={() => void loadContent(true)}
                  disabled={isRefreshingContent}
                  className={`px-4 py-2 rounded-xl border transition-all ${
                    isRefreshingContent
                      ? "bg-[#00D2FF]/20 text-[#00D2FF] border-[#00D2FF]/40"
                      : "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                  }`}
                >
                  {isRefreshingContent ? "Refreshing..." : "Refresh Content"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="bg-black/40 border-t border-white/5 py-20">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <Logo className="w-10 h-10" />
                <span className="text-2xl font-black text-white tracking-tighter uppercase">POLAR TRANSLATION</span>
              </div>
              <p className="text-white/40 text-sm max-w-sm leading-relaxed">
                The world's leading platform for Arabic game localization. 
                Bringing stories to life in your language with professional precision.
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-black uppercase tracking-widest text-xs mb-6">Platform</h4>
              <ul className="space-y-4">
                {["Browse Games", "How it Works", "Pricing", "API Access"].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-white/40 hover:text-white transition-colors">{item}</a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-white font-black uppercase tracking-widest text-xs mb-6">Company</h4>
              <ul className="space-y-4">
                {["About Us", "Careers", "Privacy Policy", "Terms of Service"].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-white/40 hover:text-white transition-colors">{item}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="max-w-7xl mx-auto px-6 mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">
              (c) 2026 POLAR TRANSLATION. ALL RIGHTS RESERVED.
            </p>
            <div className="flex items-center gap-6">
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">Status: Online</span>
              <span className="text-[10px] font-bold text-[#00D2FF] uppercase tracking-[0.2em]">Version {APP_VERSION}</span>
            </div>
          </div>
        </footer>
      </motion.main>

      <LocalizationModal
        game={selectedGame}
        status={selectedGame ? getGameStatus(selectedGame.id) : null}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onPathChange={handlePathChange}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
      />
    </div>
  );
}

