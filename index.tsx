
import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

const INITIAL_MATCH_TIME_SECONDS = 5 * 60; // 5 minutes
const LOCAL_STORAGE_KEY = 'jiujitsuScoreboardState';

interface ScoreDetail {
  label: string;
  points: number; // Points per action for this category
}

const SCORE_TYPES: Record<string, ScoreDetail> = {
  montada: { label: "Montada / Pegada nas Costas", points: 4 },
  passagem: { label: "Passagem de Guarda", points: 3 },
  queda: { label: "Queda, Raspagem, Joelho na barriga", points: 2 },
};

type ScoreCategoryKey = keyof typeof SCORE_TYPES;

interface AthleteState {
  id: number;
  name: string;
  scores: Record<ScoreCategoryKey, number>; // Stores accumulated points for each category
  advantages: number;
  penalties: number;
  totalScore: number;
}

const createInitialAthleteState = (id: number, defaultName: string): AthleteState => ({
  id,
  name: defaultName,
  scores: {
    montada: 0,
    passagem: 0,
    queda: 0,
  },
  advantages: 0,
  penalties: 0,
  totalScore: 0,
});

// --- LocalStorage Logic ---
const loadStateFromLocalStorage = () => {
  try {
    const serializedState = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (serializedState === null) {
      return undefined;
    }
    return JSON.parse(serializedState);
  } catch (error) {
    console.error("Could not load state from localStorage", error);
    return undefined;
  }
};


// --- Audio Alert Logic ---
// Use a single AudioContext instance
let audioContext: AudioContext | null = null;

const playSound = (frequency = 440, duration = 100, type: OscillatorType = 'sine') => {
  // Ensure this runs only in the browser
  if (typeof window === 'undefined' || !window.AudioContext) return;
  
  try {
    // Lazily create AudioContext on first user interaction
    if (!audioContext) {
      audioContext = new window.AudioContext();
    }
    // In some browsers, the AudioContext might be suspended, resume it
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.01); // Ramp up to avoid clicks

    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = type;

    oscillator.start(audioContext.currentTime);
    // Schedule stop and ramp down
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + duration / 1000);
    oscillator.stop(audioContext.currentTime + duration / 1000);
  } catch (error) {
    console.error("Could not play sound:", error);
  }
};


const App: React.FC = () => {
  const savedState = loadStateFromLocalStorage();

  const [athlete1, setAthlete1] = useState<AthleteState>(savedState?.athlete1 || createInitialAthleteState(1, "Atleta 1"));
  const [athlete2, setAthlete2] = useState<AthleteState>(savedState?.athlete2 || createInitialAthleteState(2, "Atleta 2"));
  const [timerSeconds, setTimerSeconds] = useState<number>(savedState?.timerSeconds ?? INITIAL_MATCH_TIME_SECONDS);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  // Effect to save state to localStorage whenever it changes
  useEffect(() => {
    try {
      const stateToSave = {
        athlete1,
        athlete2,
        timerSeconds,
      };
      const serializedState = JSON.stringify(stateToSave);
      localStorage.setItem(LOCAL_STORAGE_KEY, serializedState);
    } catch (error) {
      console.error("Could not save state to localStorage", error);
    }
  }, [athlete1, athlete2, timerSeconds]);

  const calculateTotalScore = (scores: Record<ScoreCategoryKey, number>): number => {
    return Object.values(scores).reduce((sum, current) => sum + current, 0);
  };

  const updateAthlete = (
    setter: React.Dispatch<React.SetStateAction<AthleteState>>,
    updater: (prevState: AthleteState) => AthleteState
  ) => {
    setter(prev => {
      const updated = updater(prev);
      return { ...updated, totalScore: calculateTotalScore(updated.scores) };
    });
  };

  const handleNameChange = (athleteSetter: React.Dispatch<React.SetStateAction<AthleteState>>, newName: string) => {
    updateAthlete(athleteSetter, prev => ({ ...prev, name: newName }));
  };

  const handleScoreChange = (
    athleteSetter: React.Dispatch<React.SetStateAction<AthleteState>>,
    category: ScoreCategoryKey,
    points: number // This is the fixed point value for the category (+4, -4, etc.)
  ) => {
    updateAthlete(athleteSetter, prev => {
      const currentCategoryScore = prev.scores[category];
      const newCategoryScore = Math.max(0, currentCategoryScore + points);
      return {
        ...prev,
        scores: {
          ...prev.scores,
          [category]: newCategoryScore,
        },
      };
    });
  };

  const handleAdvantagePenaltyChange = (
    athleteSetter: React.Dispatch<React.SetStateAction<AthleteState>>,
    type: 'advantages' | 'penalties',
    change: number
  ) => {
    updateAthlete(athleteSetter, prev => ({
      ...prev,
      [type]: Math.max(0, prev[type] + change),
    }));
  };

  const resetAthlete = (setter: React.Dispatch<React.SetStateAction<AthleteState>>, id: number, defaultName: string) => {
    setter(createInitialAthleteState(id, defaultName));
  };

  const handleResetScoreboard = useCallback(() => {
    resetAthlete(setAthlete1, 1, "Atleta 1");
    resetAthlete(setAthlete2, 2, "Atleta 2");
    setTimerSeconds(INITIAL_MATCH_TIME_SECONDS);
    setIsTimerRunning(false);
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (error) {
      console.error("Could not remove state from localStorage", error);
    }
  }, []);

  useEffect(() => {
    let interval: number | null = null;
    if (isTimerRunning && timerSeconds > 0) {
      interval = window.setInterval(() => {
        setTimerSeconds(prev => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      playSound(659, 400, 'square'); // Play end sound
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timerSeconds]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const toggleTimer = () => {
    if (timerSeconds === 0 && !isTimerRunning) { // If timer ended and trying to start again, reset it first.
        setTimerSeconds(INITIAL_MATCH_TIME_SECONDS);
    }
    // Play start sound only when transitioning from not running to running
    if (!isTimerRunning && timerSeconds > 0) {
        playSound(880, 150, 'triangle');
    }
    setIsTimerRunning(prev => !prev);
  };

  const handleIncreaseMinutes = () => {
    if (!isTimerRunning) {
      setTimerSeconds(prev => prev + 60);
    }
  };

  const handleDecreaseMinutes = () => {
    if (!isTimerRunning) {
      setTimerSeconds(prev => Math.max(0, prev - 60));
    }
  };

  const AthleteScoreboardComponent: React.FC<{
    athlete: AthleteState;
    setAthlete: React.Dispatch<React.SetStateAction<AthleteState>>;
    theme: 'blue' | 'white';
  }> = ({ athlete, setAthlete, theme }) => {
    return (
      <div className={`athlete-scoreboard theme-${theme}`}>
        <input
          type="text"
          className="athlete-name-input"
          value={athlete.name}
          onChange={(e) => handleNameChange(setAthlete, e.target.value)}
          aria-label={`Nome do ${athlete.name}`}
        />

        <div className="total-score-display" role="region" aria-labelledby={`total-score-label-${athlete.id}`}>
          <div id={`total-score-label-${athlete.id}`} className="label">Pontuação Total</div>
          <div className="score-value" aria-live="polite">{String(athlete.totalScore).padStart(2, '0')}</div>
        </div>
        
        <div className="detailed-scores">
            <div className="main-scores">
            {Object.entries(SCORE_TYPES).map(([key, detail]) => (
              <div key={key} className="score-category" role="group" aria-labelledby={`score-label-${athlete.id}-${key}`}>
                <div id={`score-label-${athlete.id}-${key}`} className="label">{detail.label}</div>
                <div className="score-display" aria-live="polite">{athlete.scores[key as ScoreCategoryKey]}</div>
                <div className="buttons">
                  <button onClick={() => handleScoreChange(setAthlete, key as ScoreCategoryKey, detail.points)} aria-label={`Adicionar ${detail.points} pontos em ${detail.label} para ${athlete.name}`}>
                    +{detail.points}
                  </button>
                  <button onClick={() => handleScoreChange(setAthlete, key as ScoreCategoryKey, -detail.points)} aria-label={`Remover ${detail.points} pontos em ${detail.label} para ${athlete.name}`}>
                    -{detail.points}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="advantage-penalty-container">
                <div className="advantage-penalty-display advantage-display" role="group" aria-labelledby={`adv-label-${athlete.id}`}>
                    <span id={`adv-label-${athlete.id}`} className="label">Vantagem</span>
                    <span className="score-value" aria-live="polite">{athlete.advantages}</span>
                    <div className="buttons">
                    <button onClick={() => handleAdvantagePenaltyChange(setAthlete, 'advantages', 1)} aria-label={`Adicionar vantagem para ${athlete.name}`}>+</button>
                    <button onClick={() => handleAdvantagePenaltyChange(setAthlete, 'advantages', -1)} aria-label={`Remover vantagem de ${athlete.name}`}>-</button>
                    </div>
                </div>
                <div className="advantage-penalty-display penalty-display" role="group" aria-labelledby={`pen-label-${athlete.id}`}>
                    <span id={`pen-label-${athlete.id}`} className="label">Punições</span>
                    <span className="score-value" aria-live="polite">{athlete.penalties}</span>
                    <div className="buttons">
                    <button onClick={() => handleAdvantagePenaltyChange(setAthlete, 'penalties', 1)} aria-label={`Adicionar punição para ${athlete.name}`}>+</button>
                    <button onClick={() => handleAdvantagePenaltyChange(setAthlete, 'penalties', -1)} aria-label={`Remover punição de ${athlete.name}`}>-</button>
                    </div>
                </div>
            </div>
        </div>

      </div>
    );
  };

  return (
    <div className="main-layout">
        <AthleteScoreboardComponent athlete={athlete1} setAthlete={setAthlete1} theme="blue" />
        
        <div className="controls-panel">
            <div className="timer-display-container" role="timer" aria-live="off">
                <div className="label">Tempo</div>
                <div className="timer-digits" aria-label={`Tempo restante: ${formatTime(timerSeconds)}`}>{formatTime(timerSeconds)}</div>
                 <div className="minute-controls">
                    <button 
                        onClick={handleDecreaseMinutes} 
                        disabled={isTimerRunning}
                        aria-label="Diminuir minutos do cronômetro"
                    >
                        -
                    </button>
                    <button 
                        onClick={handleIncreaseMinutes} 
                        disabled={isTimerRunning}
                        aria-label="Aumentar minutos do cronômetro"
                    >
                        +
                    </button>
                </div>
            </div>
            <div className="timer-buttons">
                <button
                    onClick={toggleTimer}
                    className={`start-stop-button ${isTimerRunning ? 'running' : ''}`}
                    aria-label={isTimerRunning ? "Parar cronômetro" : "Iniciar cronômetro"}
                >
                    {isTimerRunning ? 'Parar' : 'Iniciar'}
                </button>
                <button onClick={handleResetScoreboard} className="reset-button" aria-label="Reiniciar placar e cronômetro">
                    Reiniciar Placar
                </button>
            </div>
        </div>

        <AthleteScoreboardComponent athlete={athlete2} setAthlete={setAthlete2} theme="white" />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<React.StrictMode><App /></React.StrictMode>);
}
