export type View =
  | "dashboard" | "exam" | "pdf" | "flashcards"
  | "search" | "bookmarks" | "history"
  | "calculator" | "simulator" | "settings"
  | "analytics" | "notes" | "aigen";

export interface Question {
  id: number;
  source_document: string;
  clause: string | null;
  topic: string;
  difficulty: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: "A" | "B" | "C" | "D";
  explanation: string;
  ai_explanation: string | null;
  tags: string | null;
}

export interface Flashcard {
  id: number;
  topic: string;
  front: string;
  back: string;
  ease_factor: number;
  interval: number;
  repetitions: number;
  next_review: string;
  created_at: string;
}

export interface Bookmark {
  id: number;
  pdf_name: string;
  pdf_path: string;
  page: number;
  note: string | null;
  highlight_text: string | null;
  color: string | null;
  created_at: string;
}

export interface ExamAnswer {
  question_id: number;
  selected_answer: string;
  is_correct: boolean;
  time_taken_seconds: number;
}

export interface TopicStat {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
}

export interface UserStats {
  total_questions_answered: number;
  total_correct: number;
  total_exams: number;
  avg_score: number;
  weak_topics: TopicStat[];
  strong_topics: TopicStat[];
  streak_days: number;
}

export interface ExamSession {
  id: number;
  mode: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  durationSeconds: number;
  weakTopics: string | null;
  createdAt: string;
}

export interface PDF {
  id: number;
  name: string;
  path: string;
  lastPage: number;
  addedAt: string;
}

export interface QuestionFilter {
  topic?: string;
  difficulty?: number;
  source_document?: string;
  limit?: number;
  shuffle?: boolean;
  weak_topics?: string[];
}

export interface UserNote {
  id: number;
  topic: string | null;
  pdf_name: string | null;
  page: number | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  aiEndpoint: string;
  aiModel: string;
  aiEnabled: boolean;
  examTimerSeconds: number;
  darkMode: boolean;
  cleanupModel: string;
  translateModel: string;
}

export type ExamMode = "timed" | "open-book" | "practice" | "adaptive";
export type DifficultyLabel = "All" | "Easy" | "Medium" | "Hard" | "Expert";

// ── Calculation Trainer ──────────────────────────────────────────────────────

export type CalcId =
  | "corrosion_rate"
  | "remaining_life"
  | "next_inspection"
  | "mawp"
  | "hydrotest"
  | "wall_thickness";

export interface CalcField {
  key: string;
  label: string;
  unit: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface CalcDefinition {
  id: CalcId;
  title: string;
  formula: string;
  reference: string;
  fields: CalcField[];
  compute: (vals: Record<string, number>) => CalcResult;
  randomize: () => Record<string, number>;
}

export interface CalcResult {
  value: number;
  unit: string;
  steps: string[];
  pass?: boolean;
  passLabel?: string;
}

// ── Practical Simulator ──────────────────────────────────────────────────────

export interface SimScenario {
  id: string;
  title: string;
  description: string;
  findings: string[];
  context: string;
  choices: SimChoice[];
  difficulty: number;
  tags: string[];
}

export interface SimChoice {
  id: string;
  label: string;
  detail?: string;
  outcome: string;
  correct: boolean;
  points: number;
  codeRef?: string;
}
