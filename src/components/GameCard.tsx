import { motion } from "motion/react";
import { Gamepad2 } from "lucide-react";
import { Game } from "../types";

interface GameCardProps {
  game: Game;
  onClick: (game: Game) => void;
  isInstalled?: boolean;
  hideTitle?: boolean;
}

export default function GameCard({ game, onClick, isInstalled, hideTitle = false }: GameCardProps) {
  return (
    <motion.div
      className={`group relative bg-[#1A1A1A]/40 backdrop-blur-md border rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 flex flex-col h-full ${
        isInstalled ? "border-[#00D2FF]/50 shadow-[0_0_30px_rgba(0,210,255,0.15)]" : "border-white/5 hover:border-[#00D2FF]/40"
      }`}
      whileHover={{ 
        y: -10, 
        scale: 1.02,
        boxShadow: "0 20px 40px rgba(0,0,0,0.4), 0 0 20px rgba(0,210,255,0.1)"
      }}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.5, 
        ease: [0.23, 1, 0.32, 1]
      }}
      onClick={() => onClick(game)}
    >
      {/* Image Container */}
      <div className="relative aspect-[16/9] overflow-hidden bg-[#151619] shrink-0">
        <motion.img
          src={game.thumbnailImage}
          alt={game.title}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.dataset.fallbackApplied !== "1" && game.bannerImage && target.src !== game.bannerImage) {
              target.dataset.fallbackApplied = "1";
              target.src = game.bannerImage;
              return;
            }

            target.src = "/assets/red-set/windows/icon-256x256.png";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C10] via-transparent to-transparent opacity-80" />
        
        {/* Genre Badge (Subtle) */}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div className="px-2 py-0.5 bg-black/40 backdrop-blur-md rounded border border-white/10">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em]">{game.category}</span>
          </div>
          {isInstalled && (
            <motion.div 
              className="px-2 py-0.5 bg-[#00D2FF]/10 backdrop-blur-md rounded-md border border-[#00D2FF]/20"
              animate={{ 
                opacity: [0.6, 1, 0.6],
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <span className="text-[8px] font-bold text-[#00D2FF] uppercase tracking-[0.2em]">Installed</span>
            </motion.div>
          )}
        </div>

        {/* Rating Overlay */}
        <div className="absolute bottom-4 right-4 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded-md border border-white/10 flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-white/60 tracking-tighter">{game.rating}</span>
          <Gamepad2 size={10} className="text-[#00D2FF]/50" />
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1 relative">
        <div className="mb-2 min-h-6">
          {!hideTitle && (
            <motion.h3 
              className="text-base font-bold text-white group-hover:text-[#00D2FF] transition-colors line-clamp-1 tracking-tight"
            >
              {game.title}
            </motion.h3>
          )}
        </div>
        
        <p className="text-[11px] text-white/20 line-clamp-2 font-medium leading-relaxed">
          {game.description || `Experience ${game.title} with professional Arabic localization and cultural precision.`}
        </p>
      </div>

      {/* Hover Glow Effect */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00D2FF]/5 to-transparent" />
      </div>
    </motion.div>
  );
}
