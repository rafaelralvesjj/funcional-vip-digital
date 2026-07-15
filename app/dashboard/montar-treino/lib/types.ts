export interface Student {
  id: string;
  name: string;
  email?: string;
  image?: string;
  birthDate?: string | null;
  ageYears?: number | null;
  isMinor?: boolean;
  hasBirthDate?: boolean;
}

export interface LibraryExercise {
  id: string;
  name: string;
  description?: string | null;
  muscleGroup?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  sequenceImageUrl?: string | null;
  sequenceImageLabel?: string | null;
  sequenceImageNotes?: string | null;
  sequenceFramesCount?: number | null;
  sequenceGeneratedByAi?: boolean | null;
  objectiveTags?: string | null;
  restrictionTags?: string | null;
  instructions?: string | null;
  safetyNotes?: string | null;
  commonMistakes?: string | null;
  contraindications?: string | null;
}

export interface WorkoutPlanSummary {
  id: string;
  date?: string | null;
  createdAt?: string | null;
}

export interface ActiveWorkoutContract {
  id: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  workoutsPerWeek: number;
  workoutsPerMonth?: number;
  totalContractedWorkouts?: number;
  planName?: string | null;
}

export interface WorkoutWeekSummary {
  plans?: WorkoutPlanSummary[];
  activeContract?: ActiveWorkoutContract | null;
  weeklyLimit?: number | null;
  weeklyPlansCount?: number;
  weeklyRemaining?: number | null;
  message?: string | null;
}

export interface ExerciseItem {
  libraryExerciseId: string;
  name: string;
  description: string;
  series: number;
  reps: string;
  weight: string;
  restTime: string;
  notes: string;
  order: number;
  imageUrl?: string | null;
  videoUrl?: string | null;
  sequenceImageUrl?: string | null;
  sequenceImageLabel?: string | null;
  sequenceImageNotes?: string | null;
  sequenceFramesCount?: number | null;
  sequenceGeneratedByAi?: boolean | null;
  purpose?: string | null;
  instructions?: string | null;
  safetyGuidance?: string | null;
  commonMistakes?: string | null;
  contraindications?: string | null;
}

export interface AiWorkoutDraft {
  name?: string;
  date?: string;
  description?: string;
  objective?: string;
  focusAreas?: string;
  intensity?: string;
  estimatedDurationMinutes?: number | null;
  estimatedCaloriesMin?: number | null;
  estimatedCaloriesMax?: number | null;
  studentSummary?: string;
  safetyNote?: string;
  notes?: string;
  exercises?: Array<Partial<ExerciseItem> & {
    exerciseId?: string;
    exerciseLibraryId?: string;
  }>;
}

export interface AiValidationContext {
  studentId: string;
  weekStart: string;
  weekEnd: string;
  expectedWorkoutDates: string[];
  expectedWorkoutCount: number;
  validationKey?: string;
}

export interface AiWorkoutDraftBatch {
  source?: string;
  createdAt?: string;
  studentId: string;
  studentName?: string;
  currentIndex?: number;
  scheduleDescription?: string;
  scheduleWarning?: string;
  aiValidation?: AiValidationContext;
  evolutionDecision?: {
    status?: string;
    reason?: string;
    requiresReviewBeforeRelease?: boolean;
    reviewAlerts?: string[];
  };
  workouts: AiWorkoutDraft[];
}

export interface StudentCareEventSummary {
  id: string;
  eventType: string;
  severity: string;
  status: string;
  title?: string | null;
  description?: string | null;
  professorMessage?: string | null;
  resolutionNotes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ReleaseReviewContext {
  baselineDate?: string;
  latestNewContextDate?: string | null;
  previousWeek?: { label?: string };
  previousWeekWorkouts?: number;
  completedPreviousWeek?: number;
  pendingPreviousWeek?: number;
  workoutUpdatesAfterPlanning?: number;
  openCareEvents?: number;
  newCareEventsAfterPlanning?: number;
  criticalCareEventsAfterPlanning?: number;
  newStudentQuestions?: number;
  newStudentQuestionsAfterPlanning?: number;
  newPainQuestionsAfterPlanning?: number;
  hasOpenPainQuestion?: boolean;
  hasTrainingPauseCareEvent?: boolean;
  hasCriticalOpenCareEvent?: boolean;
  studentProfileUpdatedAfterPlanning?: boolean;
  stalePrescriptionBecauseOfNewContext?: boolean;
  recommendedAction?: string;
  actionOptions?: string[];
  blocksRelease?: boolean;
  requiresReviewBeforeRelease?: boolean;
  reviewAlerts?: string[];
}
