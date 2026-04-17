import { motion } from "motion/react";
import { Download, CheckCircle2, Info, Share2 } from "lucide-react";
import { Translation } from "../types";

interface PatchCardProps {
  key?: string | number;
  patch: Translation;
  isInstalled: boolean;
  onInstall?: (patchId: string) => void;
  onSelect?: (patchId: string) => void;
  isSelected?: boolean;
  variant?: "selection" | "manage" | "modal-list";
}

export default function PatchCard({ 
  patch, 
  isInstalled, 
  onInstall, 
  onSelect,
  isSelected,
  variant = "selection" 
}: PatchCardProps) {
  const handleClick = () => {
    if (onSelect) onSelect(patch.id);
  };

  if (variant === "modal-list") {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={handleClick}
        className={`group relative p-4 rounded-xl border cursor-pointer transition-all duration-300 ${
          isSelected
            ? "bg-[#00D2FF]/10 border-[#00D2FF] shadow-[0_0_15px_rgba(0,210,255,0.1)]"
            : "bg-[#252525] border-white/5 hover:border-white/20"
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg ${isSelected ? "bg-[#00D2FF]/20 text-[#00D2FF]" : "bg-black/20 text-white/40"}`}>
            {patch.type === 'official' ? <CheckCircle2 size={18} /> : <Download size={18} />}
          </div>
          <div className="flex-1 text-left">
            <div className="flex items-center justify-between mb-0.5">
              <h4 className={`font-bold text-sm ${isSelected ? "text-[#00D2FF]" : "text-white"}`}>
                {patch.name}
              </h4>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">v{patch.version}</span>
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{patch.size}</span>
              </div>
            </div>
            <p className="text-[11px] text-white/50 leading-relaxed">{patch.description}</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${
        isInstalled 
          ? "bg-[#00D2FF]/5 border-[#00D2FF]/30" 
          : "bg-white/5 border-white/10 hover:border-white/20"
      }`}
    >
      {/* Type Badge */}
      <div className={`absolute top-0 right-0 px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-bl-xl ${
        patch.type === 'official' 
          ? 'bg-[#00D2FF] text-black shadow-[0_0_15px_rgba(0,210,255,0.3)]' 
          : 'bg-white/10 text-white/40'
      }`}>
        {patch.type}
      </div>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="text-lg font-black text-white uppercase tracking-tight mb-1 flex items-center gap-2">
            {patch.name}
            {isInstalled && <CheckCircle2 size={16} className="text-[#00D2FF]" />}
          </h4>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded">
              v{patch.version}
            </span>
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-2 py-0.5 border border-white/10 rounded">
              {patch.size}
            </span>
          </div>
        </div>
      </div>

      <p className="text-sm text-white/40 mb-6 line-clamp-2 italic font-medium">
        "{patch.description}"
      </p>

      <div className="flex items-center gap-3">
        {variant === "selection" ? (
          <button
            onClick={() => onInstall(patch.id)}
            disabled={isInstalled}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              isInstalled
                ? "bg-white/5 text-white/20 cursor-default"
                : "bg-white text-black hover:bg-[#00D2FF] hover:scale-[1.02] active:scale-[0.98]"
            }`}
          >
            {isInstalled ? (
              <>
                <CheckCircle2 size={14} />
                Installed
              </>
            ) : (
              <>
                <Download size={14} />
                Install Patch
              </>
            )}
          </button>
        ) : (
          <button
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-xs font-black bg-white/5 text-white/60 uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            <Info size={14} />
            Details
          </button>
        )}
        
        <button className="p-3.5 bg-white/5 border border-white/5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
          <Share2 size={14} />
        </button>
      </div>
    </motion.div>
  );
}
