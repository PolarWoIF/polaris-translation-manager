import { motion } from "motion/react";
import Logo from "./Logo";
import { Search, Bell, User, Menu } from "lucide-react";

export default function Navbar() {
  return (
    <motion.nav 
      className="sticky top-0 z-50 w-full bg-[#0B0C10]/80 backdrop-blur-2xl border-b border-white/5 px-6 py-5"
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between relative h-14">
        {/* Left Links */}
        <div className="flex items-center gap-10">
          <motion.div 
            className="hidden lg:flex items-center gap-10"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            {["Library", "Community"].map((item) => (
              <motion.a 
                key={item} 
                href="#" 
                className="relative text-[10px] font-black text-white/40 hover:text-white uppercase tracking-[0.3em] transition-colors group"
                whileHover={{ scale: 1.05 }}
              >
                {item}
                <span className="absolute -bottom-2 left-0 w-0 h-[2px] bg-[#00D2FF] transition-all duration-300 group-hover:w-full" />
              </motion.a>
            ))}
          </motion.div>
          
          {/* Mobile Menu Toggle */}
          <button className="lg:hidden p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 text-white transition-colors">
            <Menu size={18} />
          </button>
        </div>

        {/* Centered Logo and Text */}
        <motion.div 
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4 group cursor-pointer"
          whileHover={{ scale: 1.05 }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <Logo className="w-14 h-14 drop-shadow-[0_0_15px_rgba(0,210,255,0.3)]" />
          <div className="hidden sm:flex flex-col items-start">
            <span className="text-2xl font-black text-white tracking-tighter leading-none uppercase group-hover:text-[#00D2FF] transition-colors">POLAR</span>
            <span className="text-[10px] font-bold text-[#00D2FF] tracking-[0.4em] leading-none uppercase mt-1">Translation</span>
          </div>
        </motion.div>

        {/* Right Section */}
        <div className="flex items-center gap-8">
          {/* Search Bar (Adaptive) */}
          <motion.div 
            className="hidden md:flex items-center relative"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            transition={{ delay: 0.7 }}
          >
            <Search className="absolute left-4 text-white/20" size={16} />
            <input 
              type="text" 
              placeholder="Quick Search..." 
              className="pl-12 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-white placeholder:text-white/20 focus:border-[#00D2FF]/50 outline-none transition-all w-48 focus:w-64"
            />
          </motion.div>

          <div className="hidden lg:flex items-center gap-10">
            {["Updates", "Support"].map((item) => (
              <motion.a 
                key={item} 
                href="#" 
                className="relative text-[10px] font-black text-white/40 hover:text-white uppercase tracking-[0.3em] transition-colors group"
                whileHover={{ scale: 1.05 }}
              >
                {item}
                <span className="absolute -bottom-2 right-0 w-0 h-[2px] bg-[#00D2FF] transition-all duration-300 group-hover:w-full" />
              </motion.a>
            ))}
          </div>
          
          <div className="flex items-center gap-4">
            <motion.button 
              className="p-3 bg-white/5 hover:bg-[#00D2FF] hover:text-black rounded-2xl border border-white/10 hover:border-[#00D2FF] text-white transition-all duration-500 shadow-xl"
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.9 }}
            >
              <User size={18} />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
