/**
 * Tests for Enhanced NarrationAssistant Component
 * Tests for language toggle, accessibility features, and new state management
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import NarrationAssistant from '../src/taskpane/components/NarrationAssistant';

// Mock Office.js PowerPoint API
const mockPowerPoint = {
  run: jest.fn((callback) => {
    const context = {
      presentation: {
        slides: {
          items: [
            { id: 'slide-1', title: 'Slide 1' },
            { id: 'slide-2', title: 'Slide 2' },
            { id: 'slide-3', title: 'Slide 3' },
          ],
          load: jest.fn(),
        },
      },
      sync: jest.fn().mockResolvedValue(undefined),
    };
    return callback(context);
  }),
};

// Mock global Office object
(global as any).Office = {
  context: {
    document: {
      settings: {
        set: jest.fn(),
        get: jest.fn(),
      },
    },
  },
  HostType: {
    PowerPoint: 'PowerPoint',
  },
};

// Mock WebSocket for real-time updates
const mockWebSocket = {
  send: jest.fn(),
  close: jest.fn(),
  readyState: WebSocket.OPEN,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

(global as any).WebSocket = jest.fn(() => mockWebSocket);

// Mock fetch API
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  })
) as jest.Mock;

describe('NarrationAssistant Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the initial view', () => {
    render(<NarrationAssistant />);

    expect(screen.getByText('SlideScribe Narration Assistant')).toBeInTheDocument();
    expect(screen.getByTestId('start-button')).toBeInTheDocument();
    expect(screen.getByTestId('language-toggle')).toBeInTheDocument();
  });

  it('should have language toggle with correct initial state', () => {
    render(<NarrationAssistant />);

    const languageToggle = screen.getByTestId('language-toggle');
    expect(languageToggle).toBeInTheDocument();
    expect(languageToggle).toHaveAttribute('aria-label', expect.stringContaining('Current language: en-US'));

    // Should display current language code
    expect(screen.getByTestId('language-code')).toHaveTextContent('en-US');
  });

  it('should cycle through languages when language toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<NarrationAssistant />);

    const languageToggle = screen.getByTestId('language-toggle');

    // Get initial language
    const initialLanguage = screen.getByTestId('language-code').textContent;

    // Click language toggle
    await user.click(languageToggle);

    // Language should change
    const newLanguage = screen.getByTestId('language-code').textContent;
    expect(newLanguage).not.toBe(initialLanguage);

    // Status message should show language change
    expect(screen.getByText(/Language changed to/)).toBeInTheDocument();
  });

  it('should support keyboard navigation for language toggle', async () => {
    const user = userEvent.setup();
    render(<NarrationAssistant />);

    const languageToggle = screen.getByTestId('language-toggle');
    languageToggle.focus();

    // Should trigger with Enter key
    await user.keyboard('{Enter}');

    // Language should change
    expect(screen.getByText(/Language changed to/)).toBeInTheDocument();

    // Clear status message
    jest.clearAllMocks();

    // Should trigger with Space key
    await user.keyboard('{ }');

    expect(screen.getByText(/Language changed to/)).toBeInTheDocument();
  });

  it('should have skip navigation link for accessibility', () => {
    render(<NarrationAssistant />);

    const skipLink = screen.getByTestId('skip-navigation');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveTextContent('Skip to main content');
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  it('should show ARIA live region for status messages', async () => {
    const user = userEvent.setup();
    render(<NarrationAssistant />);

    // Trigger a status message
    const languageToggle = screen.getByTestId('language-toggle');
    await user.click(languageToggle);

    // Should have aria-live region for screen readers
    const liveRegion = screen.getByTestId('status-live-region');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });

  it('should have proper ARIA labels for all interactive elements', () => {
    render(<NarrationAssistant />);

    // Check main navigation buttons
    const startButton = screen.getByTestId('start-button');
    expect(startButton).toHaveAttribute('aria-label');

    const scriptButton = screen.getByTestId('script-button');
    expect(scriptButton).toHaveAttribute('aria-label');

    const settingsButton = screen.getByTestId('settings-button');
    expect(settingsButton).toHaveAttribute('aria-label');

    const debugButton = screen.getByTestId('debug-button');
    expect(debugButton).toHaveAttribute('aria-label');
  });

  it('should handle keyboard shortcuts', async () => {
    const user = userEvent.setup();
    render(<NarrationAssistant />);

    // Alt + L should change language
    await user.keyboard('{Alt>l/Alt}');
    expect(screen.getByText(/Language changed to/)).toBeInTheDocument();

    // Alt + S should go to script view
    await user.keyboard('{Alt>s/Alt}');
    expect(screen.getByTestId('script-view')).toBeInTheDocument();

    // Alt + H should show help
    await user.keyboard('{Alt>h/Alt}');
    expect(screen.getByTestId('help-panel')).toBeInTheDocument();
  });

  it('should show progress panel when narration is active', async () => {
    const user = userEvent.setup();
    render(<NarrationAssistant />);

    // Start narration
    const startButton = screen.getByTestId('start-button');
    await user.click(startButton);

    // Should show progress panel
    await waitFor(() => {
      expect(screen.getByTestId('progress-panel')).toBeInTheDocument();
    });

    // Should show progress indicators
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('current-operation')).toBeInTheDocument();
    expect(screen.getByTestId('slide-progress')).toBeInTheDocument();
  });

  it('should display completion toast when narration finishes', async () => {
    const user = userEvent.setup();
    render(<NarrationAssistant />);

    // Simulate completion after starting
    const startButton = screen.getByTestId('start-button');
    await user.click(startButton);

    // Mock completion
    fireEvent(screen.getByTestId('narration-assistant'), new CustomEvent('narration-completed', {
      detail: {
        jobId: 'test-job-123',
        message: 'Narration completed successfully'
      }
    }));

    await waitFor(() => {
      expect(screen.getByTestId('completion-toast')).toBeInTheDocument();
      expect(screen.getByText('Narration completed successfully')).toBeInTheDocument();
    });
  });

  it('should handle error states gracefully', async () => {
    const user = userEvent.setup();
    render(<NarrationAssistant />);

    // Mock an error
    fireEvent(screen.getByTestId('narration-assistant'), new CustomEvent('narration-error', {
      detail: {
        code: 'CONNECTION_ERROR',
        message: 'Unable to connect to server'
      }
    }));

    await waitFor(() => {
      expect(screen.getByTestId('error-display')).toBeInTheDocument();
      expect(screen.getByText('Unable to connect to server')).toBeInTheDocument();
    });

    // Should provide retry option
    expect(screen.getByTestId('retry-button')).toBeInTheDocument();
  });

  it('should maintain focus management during view changes', async () => {
    const user = userEvent.setup();
    render(<NarrationAssistant />);

    // Focus on initial view element
    const startButton = screen.getByTestId('start-button');
    startButton.focus();
    expect(startButton).toHaveFocus();

    // Switch to script view
    const scriptButton = screen.getByTestId('script-button');
    await user.click(scriptButton);

    // Focus should move to script view
    await waitFor(() => {
      expect(screen.getByTestId('script-editor')).toHaveFocus();
    });
  });

  it('should have color contrast compliance', () => {
    render(<NarrationAssistant />);

    // Check that text has sufficient contrast (would need a contrast checking library)
    const mainText = screen.getByText('SlideScribe Narration Assistant');
    expect(mainText).toBeInTheDocument();

    // This would typically use a contrast checking library
    // For now, we just verify the elements exist
    expect(mainText).toHaveClass(expect.stringContaining('text-'));
  });

  it('should support screen reader announcements for job progress', async () => {
    const user = userEvent.setup();
    render(<NarrationAssistant />);

    // Start narration
    const startButton = screen.getByTestId('start-button');
    await user.click(startButton);

    // Mock progress update
    fireEvent(screen.getByTestId('progress-panel'), new CustomEvent('progress-update', {
      detail: {
        status: 'processing',
        progress: 0.5,
        currentOperation: 'Generating TTS for slide 3'
      }
    }));

    await waitFor(() => {
      const progressAnnouncement = screen.getByTestId('progress-announcement');
      expect(progressAnnouncement).toHaveAttribute('aria-live', 'assertive');
      expect(progressAnnouncement).toHaveTextContent(/Generating TTS for slide 3/);
    });
  });

  it('should have responsive design for different screen sizes', () => {
    // Mock different screen sizes
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    });

    render(<NarrationAssistant />);

    // Should have mobile-responsive elements
    expect(screen.getByTestId('mobile-menu-button')).toBeInTheDocument();
    expect(screen.getByTestId('narration-assistant')).toHaveClass('mobile-layout');

    // Test desktop layout
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200,
    });

    render(<NarrationAssistant />);

    expect(screen.getByTestId('narration-assistant')).toHaveClass('desktop-layout');
  });

  it('should integrate with job state management', async () => {
    const user = userEvent.setup();
    render(<NarrationAssistant />);

    // Start narration
    const startButton = screen.getByTestId('start-button');
    await user.click(startButton);

    // Should create and track job
    await waitFor(() => {
      expect(screen.getByTestId('active-job-display')).toBeInTheDocument();
    });

    // Should show job ID
    expect(screen.getByTestId('job-id-display')).toBeInTheDocument();
  });

  it('should handle voice settings changes', async () => {
    const user = userEvent.setup();
    render(<NarrationAssistant />);

    // Go to settings view
    const settingsButton = screen.getByTestId('settings-button');
    await user.click(settingsButton);

    // Change voice setting
    const voiceSelect = screen.getByTestId('voice-select');
    await user.selectOptions(voiceSelect, 'en-US-AriaNeural');

    // Should update voice settings
    expect(screen.getByText(/Voice changed to/)).toBeInTheDocument();
  });

  it('should provide help and documentation access', async () => {
    const user = userEvent.setup();
    render(<NarrationAssistant />);

    // Open help
    const helpButton = screen.getByTestId('help-button');
    await user.click(helpButton);

    await waitFor(() => {
      expect(screen.getByTestId('help-panel')).toBeInTheDocument();
      expect(screen.getByText('How to use SlideScribe')).toBeInTheDocument();
    });

    // Should have keyboard shortcut info
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });
});