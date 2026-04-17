import { motion } from "motion/react";
import Logo from "./Logo";
import { ChevronRight, Play, Gamepad2, Layers, BookOpen } from "lucide-react";

interface HeroProps {
  installedCount: number;
  totalGames: number;
}

export default function Hero({ installedCount, totalGames }: HeroProps) {
  return (
    <section className="relative w-full h-[90vh] flex items-center justify-center overflow-hidden bg-[#0B0C10]">
      {/* Immersive Background */}
      <div className="absolute inset-0 z-0">
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-radial-gradient from-[#00D2FF]/20 via-transparent to-transparent opacity-60 blur-[150px]"
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.4, 0.6, 0.4]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        
        {/* Large Transparent Logo Background */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          <motion.img 
            src="assets/green-set/windows/icon-256x256.png" 
            alt="Background Logo" 
            className="w-[120%] h-[120%] object-contain opacity-[0.03] grayscale blur-[2px]"
            animate={{ 
              rotate: [0, 5, 0, -5, 0],
              scale: [1, 1.05, 1]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        {/* Animated Squares Layer */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={`square-${i}`}
              className="absolute border border-[#00D2FF]/10 bg-[#00D2FF]/5"
              style={{
                width: Math.random() * 100 + 50,
                height: Math.random() * 100 + 50,
                left: Math.random() * 100 + "%",
                top: Math.random() * 100 + "%",
              }}
              initial={{ opacity: 0, scale: 0, rotate: 0 }}
              animate={{ 
                opacity: [0, 0.2, 0],
                scale: [0.5, 1.2, 0.5],
                rotate: [0, 180, 360],
                y: [0, -100, 0]
              }}
              transition={{ 
                duration: Math.random() * 10 + 10, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: Math.random() * 5
              }}
            />
          ))}
        </div>
        
        {/* Floating Particles Simulation */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(30)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-[#00D2FF] rounded-full opacity-20"
              initial={{ 
                x: Math.random() * 100 + "%", 
                y: Math.random() * 100 + "%",
                scale: Math.random() * 2
              }}
              animate={{ 
                y: [null, Math.random() * -100 - 50 + "%"],
                opacity: [0, 0.4, 0]
              }}
              transition={{ 
                duration: Math.random() * 10 + 10, 
                repeat: Infinity, 
                ease: "linear",
                delay: Math.random() * 10
              }}
            />
          ))}
        </div>

        {/* Animated Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 1.2, type: "spring", bounce: 0.4 }}
          className="mb-12"
        >
          <Logo className="w-48 h-48 sm:w-72 sm:h-72 drop-shadow-[0_0_60px_rgba(0,210,255,0.5)]" />
        </motion.div>

        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          <h1 className="text-6xl sm:text-8xl md:text-9xl font-black text-white mb-8 tracking-tighter leading-none uppercase">
            POLAR <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D2FF] via-white to-[#00D2FF] bg-[length:200%_auto] animate-gradient-x">TRANSLATION</span>
          </h1>
        </motion.div>

        <motion.p 
          className="text-xl sm:text-2xl text-white/70 mb-12 max-w-3xl font-light leading-relaxed tracking-wide"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          The ultimate hub for professional Arabic game localization. 
          Experience your favorite titles with high-quality translations and cultural precision.
        </motion.p>

        <motion.div 
          className="flex flex-wrap items-center justify-center gap-6"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.8 }}
        >
          <button 
            onClick={() => document.getElementById('library')?.scrollIntoView({ behavior: 'smooth' })}
            className="group relative px-10 py-5 bg-[#00D2FF] text-black font-black rounded-2xl uppercase text-sm tracking-[0.2em] flex items-center gap-4 shadow-[0_0_30px_rgba(0,210,255,0.4)] hover:shadow-[0_0_60px_rgba(0,210,255,0.7)] transition-all duration-500 hover:scale-110 overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-[-20deg]" />
            <Play size={20} fill="currentColor" />
            Explore Library
            <ChevronRight size={20} className="group-hover:translate-x-2 transition-transform duration-300" />
          </button>
          
          <button className="px-10 py-5 bg-white/5 hover:bg-white/10 text-white font-black rounded-2xl uppercase text-sm tracking-[0.2em] border border-white/10 backdrop-blur-md transition-all duration-500 hover:border-[#00D2FF]/50">
            Learn More
          </button>
        </motion.div>


        {/* Stats / Features */}
        <motion.div 
          className="mt-20 grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="p-3 bg-[#00D2FF]/10 rounded-xl border border-[#00D2FF]/20 text-[#00D2FF]">
              <Gamepad2 size={24} />
            </div>
            <span className="text-2xl font-black text-white">{totalGames}</span>
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Total Games</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20 text-purple-400">
              <Layers size={24} />
            </div>
            <span className="text-2xl font-black text-white">10</span>
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">App Pages</span>
          </div>
          <div className="hidden md:flex flex-col items-center gap-2">
            <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400">
              <BookOpen size={24} />
            </div>
            <span className="text-2xl font-black text-white">{installedCount}</span>
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Added Translations</span>
          </div>
        </motion.div>
      </div>


      {/* Scroll Indicator */}
      <motion.div 
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        animate={{ y: [0, 10, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Scroll to explore</span>
        <div className="w-px h-12 bg-gradient-to-b from-[#00D2FF] to-transparent" />
      </motion.div>
    </section>
  );
}
