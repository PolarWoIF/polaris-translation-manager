import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, CheckCircle2, FolderOpen, Trash2, ArrowRight, AlertCircle, Download } from "lucide-react";
import { Game, GameStatus, Translation } from "../types";
import PatchCard from "./PatchCard";

interface LocalizationModalProps {
  game: Game | null;
  status: GameStatus | null;
  isOpen: boolean;
  onClose: () => void;
  onPathChange: (gameId: string, path: string) => void;
  onInstall: (gameId: string, translationId: string) => void;
  onUninstall: (gameId: string) => void;
}

type Step = "path" | "selection" | "installing" | "complete" | "manage" | "error";

export default function LocalizationModal({ 
  game, 
  status, 
  isOpen, 
  onClose, 
  onPathChange, 
  onInstall, 
  onUninstall 
}: LocalizationModalProps) {
  const [step, setStep] = useState<Step>("path");
  const [localPath, setLocalPath] = useState("");
  const [selectedTranslationId, setSelectedTranslationId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && status) {
      setLocalPath(status.installPath);
      setSelectedTranslationId(status.installedPatchId || null);
      
      if (status.status === "installing") {
        setStep("installing");
      } else if (status.status === "installed") {
        setStep("manage");
      } else if (status.status === "error") {
        setStep("error");
      } else if (status.installPath) {
        setStep("selection");
      } else {
        setStep("path");
      }
    }
  }, [isOpen, status]);

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedPath = localPath.trim().replace(/^["']|["']$/g, "");
    if (game && cleanedPath) {
      setLocalPath(cleanedPath);
      onPathChange(game.id, cleanedPath);
      setStep("selection");
    }
  };

  const handleInstallClick = () => {
    if (game && selectedTranslationId) {
      onInstall(game.id, selectedTranslationId);
    }
  };

  if (!game || !status) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal Content */}
          <motion.div
            className="relative w-full max-w-2xl bg-[#1A1A1A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-[#00D2FF]/10"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header Image */}
            <div className="relative h-48 sm:h-64">
              <img
                src={game.bannerImage}
                alt={game.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] via-[#1A1A1A]/40 to-transparent" />
              
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 rounded-full border border-white/10 text-white transition-colors"
               >
                <X size={20} />
              </button>

              <div className="absolute bottom-6 left-8">
                <h2 className="text-3xl font-black text-white mb-1 tracking-tight">{game.title}</h2>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-[#00D2FF] text-black text-[10px] font-black rounded uppercase tracking-widest">Localization Hub</span>
                  <span className="text-white/60 text-xs font-medium">
                    {step === "path" && "Enter Game Directory"}
                    {step === "selection" && "Select Arabic Patch"}
                    {step === "installing" && status.statusText}
                    {step === "complete" && "Ready to Play"}
                    {step === "manage" && "Translation Management"}
                    {step === "error" && "Installation Failed"}
                  </span>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className="p-8">
              <AnimatePresence mode="wait">
                {step === "path" && (
                  <motion.div
                    key="path-step"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <form onSubmit={handlePathSubmit} className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                          <FolderOpen size={14} className="text-[#00D2FF]" />
                          Game Installation Path
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={localPath}
                            onChange={(e) => setLocalPath(e.target.value)}
                            placeholder="C:\\Program Files (x86)\\Steam\\steamapps\\common\\..."
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white text-sm focus:border-[#00D2FF] focus:ring-1 focus:ring-[#00D2FF] outline-none transition-all placeholder:text-white/10"
                            autoFocus
                          />
                        </div>
                        <p className="text-[10px] text-white/30 italic">
                          * Please provide the root directory where the game executable is located.
                        </p>
                      </div>

                      <button
                        type="submit"
                        disabled={!localPath.trim()}
                        className={`w-full py-4 rounded-xl font-black uppercase tracking-[0.2em] text-sm transition-all duration-300 flex items-center justify-center gap-3 ${
                          localPath.trim()
                            ? "bg-[#00D2FF] text-black shadow-[0_0_20px_rgba(0,210,255,0.3)] hover:shadow-[0_0_30px_rgba(0,210,255,0.5)]"
                            : "bg-white/5 text-white/20 cursor-not-allowed"
                        }`}
                      >
                        Continue to Selection
                        <ArrowRight size={18} />
                      </button>
                    </form>
                  </motion.div>
                )}

                {step === "manage" && (
                  <motion.div
                    key="manage-step"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="py-4 space-y-6"
                  >
                    <div className="p-6 bg-[#00D2FF]/5 border border-[#00D2FF]/20 rounded-2xl flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#00D2FF]/10 rounded-xl flex items-center justify-center text-[#00D2FF]">
                        <CheckCircle2 size={24} />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-white font-bold">Translation Installed</h4>
                        <p className="text-white/40 text-xs">
                          {game.translations.find(t => t.id === status.installedPatchId)?.name} is currently active.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      <button
                        onClick={onClose}
                        className="w-full py-4 bg-[#00D2FF] text-black font-black rounded-xl uppercase text-sm tracking-widest hover:shadow-[0_0_20px_rgba(0,210,255,0.3)] transition-all"
                      >
                        Launch Game
                      </button>
                      <button
                        onClick={() => setStep("selection")}
                        className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-black rounded-xl uppercase text-xs tracking-widest border border-white/10 transition-all"
                      >
                        Change Patch Version
                      </button>
                      <button
                        onClick={() => onUninstall(game.id)}
                        className="w-full py-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-black rounded-xl uppercase text-xs tracking-widest border border-red-500/20 transition-all flex items-center justify-center gap-2"
                      >
                        <Trash2 size={16} />
                        Uninstall Translation
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === "selection" && (
                  <motion.div
                    key="selection-step"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {game.translations.map((translation) => (
                        <PatchCard
                          key={translation.id}
                          patch={translation}
                          isInstalled={status.installedPatchId === translation.id}
                          isSelected={selectedTranslationId === translation.id}
                          onSelect={(id) => setSelectedTranslationId(id)}
                          variant="modal-list"
                        />
                      ))}
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => status.installedPatchId ? setStep("manage") : setStep("path")}
                        className="px-6 py-4 bg-white/5 hover:bg-white/10 text-white font-black rounded-xl uppercase text-xs tracking-widest transition-all"
                      >
                        Back
                      </button>
                      <button
                        disabled={!selectedTranslationId || status.status === "installing"}
                        onClick={handleInstallClick}
                        className={`flex-1 py-4 rounded-xl font-black uppercase tracking-[0.2em] text-sm transition-all duration-300 flex items-center justify-center gap-3 ${
                          selectedTranslationId
                            ? "bg-[#00D2FF] text-black shadow-[0_0_20px_rgba(0,210,255,0.3)]"
                            : "bg-white/5 text-white/20 cursor-not-allowed"
                        }`}
                      >
                        <Download size={18} />
                        {status.installedPatchId ? "Update Patch" : "Install Patch"}
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === "installing" && (
                  <motion.div
                    key="installing-step"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-12 space-y-8"
                  >
                    <div className="flex flex-col items-center gap-6">
                      <div className="relative w-24 h-24">
                        <svg className="w-full h-full" viewBox="0 0 100 100">
                          <circle
                            className="text-white/5 stroke-current"
                            strokeWidth="8"
                            cx="50"
                            cy="50"
                            r="40"
                            fill="transparent"
                          />
                          <motion.circle
                            className="text-[#00D2FF] stroke-current"
                            strokeWidth="8"
                            strokeLinecap="round"
                            cx="50"
                            cy="50"
                            r="40"
                            fill="transparent"
                            initial={{ strokeDasharray: "0 251.2" }}
                            animate={{ strokeDasharray: `${(status.progress / 100) * 251.2} 251.2` }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xl font-black text-white">{Math.round(status.progress)}%</span>
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <h3 className="text-xl font-black text-white uppercase tracking-widest mb-2">
                          {status.statusText}
                        </h3>
                        <p className="text-white/40 text-xs">
                          Applying {game.translations.find(t => t.id === selectedTranslationId)?.name}
                        </p>
                      </div>
                    </div>

                    <div className="h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
                      <motion.div
                        className="h-full bg-gradient-to-r from-[#00D2FF] to-[#0080FF]"
                        initial={{ width: 0 }}
                        animate={{ width: `${status.progress}%` }}
                      />
                    </div>
                  </motion.div>
                )}

                {step === "error" && (
                  <motion.div
                    key="error-step"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-8 flex flex-col items-center justify-center text-center"
                  >
                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6 border border-red-500/30">
                      <AlertCircle size={40} className="text-red-400" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">
                      Installation Failed
                    </h3>
                    <p className="text-white/60 text-sm max-w-xs mb-8">
                      {status.statusText || "An unexpected error occurred during installation."}
                    </p>
                    
                    <div className="flex flex-col w-full gap-3">
                      <button
                        onClick={() => setStep("selection")}
                        className="w-full py-4 bg-[#00D2FF] text-black font-black rounded-xl uppercase text-sm tracking-widest transition-all"
                      >
                        Try Again
                      </button>
                      <button
                        onClick={onClose}
                        className="w-full py-4 bg-white/5 text-white font-black rounded-xl uppercase text-xs tracking-widest border border-white/10 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
