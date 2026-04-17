import { useState } from "react";
import { motion } from "motion/react";

export default function Logo({ className = "w-12 h-12" }: { className?: string }) {
  const [error, setError] = useState(false);

  return (
    <motion.div 
      className={`relative flex items-center justify-center ${className}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {!error ? (
        <motion.img 
          src="assets/red-set/windows/icon-256x256.png" 
          alt="PW" 
          className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(0,210,255,0.9)]"
          referrerPolicy="no-referrer"
          onError={() => setError(true)}
          animate={{ 
            filter: ["drop-shadow(0 0 10px rgba(0,210,255,0.5))", "drop-shadow(0 0 25px rgba(0,210,255,0.9))", "drop-shadow(0 0 10px rgba(0,210,255,0.5))"]
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-[0_0_15px_rgba(0,210,255,0.8)]">
          <circle cx="50" cy="50" r="48" fill="url(#grad)" stroke="#00D2FF" strokeWidth="2" />
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00D2FF" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0080FF" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="#00D2FF" fontSize="32" fontWeight="900" fontFamily="sans-serif" style={{ fontStyle: 'italic' }}>PW</text>
        </svg>
      )}
      {/* Dynamic Glow Ring */}
      <motion.div 
        className="absolute -inset-2 rounded-full border-2 border-[#00D2FF]/40"
        animate={{ 
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.6, 0.3],
          rotate: [0, 180, 360]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
    </motion.div>
  );
}
