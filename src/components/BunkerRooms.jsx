import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { 
  Box, Leaf, Droplets, Fan, Zap, Warehouse, Battery, Crosshair
} from 'lucide-react';

export const BunkerStyles = () => (
  <style>{`
    .anim-conveyor { animation: slideParcel 4s linear infinite; }
    .anim-float { animation: float 3s ease-in-out infinite alternate; }
    .anim-rain { animation: rainDrop 1.2s linear infinite; }
    
    @keyframes slideParcel { 0% { transform: translateX(200px); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateX(-200px); opacity: 0; } }
    @keyframes float { from { transform: translateY(-5px); } to { transform: translateY(5px); } }
    @keyframes rainDrop { 0% { transform: translateY(-40px); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(120px); opacity: 0; } }
  `}</style>
);

const BatteryFull = ({size}) => <Battery size={size} className="text-green-500" />;
const BatteryMedium = ({size}) => <Battery size={size} className="text-amber-500" />;
const BatteryLow = ({size}) => <Battery size={size} className="text-red-500" />;

BatteryFull.propTypes = { size: PropTypes.number.isRequired };
BatteryMedium.propTypes = { size: PropTypes.number.isRequired };
BatteryLow.propTypes = { size: PropTypes.number.isRequired };

export function RoboticAssembly({ onGameOver }) {
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [dots, setDots] = useState([]);
  const [mines, setMines] = useState([]);
  const [status, setStatus] = useState('playing'); // playing, won, lost
  const [direction, setDirection] = useState(0);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [mouthOpen, setMouthOpen] = useState(false);
  
  useEffect(() => {
    const t = setInterval(() => setMouthOpen(p => !p), 200);
    return () => clearInterval(t);
  }, []);

  const initLevel = useCallback((lvl) => {
    const newMines = [];
    const numMines = 3 + lvl * 2;
    for(let i=0; i<numMines; i++) newMines.push({ id: i, x: 10+Math.random()*80, y: 10+Math.random()*80 });

    const newDots = [];
    const numDots = 10 + lvl * 5;
    for(let i=0; i<numDots; i++) {
      let x, y, tooClose;
      do {
        x = 5+Math.random()*90;
        y = 5+Math.random()*90;
        tooClose = newMines.some(m => Math.abs(m.x - x) < 10 && Math.abs(m.y - y) < 10);
      } while(tooClose);
      newDots.push({ id: i, x, y });
    }
    
    setMines(newMines);
    setDots(newDots);
    setStatus('playing');
  }, []);

  useEffect(() => { initLevel(level); }, [level, initLevel]);

  const handleMove = (e) => {
    if (status !== 'playing') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    const dx = x - pos.x;
    
    setPos({ x, y });
    if (dx !== 0) setDirection(dx < 0 ? -1 : 1);
    
    const hitMine = mines.find(m => Math.abs(m.x - x) < 5 && Math.abs(m.y - y) < 5);
    if (hitMine) {
      setStatus('lost');
      if (onGameOver) onGameOver(score);
      return;
    }

    const remainingDots = dots.filter(d => {
      const hit = Math.abs(d.x - x) < 5 && Math.abs(d.y - y) < 5;
      if (hit) setScore(s => s + 10);
      return !hit;
    });
    setDots(remainingDots);
    if (remainingDots.length === 0) setStatus('won');
  };

  return (
    <div className="relative w-full h-full bg-beige-50 rounded-3xl border border-beige-200 overflow-hidden cursor-none" onMouseMove={handleMove}>
      <div className="absolute top-4 w-full px-6 flex justify-between items-center z-10">
        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Lvl {level}</span>
        <span className="text-xs font-black text-terracotta-600 bg-terracotta-100 px-3 py-1 rounded-lg">Score: {score}</span>
      </div>

      {dots.map(d => (
        <div key={d.id} className="absolute w-2 h-2 bg-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.8)]" style={{ left: `${d.x}%`, top: `${d.y}%`, transform: 'translate(-50%, -50%)' }}></div>
      ))}
      
      {mines.map(m => (
        <div key={m.id} className="absolute w-4 h-4 bg-neutral-900 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.6)] border-2 border-neutral-700 flex items-center justify-center" style={{ left: `${m.x}%`, top: `${m.y}%`, transform: 'translate(-50%, -50%)' }}>
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></div>
        </div>
      ))}
      
      {status === 'playing' && (
        <div className="absolute w-12 h-12" style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: `translate(-50%, -50%) scaleX(${direction || 1})`, filter: 'drop-shadow(0 5px 8px rgba(0,0,0,0.2))' }}>
          {/* Enhanced Pacman SVG */}
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {mouthOpen ? (
              <path d="M50,50 L100,25 A50,50 0 1,0 100,75 Z" fill="#f59e0b" />
            ) : (
              <path d="M50,50 L100,45 A50,50 0 1,0 100,55 Z" fill="#f59e0b" />
            )}
            <circle cx="50" cy="25" r="5" fill="#171717" />
          </svg>
        </div>
      )}

      {status !== 'playing' && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-20">
          <div className={`text-2xl font-black mb-2 ${status === 'won' ? 'text-green-500' : 'text-red-500'}`}>
            {status === 'won' ? 'SECTEUR NETTOYÉ !' : 'SYSTÈME DÉTRUIT'}
          </div>
          <div className="text-sm font-bold text-neutral-800 mb-6">Score Final: {score}</div>
          <button onClick={() => {
            if (status === 'won') setLevel(l => l + 1);
            else { setLevel(1); setScore(0); initLevel(1); }
          }} className="px-8 py-3 bg-neutral-900 text-white rounded-xl font-bold hover:bg-terracotta-600 transition-colors shadow-lg">
            {status === 'won' ? 'Niveau Suivant' : 'Recommencer'}
          </button>
        </div>
      )}
    </div>
  );
}

export function LogisticsBay() {
  const [speed, setSpeed] = useState(1);
  return (
    <div className="w-full h-full flex flex-col justify-end pb-8 overflow-hidden relative cursor-pointer group" onClick={() => setSpeed(prev => prev >= 4 ? 1 : prev + 1)}>
      <div className="absolute top-4 left-6 bg-beige-100 px-3 py-1 rounded-full text-[8px] font-black text-neutral-400 tracking-widest uppercase">Flux: x{speed}</div>
      <div className="absolute bottom-10 left-[15%] w-[70%] h-4 bg-beige-200 border-y border-beige-300 shadow-inner z-0"></div>
      <div className="flex gap-12 w-full absolute bottom-12 z-10 px-10">
        <div className="flex gap-12 w-max anim-conveyor" style={{ animationDuration: `${4 / speed}s` }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} className="p-3 bg-white border border-beige-200 rounded-xl shadow-md"><Box size={24} className="text-terracotta-600" /></div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-6 left-0 w-20 h-20 bg-white border border-beige-200 rounded-r-3xl flex items-center justify-center z-20"><Warehouse size={32} className="text-terracotta-300" /></div>
      <div className="absolute bottom-6 right-0 w-24 h-24 bg-white border border-beige-200 rounded-l-3xl shadow-xl flex items-center justify-center z-20"><Warehouse size={48} className="text-terracotta-700" /></div>
    </div>
  );
}

const TETROMINOS = {
  I: { shape: [[1, 1, 1, 1]], color: 'bg-cyan-400' },
  J: { shape: [[1, 0, 0], [1, 1, 1]], color: 'bg-blue-500' },
  L: { shape: [[0, 0, 1], [1, 1, 1]], color: 'bg-orange-500' },
  O: { shape: [[1, 1], [1, 1]], color: 'bg-yellow-400' },
  S: { shape: [[0, 1, 1], [1, 1, 0]], color: 'bg-green-500' },
  T: { shape: [[0, 1, 0], [1, 1, 1]], color: 'bg-purple-500' },
  Z: { shape: [[1, 1, 0], [0, 1, 1]], color: 'bg-red-500' },
};

const createEmptyBoard = () => Array.from({ length: 15 }, () => Array(10).fill(null));

export function ResearchLab({ onGameOver }) {
  const [board, setBoard] = useState(createEmptyBoard());
  const [piece, setPiece] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);

  const level = Math.floor(score / 500) + 1;
  const fallSpeed = Math.max(100, 450 - (level * 50));

  const spawnPiece = () => {
    const keys = Object.keys(TETROMINOS);
    const type = keys[Math.floor(Math.random() * keys.length)];
    return { pos: { x: 3, y: 0 }, tetromino: TETROMINOS[type] };
  };

  useEffect(() => {
    if (!piece && !gameOver) {
      setPiece(spawnPiece());
    }
  }, [piece, gameOver]);

  const checkCollision = (p, b, moveX, moveY) => {
    for (let y = 0; y < p.tetromino.shape.length; y++) {
      for (let x = 0; x < p.tetromino.shape[y].length; x++) {
        if (p.tetromino.shape[y][x] !== 0) {
          const newY = y + p.pos.y + moveY;
          const newX = x + p.pos.x + moveX;
          if (newY >= 15 || newX < 0 || newX >= 10 || (b[newY] && b[newY][newX] !== null)) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const rotatePiece = (p) => {
    const rotatedShape = p.tetromino.shape[0].map((_, index) => p.tetromino.shape.map(row => row[index]).reverse());
    return { ...p, tetromino: { ...p.tetromino, shape: rotatedShape } };
  };

  useEffect(() => {
    if (!piece || gameOver) return;
    const drop = setInterval(() => {
      if (!checkCollision(piece, board, 0, 1)) {
        setPiece(p => ({ ...p, pos: { x: p.pos.x, y: p.pos.y + 1 } }));
      } else {
        if (piece.pos.y === 0) {
          setGameOver(true);
          if (onGameOver) onGameOver(score);
          return;
        }
        const newBoard = board.map(row => [...row]);
        piece.tetromino.shape.forEach((row, y) => {
          row.forEach((val, x) => {
            if (val !== 0) newBoard[y + piece.pos.y][x + piece.pos.x] = piece.tetromino.color;
          });
        });
        
        const filteredBoard = newBoard.filter(row => row.some(cell => cell === null));
        const linesCleared = 15 - filteredBoard.length;
        const finalBoard = [...Array.from({ length: linesCleared }, () => Array(10).fill(null)), ...filteredBoard];
        
        setBoard(finalBoard);
        if (linesCleared > 0) setScore(s => s + linesCleared * 100 + (linesCleared > 1 ? 50 : 0));
        setPiece(null);
      }
    }, fallSpeed);
    return () => clearInterval(drop);
  }, [piece, board, gameOver, fallSpeed, onGameOver, score]);

  const moveLeft = (e) => {
    e.stopPropagation();
    if (!piece || gameOver) return;
    if (!checkCollision(piece, board, -1, 0)) setPiece(p => ({ ...p, pos: { x: p.pos.x - 1, y: p.pos.y } }));
  };

  const moveRight = (e) => {
    e.stopPropagation();
    if (!piece || gameOver) return;
    if (!checkCollision(piece, board, 1, 0)) setPiece(p => ({ ...p, pos: { x: p.pos.x + 1, y: p.pos.y } }));
  };

  const rotate = (e) => {
    e.stopPropagation();
    if (!piece || gameOver) return;
    const rotated = rotatePiece(piece);
    if (!checkCollision(rotated, board, 0, 0)) setPiece(rotated);
  };

  const dropDown = (e) => {
    e.stopPropagation();
    if (!piece || gameOver) return;
    if (!checkCollision(piece, board, 0, 1)) setPiece(p => ({ ...p, pos: { x: p.pos.x, y: p.pos.y + 1 } }));
  };

  const resetGame = (e) => {
    e.stopPropagation();
    setBoard(createEmptyBoard());
    setScore(0);
    setGameOver(false);
    setPiece(null);
  };

  // Render helpers
  const displayBoard = board.map(row => [...row]);
  if (piece) {
    piece.tetromino.shape.forEach((row, y) => {
      row.forEach((val, x) => {
        if (val !== 0 && displayBoard[y + piece.pos.y]) {
          displayBoard[y + piece.pos.y][x + piece.pos.x] = piece.tetromino.color;
        }
      });
    });
  }

  return (
    <div className="relative w-full h-full bg-beige-50 rounded-3xl border border-beige-200 overflow-hidden flex flex-col items-center justify-center pb-2">
      <div className="absolute top-3 w-full px-4 flex justify-between items-center z-10">
        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Lvl {level}</span>
        <span className="text-xs font-black text-terracotta-600 bg-terracotta-100 px-3 py-1 rounded-lg">Score: {score}</span>
      </div>
      
      <div className="grid gap-[1px] w-48 h-72 bg-white p-1 rounded-lg border border-beige-200 mt-8 mb-4 shadow-inner" style={{ gridTemplateRows: 'repeat(15, minmax(0, 1fr))' }}>
        {displayBoard.map((row, y) => (
          <div key={y} className="grid grid-cols-10 gap-[1px] h-full">
            {row.map((cell, x) => (
              <div key={x} className={`w-full h-full rounded-[2px] ${cell ? cell + ' shadow-sm' : 'bg-beige-50'}`}></div>
            ))}
          </div>
        ))}
      </div>

      {/* Control Buttons */}
      <div className="flex gap-2 mb-2">
        <button onClick={moveLeft} className="w-12 h-10 bg-white border-2 border-beige-200 rounded-xl flex items-center justify-center hover:bg-beige-100 hover:border-terracotta-300 active:scale-90 transition-all shadow-sm">
          <span className="text-xl">⬅️</span>
        </button>
        <button onClick={dropDown} className="w-12 h-10 bg-white border-2 border-beige-200 rounded-xl flex items-center justify-center hover:bg-beige-100 hover:border-terracotta-300 active:scale-90 transition-all shadow-sm">
          <span className="text-xl">⬇️</span>
        </button>
        <button onClick={rotate} className="w-12 h-10 bg-white border-2 border-beige-200 rounded-xl flex items-center justify-center hover:bg-beige-100 hover:border-terracotta-300 active:scale-90 transition-all shadow-sm">
          <span className="text-xl">🔄</span>
        </button>
        <button onClick={moveRight} className="w-12 h-10 bg-white border-2 border-beige-200 rounded-xl flex items-center justify-center hover:bg-beige-100 hover:border-terracotta-300 active:scale-90 transition-all shadow-sm">
          <span className="text-xl">➡️</span>
        </button>
      </div>

      {gameOver && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-20">
          <div className="text-2xl font-black text-terracotta-600 mb-2">SATURATION !</div>
          <div className="text-lg font-bold text-neutral-800 mb-6">Score: {score}</div>
          <button onClick={resetGame} className="px-8 py-3 bg-neutral-900 text-white rounded-xl font-bold hover:bg-terracotta-600 transition-colors shadow-lg">Recharger</button>
        </div>
      )}
    </div>
  );
}

export function HydroponicsBay() {
  const [plantLevel, setPlantLevel] = useState(0);
  const [isWatering, setIsWatering] = useState(false);
  return (
    <div className="flex gap-10 items-end justify-center h-full pt-10 relative cursor-pointer" onClick={() => { setIsWatering(true); setTimeout(() => { setIsWatering(false); setPlantLevel(prev => (prev + 1) % 4); }, 1000); }}>
      {isWatering && (
        <div className="absolute top-0 inset-x-0 flex justify-center gap-12 z-20 pointer-events-none">
          {[1,2,3,4,5].map(i => <Droplets key={i} size={18} className="text-blue-500 anim-rain" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
      )}
      {[1, 2, 3].map(i => (
        <div key={i} className="relative flex flex-col items-center">
          <div className="h-24 flex items-end justify-center mb-1">
            {plantLevel > 0 && <Leaf size={16 + plantLevel * 12} className={`transition-all duration-700 ${plantLevel === 3 ? 'text-terracotta-600 drop-shadow-lg' : 'text-terracotta-300'} anim-float`} style={{ transform: `scale(${plantLevel / 3}) translateY(${ (3 - plantLevel) * 10 }px)`, opacity: plantLevel / 3 }} />}
          </div>
          <div className="w-14 h-10 bg-white border border-beige-200 rounded-t-2xl shadow-inner relative z-10"></div>
        </div>
      ))}
    </div>
  );
}

export function PowerStation({ onGameOver }) {
  const [speed, setSpeed] = useState(1);
  const [charge, setCharge] = useState(0);
  const [energy, setEnergy] = useState(0);

  const chargeRef = useRef(charge);
  const speedRef = useRef(speed);
  useEffect(() => {
    chargeRef.current = charge;
    speedRef.current = speed;
  }, [charge, speed]);

  useEffect(() => {
    const t = setInterval(() => { 
      setSpeed(p => Math.max(p - 0.1, 1)); 
      setCharge(p => Math.max(p - 0.2, 0)); 
      setEnergy(p => p + (chargeRef.current > 0 ? (speedRef.current / 10) : 0));
    }, 200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-6 h-full w-full cursor-pointer group" onClick={() => { setSpeed(p => Math.min(p + 0.5, 8)); setCharge(p => Math.min(p + 5, 100)); }}>
      <div className="absolute top-4 right-6 flex flex-col items-end">
        <span className="text-[8px] font-black text-neutral-400 uppercase tracking-widest">Énergie Totale</span>
        <div className="flex items-center gap-1">
          <Zap size={10} className="text-amber-500" />
          <span className="text-xs font-black text-neutral-800 tabular-nums">{Math.floor(energy)} <span className="text-[10px] text-neutral-400">kWh</span></span>
        </div>
      </div>
      <div className="flex items-center gap-10">
        <div className="relative p-6 bg-white rounded-full border-4 border-beige-100 shadow-2xl transition-transform active:scale-90">
          <Fan size={80} className="text-terracotta-500" style={{ animation: `spin ${2 / speed}s linear infinite`, filter: `blur(${Math.max(0, speed - 2)}px)` }} />
        </div>
        <div className="flex flex-col items-center gap-2">
          {charge > 75 ? <BatteryFull size={32} /> : charge > 40 ? <BatteryMedium size={32} /> : <BatteryLow size={32} />}
          <div className="w-6 h-20 bg-beige-200 rounded-sm p-0.5 relative flex flex-col justify-end shadow-inner">
            <div className="bg-terracotta-500 w-full transition-all duration-300 rounded-sm" style={{ height: `${charge}%` }}></div>
          </div>
        </div>
      </div>
      <button 
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onGameOver) onGameOver(Math.floor(energy));
        }}
        className="px-6 py-2 bg-neutral-900 text-white hover:bg-terracotta-600 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-colors shadow-md z-20 active:scale-95 cursor-pointer"
      >
        Sauvegarder le record
      </button>
    </div>
  );
}

export function AutomatedStorage() {
  const [invaders, setInvaders] = useState([]);
  const [bullets, setBullets] = useState([]);
  const [pos, setPos] = useState(50);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [status, setStatus] = useState('playing'); // playing, won, lost

  const initInvaders = useCallback(() => {
    const newInvaders = [];
    const rows = Math.min(3 + Math.floor(level / 2), 6);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 5; c++) {
        let spawn = true;
        // Patterns basés sur le niveau
        if (level % 3 === 2) spawn = (r + c) % 2 === 0; // Damier
        else if (level % 3 === 0) spawn = c !== 2; // Espace au milieu
        
        if (spawn) newInvaders.push({ id: `${r}-${c}`, x: 15 + c * 18, y: 10 + r * 15, alive: true });
      }
    }
    if (newInvaders.length === 0) newInvaders.push({ id: `0-0`, x: 50, y: 10, alive: true });
    setInvaders(newInvaders);
    setStatus('playing');
  }, [level]);

  useEffect(() => {
    initInvaders();
  }, [initInvaders]);

  useEffect(() => {
    if (status !== 'playing') return;
    const baseSpeed = 0.15;
    const speedMultiplier = 1 + (level * 0.3); // Plus rapide à chaque vague
    
    const loop = setInterval(() => {
      setBullets(prevBullets => {
        const nextBullets = prevBullets.map(b => ({ ...b, y: b.y - 5 })).filter(b => b.y > -10);
        let bulletsToRemove = new Set();
        let invadersToKill = new Set();
        nextBullets.forEach(bullet => {
          const hitInvader = invaders.find(inv => inv.alive && !invadersToKill.has(inv.id) && Math.abs(inv.x - bullet.x) < 8 && Math.abs(inv.y - bullet.y) < 8);
          if (hitInvader) { 
            bulletsToRemove.add(bullet.id); 
            invadersToKill.add(hitInvader.id); 
          }
        });
        if (invadersToKill.size > 0) {
          setScore(s => s + (invadersToKill.size * 100));
          const updatedInvaders = invaders.map(inv => invadersToKill.has(inv.id) ? { ...inv, alive: false } : inv);
          if (updatedInvaders.every(inv => !inv.alive)) {
            setStatus('won');
          }
          setInvaders(updatedInvaders);
        }
        return nextBullets.filter(b => !bulletsToRemove.has(b.id));
      });
      
      setInvaders(prevInv => {
        const anyHitBottom = prevInv.some(inv => inv.alive && inv.y > 85);
        if (anyHitBottom) {
          setStatus('lost');
          return prevInv;
        }
        return prevInv.map(inv => ({ ...inv, y: inv.y + (baseSpeed * speedMultiplier) }));
      });
    }, 50);
    return () => clearInterval(loop);
  }, [invaders, level, status]);

  const shoot = (e) => {
    if (status !== 'playing') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setBullets(prev => [...prev, { id: Date.now(), x, y: 85 }]);
  };

  const handleRestart = (e) => {
    e.stopPropagation();
    setLevel(1);
    setScore(0);
    initInvaders();
  };

  const handleNextLevel = (e) => {
    e.stopPropagation();
    setLevel(l => l + 1);
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center cursor-crosshair overflow-hidden bg-beige-50 rounded-3xl border border-beige-200 shadow-inner"
      onClick={shoot}
      onMouseMove={(e) => {
        if (status !== 'playing') return;
        const rect = e.currentTarget.getBoundingClientRect();
        setPos(((e.clientX - rect.left) / rect.width) * 100);
      }}
    >
      <div className="absolute top-4 w-full px-6 flex justify-between items-center z-10">
        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Lvl {level}</span>
        <span className="text-xs font-black text-terracotta-600 bg-terracotta-100 px-3 py-1 rounded-lg">Score: {score}</span>
      </div>
      {invaders.map(inv => inv.alive && (
        <div key={inv.id} className="absolute w-8 h-8 bg-white border border-beige-300 rounded-lg flex items-center justify-center shadow-sm"
          style={{ left: `${inv.x}%`, top: `${inv.y}%`, transform: 'translate(-50%, -50%)' }}>
          <Box size={14} className="text-terracotta-600" />
        </div>
      ))}
      {bullets.map(b => (
        <div key={b.id} className="absolute w-1.5 h-4 bg-terracotta-500 rounded-full shadow-[0_0_8px_rgba(226,125,96,0.6)]" style={{ left: `${b.x}%`, top: `${b.y}%`, transform: 'translateX(-50%)' }}></div>
      ))}
      <div className="absolute bottom-4 flex flex-col items-center" style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}>
        <Crosshair size={32} className="text-neutral-800 animate-pulse" />
        <div className="w-12 h-4 bg-terracotta-200 rounded-t-xl border border-terracotta-300"></div>
      </div>
      {status !== 'playing' && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-30">
          <div className={`text-xl font-black mb-2 ${status === 'won' ? 'text-green-500' : 'text-red-500'}`}>
            {status === 'won' ? `VAGUE ${level} SURVÉCUE !` : 'SYSTÈME BRECHÉ !'}
          </div>
          <div className="text-sm font-bold text-neutral-800 mb-6">Score: {score}</div>
          <button 
            onClick={status === 'won' ? handleNextLevel : handleRestart} 
            className="px-8 py-3 bg-neutral-900 text-white rounded-xl font-bold shadow-lg hover:bg-terracotta-600 transition-colors"
          >
            {status === 'won' ? 'Vague Suivante' : 'Recommencer'}
          </button>
        </div>
      )}
    </div>
  );
}

RoboticAssembly.propTypes = {
  onGameOver: PropTypes.func,
};

ResearchLab.propTypes = {
  onGameOver: PropTypes.func,
};

PowerStation.propTypes = {
  onGameOver: PropTypes.func,
};
