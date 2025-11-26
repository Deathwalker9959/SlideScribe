/**
 * Job State Management
 * Centralized state management for narration jobs with error boundaries and loading states
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from "react";

// Job state types
export type JobStatus =
  | "idle"
  | "extracting"
  | "refining"
  | "synthesizing"
  | "generating-subtitles"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type JobError = {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  recoverable: boolean;
};

export type JobProgress = {
  currentSlide: number;
  totalSlides: number;
  currentOperation: string;
  progress: number; // 0-100
  estimatedTimeRemaining?: number;
  stage: string;
};

export type Job = {
  id: string;
  presentationId: string;
  status: JobStatus;
  progress: JobProgress;
  error: JobError | null;
  startedAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
  slideScripts: any[]; // Will be typed properly later
  audioExports: any[];
};

export type JobState = {
  // Current active job
  activeJobId: string | null;
  jobs: Record<string, Job>;

  // UI state
  loading: boolean;
  loadingMessage?: string;

  // Error state
  globalError: JobError | null;

  // Connection state
  connectionStatus: "connected" | "disconnected" | "connecting" | "error";

  // Completion state
  completionToast: {
    visible: boolean;
    jobId: string;
    message: string;
    createdAt: Date;
  } | null;
};

// Action types
type JobAction =
  | { type: "SET_ACTIVE_JOB"; jobId: string | null }
  | { type: "CREATE_JOB"; job: Omit<Job, "progress"> }
  | { type: "UPDATE_JOB_STATUS"; jobId: string; status: JobStatus }
  | { type: "UPDATE_JOB_PROGRESS"; jobId: string; progress: Partial<JobProgress> }
  | { type: "SET_JOB_ERROR"; jobId: string; error: JobError }
  | { type: "CLEAR_JOB_ERROR"; jobId: string }
  | { type: "SET_LOADING"; loading: boolean; message?: string }
  | { type: "SET_GLOBAL_ERROR"; error: JobError | null }
  | { type: "SET_CONNECTION_STATUS"; status: JobState["connectionStatus"] }
  | { type: "SHOW_COMPLETION_TOAST"; jobId: string; message: string }
  | { type: "HIDE_COMPLETION_TOAST" }
  | { type: "UPDATE_JOB_SLIDES"; jobId: string; slides: any[] }
  | { type: "UPDATE_JOB_EXPORTS"; jobId: string; exports: any[] }
  | { type: "CLEAR_JOB"; jobId: string };

// Initial state
const initialState: JobState = {
  activeJobId: null,
  jobs: {},
  loading: false,
  globalError: null,
  connectionStatus: "disconnected",
  completionToast: null,
};

// Reducer
function jobReducer(state: JobState, action: JobAction): JobState {
  switch (action.type) {
    case "SET_ACTIVE_JOB":
      return { ...state, activeJobId: action.jobId };

    case "CREATE_JOB":
      const newJob: Job = {
        ...action.job,
        progress: {
          currentSlide: 0,
          totalSlides: 0,
          currentOperation: "Initializing",
          progress: 0,
          stage: "starting",
        },
      };
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.job.id]: newJob,
        },
        activeJobId: action.job.id,
        globalError: null,
      };

    case "UPDATE_JOB_STATUS":
      const jobToUpdate = state.jobs[action.jobId];
      if (!jobToUpdate) return state;

      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.jobId]: {
            ...jobToUpdate,
            status: action.status,
            completedAt: action.status === "completed" ? new Date() : jobToUpdate.completedAt,
          },
        },
      };

    case "UPDATE_JOB_PROGRESS":
      const existingJob = state.jobs[action.jobId];
      if (!existingJob) return state;

      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.jobId]: {
            ...existingJob,
            progress: {
              ...existingJob.progress,
              ...action.progress,
            },
          },
        },
      };

    case "SET_JOB_ERROR":
      const errorJob = state.jobs[action.jobId];
      if (!errorJob) return state;

      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.jobId]: {
            ...errorJob,
            status: "failed",
            error: action.error,
          },
        },
      };

    case "CLEAR_JOB_ERROR":
      const clearJob = state.jobs[action.jobId];
      if (!clearJob) return state;

      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.jobId]: {
            ...clearJob,
            error: null,
            status: clearJob.status === "failed" ? "idle" : clearJob.status,
          },
        },
      };

    case "SET_LOADING":
      return {
        ...state,
        loading: action.loading,
        loadingMessage: action.message,
      };

    case "SET_GLOBAL_ERROR":
      return {
        ...state,
        globalError: action.error,
      };

    case "SET_CONNECTION_STATUS":
      return {
        ...state,
        connectionStatus: action.status,
      };

    case "SHOW_COMPLETION_TOAST":
      return {
        ...state,
        completionToast: {
          visible: true,
          jobId: action.jobId,
          message: action.message,
          createdAt: new Date(),
        },
      };

    case "HIDE_COMPLETION_TOAST":
      return {
        ...state,
        completionToast: null,
      };

    case "UPDATE_JOB_SLIDES":
      const slidesJob = state.jobs[action.jobId];
      if (!slidesJob) return state;

      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.jobId]: {
            ...slidesJob,
            slideScripts: action.slides,
          },
        },
      };

    case "UPDATE_JOB_EXPORTS":
      const exportsJob = state.jobs[action.jobId];
      if (!exportsJob) return state;

      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.jobId]: {
            ...exportsJob,
            audioExports: action.exports,
          },
        },
      };

    case "CLEAR_JOB":
      const { [action.jobId]: removedJob, ...remainingJobs } = state.jobs;
      return {
        ...state,
        jobs: remainingJobs,
        activeJobId: state.activeJobId === action.jobId ? null : state.activeJobId,
      };

    default:
      return state;
  }
}

// Context
const JobContext = createContext<{
  state: JobState;
  dispatch: React.Dispatch<JobAction>;
} | null>(null);

// Provider
export function JobProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(jobReducer, initialState);

  // Auto-hide completion toast after 10 seconds
  useEffect(() => {
    if (state.completionToast?.visible) {
      const timer = setTimeout(() => {
        dispatch({ type: "HIDE_COMPLETION_TOAST" });
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [state.completionToast]);

  return React.createElement(JobContext.Provider, { value: { state, dispatch } }, children);
}

// Hook
export function useJobState() {
  const context = useContext(JobContext);
  if (!context) {
    throw new Error("useJobState must be used within a JobProvider");
  }
  return context;
}

// Helper hooks
export function useActiveJob(): Job | null {
  const { state } = useJobState();
  return state.activeJobId ? state.jobs[state.activeJobId] : null;
}

export function useJob(jobId: string): Job | null {
  const { state } = useJobState();
  return state.jobs[jobId] || null;
}

export function useJobActions() {
  const { dispatch } = useJobState();

  const createJob = useCallback(
    (jobData: Omit<Job, "progress" | "error">) => {
      dispatch({ type: "CREATE_JOB", job: jobData });
    },
    [dispatch]
  );

  const updateJobStatus = useCallback(
    (jobId: string, status: JobStatus) => {
      dispatch({ type: "UPDATE_JOB_STATUS", jobId, status });
    },
    [dispatch]
  );

  const updateJobProgress = useCallback(
    (jobId: string, progress: Partial<JobProgress>) => {
      dispatch({ type: "UPDATE_JOB_PROGRESS", jobId, progress });
    },
    [dispatch]
  );

  const setJobError = useCallback(
    (jobId: string, error: JobError) => {
      dispatch({ type: "SET_JOB_ERROR", jobId, error });
    },
    [dispatch]
  );

  const clearJobError = useCallback(
    (jobId: string) => {
      dispatch({ type: "CLEAR_JOB_ERROR", jobId });
    },
    [dispatch]
  );

  const setLoading = useCallback(
    (loading: boolean, message?: string) => {
      dispatch({ type: "SET_LOADING", loading, message });
    },
    [dispatch]
  );

  const setActiveJob = useCallback(
    (jobId: string | null) => {
      dispatch({ type: "SET_ACTIVE_JOB", jobId });
    },
    [dispatch]
  );

  const clearJob = useCallback(
    (jobId: string) => {
      dispatch({ type: "CLEAR_JOB", jobId });
    },
    [dispatch]
  );

  const showCompletionToast = useCallback(
    (jobId: string, message: string) => {
      dispatch({ type: "SHOW_COMPLETION_TOAST", jobId, message });
    },
    [dispatch]
  );

  const hideCompletionToast = useCallback(() => {
    dispatch({ type: "HIDE_COMPLETION_TOAST" });
  }, [dispatch]);

  return {
    createJob,
    updateJobStatus,
    updateJobProgress,
    setJobError,
    clearJobError,
    setLoading,
    setActiveJob,
    clearJob,
    showCompletionToast,
    hideCompletionToast,
  };
}

// Error boundary component
export class JobErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("JobErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="job-error-boundary">
            <h3>Something went wrong</h3>
            <p>We encountered an error while processing your job.</p>
            <details>
              <summary>Error details</summary>
              <pre>{this.state.error?.message}</pre>
            </details>
            <button onClick={() => this.setState({ hasError: false, error: null })}>
              Try again
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
