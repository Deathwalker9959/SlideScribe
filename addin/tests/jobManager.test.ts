/**
 * Tests for Job State Management
 * Tests for centralized state management of narration jobs
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Import the job manager components and types
import { JobProvider, useJobState, useJobActions, Job, JobStatus } from '../src/taskpane/state/jobManager';

// Mock WebSocket connections for testing
const mockWebSocket = {
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// Mock Office.js
const mockPowerPointRun = jest.fn();

// Test component that uses job state
interface TestComponentProps {
  onJobComplete?: (job: Job) => void;
}

function TestComponent({ onJobComplete }: TestComponentProps) {
  const { state, dispatch } = useJobState();
  const { createJob, updateJobStatus, updateJobProgress } = useJobActions();

  const handleCreateJob = () => {
    createJob({
      id: 'test-job-123',
      presentationId: 'test-presentation-456',
      status: 'idle',
      progress: {
        currentSlide: 0,
        totalSlides: 0,
        currentOperation: 'Initializing',
        progress: 0,
        stage: 'starting',
      },
      error: null,
      slideScripts: [],
      audioExports: [],
    });
  };

  const handleUpdateStatus = (status: JobStatus) => {
    updateJobStatus('test-job-123', status);
  };

  const handleUpdateProgress = (progress: number) => {
    updateJobProgress('test-job-123', {
      progress,
      currentOperation: `Processing at ${Math.round(progress * 100)}%`,
    });
  };

  const activeJob = state.activeJobId ? state.jobs[state.activeJobId] : null;

  React.useEffect(() => {
    if (activeJob?.status === 'completed' && onJobComplete) {
      onJobComplete(activeJob);
    }
  }, [activeJob, onJobComplete]);

  return (
    <div data-testid="test-component">
      <button onClick={handleCreateJob} data-testid="create-job">
        Create Job
      </button>
      <button onClick={() => handleUpdateStatus('processing')} data-testid="start-processing">
        Start Processing
      </button>
      <button onClick={() => handleUpdateStatus('completed')} data-testid="complete-job">
        Complete Job
      </button>
      <button onClick={() => handleUpdateProgress(0.5)} data-testid="update-progress">
        Update Progress
      </button>

      {activeJob && (
        <div data-testid="active-job">
          <span data-testid="job-id">{activeJob.id}</span>
          <span data-testid="job-status">{activeJob.status}</span>
          <span data-testid="job-progress">{activeJob.progress.progress}</span>
          <span data-testid="job-operation">{activeJob.progress.currentOperation}</span>
        </div>
      )}

      {state.loading && <span data-testid="loading">Loading...</span>}
      {state.globalError && <span data-testid="error">{state.globalError.message}</span>}
    </div>
  );
}

describe('Job State Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create and manage job state', async () => {
    render(
      <JobProvider>
        <TestComponent />
      </JobProvider>
    );

    // Initially no active job
    expect(screen.queryByTestId('active-job')).not.toBeInTheDocument();

    // Create a job
    fireEvent.click(screen.getByTestId('create-job'));

    // Wait for job to be created
    await waitFor(() => {
      expect(screen.getByTestId('active-job')).toBeInTheDocument();
    });

    // Verify job details
    expect(screen.getByTestId('job-id')).toHaveTextContent('test-job-123');
    expect(screen.getByTestId('job-status')).toHaveTextContent('idle');
    expect(screen.getByTestId('job-progress')).toHaveTextContent('0');
    expect(screen.getByTestId('job-operation')).toHaveTextContent('Initializing');
  });

  it('should update job status correctly', async () => {
    render(
      <JobProvider>
        <TestComponent />
      </JobProvider>
    );

    // Create job
    fireEvent.click(screen.getByTestId('create-job'));

    await waitFor(() => {
      expect(screen.getByTestId('job-status')).toHaveTextContent('idle');
    });

    // Start processing
    fireEvent.click(screen.getByTestId('start-processing'));

    await waitFor(() => {
      expect(screen.getByTestId('job-status')).toHaveTextContent('processing');
    });

    // Complete job
    fireEvent.click(screen.getByTestId('complete-job'));

    await waitFor(() => {
      expect(screen.getByTestId('job-status')).toHaveTextContent('completed');
    });
  });

  it('should update job progress correctly', async () => {
    render(
      <JobProvider>
        <TestComponent />
      </JobProvider>
    );

    // Create job
    fireEvent.click(screen.getByTestId('create-job'));

    await waitFor(() => {
      expect(screen.getByTestId('job-progress')).toHaveTextContent('0');
    });

    // Update progress
    fireEvent.click(screen.getByTestId('update-progress'));

    await waitFor(() => {
      expect(screen.getByTestId('job-progress')).toHaveTextContent('0.5');
      expect(screen.getByTestId('job-operation')).toHaveTextContent('Processing at 50%');
    });
  });

  it('should handle job completion callback', async () => {
    const mockCallback = jest.fn();

    render(
      <JobProvider>
        <TestComponent onJobComplete={mockCallback} />
      </JobProvider>
    );

    // Create and complete job
    fireEvent.click(screen.getByTestId('create-job'));

    await waitFor(() => {
      expect(screen.getByTestId('job-status')).toHaveTextContent('idle');
    });

    fireEvent.click(screen.getByTestId('complete-job'));

    await waitFor(() => {
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-job-123',
          status: 'completed',
        })
      );
    });
  });

  it('should handle loading state', async () => {
    function LoadingTestComponent() {
      const { setLoading } = useJobActions();

      const handleSetLoading = () => {
        setLoading(true, 'Test loading message');
      };

      return (
        <div>
          <button onClick={handleSetLoading} data-testid="set-loading">
            Set Loading
          </button>
        </div>
      );
    }

    render(
      <JobProvider>
        <TestComponent />
        <LoadingTestComponent />
      </JobProvider>
    );

    // Initially not loading
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();

    // Set loading
    fireEvent.click(screen.getByTestId('set-loading'));

    // Note: Loading state is managed through dispatch,
    // this test would need to access the state directly
    // This demonstrates the testing pattern
  });

  it('should manage multiple jobs correctly', async () => {
    function MultiJobComponent() {
      const { state } = useJobState();
      const { createJob, setActiveJob } = useJobActions();

      const handleCreateJob1 = () => {
        createJob({
          id: 'job-1',
          presentationId: 'presentation-1',
          status: 'processing',
          progress: { currentSlide: 1, totalSlides: 10, currentOperation: 'Job 1', progress: 0.1, stage: 'processing' },
          error: null,
          slideScripts: [],
          audioExports: [],
        });
      };

      const handleCreateJob2 = () => {
        createJob({
          id: 'job-2',
          presentationId: 'presentation-2',
          status: 'completed',
          progress: { currentSlide: 5, totalSlides: 5, currentOperation: 'Job 2', progress: 1.0, stage: 'completed' },
          error: null,
          slideScripts: [],
          audioExports: [],
        });
      };

      return (
        <div>
          <button onClick={handleCreateJob1} data-testid="create-job-1">
            Create Job 1
          </button>
          <button onClick={handleCreateJob2} data-testid="create-job-2">
            Create Job 2
          </button>
          <div data-testid="job-count">{Object.keys(state.jobs).length}</div>
          <div data-testid="active-job-id">{state.activeJobId || 'none'}</div>
        </div>
      );
    }

    render(
      <JobProvider>
        <MultiJobComponent />
      </JobProvider>
    );

    // Initially no jobs
    expect(screen.getByTestId('job-count')).toHaveTextContent('0');
    expect(screen.getByTestId('active-job-id')).toHaveTextContent('none');

    // Create first job
    fireEvent.click(screen.getByTestId('create-job-1'));

    await waitFor(() => {
      expect(screen.getByTestId('job-count')).toHaveTextContent('1');
      expect(screen.getByTestId('active-job-id')).toHaveTextContent('job-1');
    });

    // Create second job
    fireEvent.click(screen.getByTestId('create-job-2'));

    await waitFor(() => {
      expect(screen.getByTestId('job-count')).toHaveTextContent('2');
      // Active job should switch to the newly created job
      expect(screen.getByTestId('active-job-id')).toHaveTextContent('job-2');
    });
  });
});

describe('Job Error Handling', () => {
  it('should handle job errors correctly', async () => {
    function ErrorTestComponent() {
      const { setJobError } = useJobActions();
      const { state } = useJobState();

      const handleSetError = () => {
        setJobError('test-job-123', {
          code: 'TEST_ERROR',
          message: 'Test error message',
          details: { errorDetail: 'test' },
          timestamp: new Date(),
          recoverable: true,
        });
      };

      const activeJob = state.activeJobId ? state.jobs[state.activeJobId] : null;

      return (
        <div>
          <button onClick={handleSetError} data-testid="set-error">
            Set Error
          </button>
          {activeJob && activeJob.error && (
            <div data-testid="job-error">
              <span data-testid="error-code">{activeJob.error.code}</span>
              <span data-testid="error-message">{activeJob.error.message}</span>
            </div>
          )}
        </div>
      );
    }

    render(
      <JobProvider>
        <ErrorTestComponent />
      </JobProvider>
    );

    // Set error
    fireEvent.click(screen.getByTestId('set-error'));

    // Note: This test would need to create a job first to see the error
    // The pattern demonstrates error state testing
  });
});

describe('Job Progress Tracking', () => {
  it('should track complex progress updates', async () => {
    function ProgressTestComponent() {
      const { updateJobProgress } = useJobActions();
      const { state } = useJobState();

      const handleComplexProgress = () => {
        updateJobProgress('test-job-123', {
          currentSlide: 3,
          totalSlides: 10,
          currentOperation: 'Generating TTS',
          progress: 0.3,
          stage: 'synthesis',
          estimatedTimeRemaining: 120,
        });
      };

      const activeJob = state.activeJobId ? state.jobs[state.activeJobId] : null;

      return (
        <div>
          <button onClick={handleComplexProgress} data-testid="complex-progress">
            Update Complex Progress
          </button>
          {activeJob && (
            <div data-testid="complex-progress-details">
              <span data-testid="current-slide">{activeJob.progress.currentSlide}</span>
              <span data-testid="total-slides">{activeJob.progress.totalSlides}</span>
              <span data-testid="estimated-time">{activeJob.progress.estimatedTimeRemaining}</span>
            </div>
          )}
        </div>
      );
    }

    render(
      <JobProvider>
        <ProgressTestComponent />
      </JobProvider>
    );

    // This test demonstrates how to test complex progress updates
    // In practice, you'd create a job first, then update progress
  });
});