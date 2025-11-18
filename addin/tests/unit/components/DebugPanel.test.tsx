/**
 * Debug Panel Unit Tests
 * Tests the API testing and slide content extraction component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DebugPanel } from '../../../src/taskpane/components/DebugPanel';

// Mock Office.js
global.Office = {
  context: {
    document: {
      getSelectedDataAsync: jest.fn(),
      getFilePropertiesAsync: jest.fn(),
    },
  },
} as any;

global.PowerPoint = {
  Presentation: {
    getSelectedSlidesAsync: jest.fn(),
    getSlidesAsync: jest.fn(),
  },
  run: jest.fn(),
} as any;

// Mock fetch
global.fetch = jest.fn();

describe('DebugPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Component Rendering', () => {
    test('renders debug panel with initial state', () => {
      render(<DebugPanel />);

      expect(screen.getByText(/debug panel/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/http:\/\/localhost:8000\/api\/v1\/narration\/process-presentation/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /extract slides/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /test api/i })).toBeInTheDocument();
    });

    test('renders all main sections', () => {
      render(<DebugPanel />);

      // Slide extraction section
      expect(screen.getByText(/slide extraction/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /extract slides/i })).toBeInTheDocument();

      // API testing section
      expect(screen.getByText(/api testing/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /test api/i })).toBeInTheDocument();

      // Response section
      expect(screen.getByText(/api response/i)).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /api response/i })).toBeInTheDocument();
    });
  });

  describe('Slide Extraction', () => {
    test('extracts slide content successfully', async () => {
      const mockSlides = [
        {
          id: '1',
          title: 'Test Slide 1',
          content: 'This is test content',
        },
        {
          id: '2',
          title: 'Test Slide 2',
          content: 'More test content',
        },
      ];

      const mockRun = global.PowerPoint.run as jest.Mock;
      mockRun.mockImplementation((callback) => {
        return callback({
          sync: jest.fn(),
          presentation: {
            slides: {
              items: mockSlides,
              load: jest.fn(),
            },
          },
        });
      });

      const user = userEvent.setup();

      render(<DebugPanel />);

      const extractButton = screen.getByRole('button', { name: /extract slides/i });
      await user.click(extractButton);

      await waitFor(() => {
        expect(screen.getByText(/slide 1/i)).toBeInTheDocument();
        expect(screen.getByText(/test slide 1/i)).toBeInTheDocument();
        expect(screen.getByText(/this is test content/i)).toBeInTheDocument();
      });
    });

    test('handles slide extraction errors', async () => {
      const mockRun = global.PowerPoint.run as jest.Mock;
      mockRun.mockRejectedValue(new Error('PowerPoint error'));

      const user = userEvent.setup();

      render(<DebugPanel />);

      const extractButton = screen.getByRole('button', { name: /extract slides/i });
      await user.click(extractButton);

      await waitFor(() => {
        expect(screen.getByText(/error extracting slides/i)).toBeInTheDocument();
        expect(screen.getByText(/powerpoint error/i)).toBeInTheDocument();
      });
    });

    test('displays loading state during extraction', async () => {
      let resolveExtraction: (value: any) => void;
      const mockRun = global.PowerPoint.run as jest.Mock;
      mockRun.mockReturnValue(new Promise(resolve => {
        resolveExtraction = resolve;
      }));

      const user = userEvent.setup();

      render(<DebugPanel />);

      const extractButton = screen.getByRole('button', { name: /extract slides/i });
      await user.click(extractButton);

      // Check loading state
      expect(extractButton).toBeDisabled();
      expect(screen.getByText(/extracting/i)).toBeInTheDocument();

      // Resolve extraction
      resolveExtraction!({
        slides: { items: [] }
      });

      await waitFor(() => {
        expect(extractButton).not.toBeDisabled();
      });
    });
  });

  describe('API Testing', () => {
    test('sends API request with extracted data', async () => {
      const mockResponse = {
        status: 'success',
        job_id: 'test-job-123',
        message: 'Processing started',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      // Mock extracted slides
      const mockSlides = [
        {
          slideNumber: 1,
          title: 'Test Slide 1',
          text: 'Test content',
          shapes: 2,
          layout: 'title-and-content',
          categories: [
            { type: 'title', text: 'Test Slide 1' },
            { type: 'body', text: 'Test content' }
          ],
        },
      ];

      const user = userEvent.setup();

      render(<DebugPanel />);

      // First extract slides
      await user.click(screen.getByRole('button', { name: /extract slides/i }));

      // Wait for slides to be extracted
      await waitFor(() => {
        expect(screen.getByText(/test slide 1/i)).toBeInTheDocument();
      });

      // Then test API
      const apiButton = screen.getByRole('button', { name: /test api/i });
      await user.click(apiButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8000/api/v1/narration/process-presentation',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
            body: expect.stringContaining('Test Slide 1'),
          })
        );
      });

      // Check response display
      await waitFor(() => {
        expect(screen.getByDisplayValue(/test-job-123/i)).toBeInTheDocument();
        expect(screen.getByDisplayValue(/processing started/i)).toBeInTheDocument();
      });
    });

    test('handles API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const user = userEvent.setup();

      render(<DebugPanel />);

      const apiButton = screen.getByRole('button', { name: /test api/i });
      await user.click(apiButton);

      await waitFor(() => {
        expect(screen.getByText(/api request failed/i)).toBeInTheDocument();
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });

    test('allows customizing API endpoint', async () => {
      const user = userEvent.setup();

      render(<DebugPanel />);

      const endpointInput = screen.getByLabelText(/api endpoint/i);
      await user.clear(endpointInput);
      await user.type(endpointInput, 'https://custom-api.example.com/process');

      expect(endpointInput).toHaveValue('https://custom-api.example.com/process');
    });
  });

  describe('Image Handling', () => {
    test('extracts images from slides', async () => {
      const mockImages = [
        {
          slideNumber: 1,
          imageIndex: 0,
          base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          format: 'png',
          width: 100,
          height: 100,
          name: 'test-image.png',
        },
      ];

      const mockRun = global.PowerPoint.run as jest.Mock;
      mockRun.mockImplementation((callback) => {
        return callback({
          sync: jest.fn(),
          presentation: {
            slides: {
              items: [{ id: '1', images: mockImages }],
              load: jest.fn(),
            },
          },
        });
      });

      const user = userEvent.setup();

      render(<DebugPanel />);

      await user.click(screen.getByRole('button', { name: /extract slides/i }));

      await waitFor(() => {
        expect(screen.getByText(/images extracted/i)).toBeInTheDocument();
        expect(screen.getByText(/test-image.png/i)).toBeInTheDocument();
      });
    });

    test('includes images in API request when option is selected', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ status: 'success' }),
      });

      const mockImages = [
        {
          slideNumber: 1,
          imageIndex: 0,
          base64: 'data:image/png;base64,test-image-data',
          format: 'png',
          width: 100,
          height: 100,
        },
      ];

      const mockRun = global.PowerPoint.run as jest.Mock;
      mockRun.mockImplementation((callback) => {
        return callback({
          sync: jest.fn(),
          presentation: {
            slides: {
              items: [{ id: '1', images: mockImages }],
              load: jest.fn(),
            },
          },
        });
      });

      const user = userEvent.setup();

      render(<DebugPanel />);

      // Extract slides with images
      await user.click(screen.getByRole('button', { name: /extract slides/i }));

      await waitFor(() => {
        expect(screen.getByText(/images extracted/i)).toBeInTheDocument();
      });

      // Enable images in API request
      const includeImagesCheckbox = screen.getByLabelText(/include images/i);
      await user.click(includeImagesCheckbox);

      // Send API request
      await user.click(screen.getByRole('button', { name: /test api/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('test-image-data'),
          })
        );
      });
    });
  });

  describe('Response Handling', () => {
    test('displays API response in textarea', async () => {
      const mockResponse = {
        job_id: 'test-123',
        status: 'processing',
        slides_processed: 5,
        estimated_time: 30,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const user = userEvent.setup();

      render(<DebugPanel />);

      await user.click(screen.getByRole('button', { name: /test api/i }));

      await waitFor(() => {
        const responseTextarea = screen.getByRole('textbox', { name: /api response/i });
        expect(responseTextarea).toHaveValue(expect.stringContaining('test-123'));
        expect(responseTextarea).toHaveValue(expect.stringContaining('processing'));
      });
    });

    test('formats JSON response nicely', async () => {
      const mockResponse = {
        status: 'success',
        data: {
          slides: [
            { id: 1, title: 'Slide 1' },
            { id: 2, title: 'Slide 2' },
          ],
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const user = userEvent.setup();

      render(<DebugPanel />);

      await user.click(screen.getByRole('button', { name: /test api/i }));

      await waitFor(() => {
        const responseTextarea = screen.getByRole('textbox', { name: /api response/i });
        const formattedResponse = JSON.stringify(mockResponse, null, 2);
        expect(responseTextarea).toHaveValue(formattedResponse);
      });
    });
  });

  describe('Error Handling', () => {
    test('shows clear error messages for different failure types', async () => {
      // Test network error
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network unavailable'));

      const user = userEvent.setup();

      render(<DebugPanel />);

      await user.click(screen.getByRole('button', { name: /test api/i }));

      await waitFor(() => {
        expect(screen.getByText(/api request failed/i)).toBeInTheDocument();
      });

      // Test server error
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      jest.clearAllMocks();
      await user.click(screen.getByRole('button', { name: /test api/i }));

      await waitFor(() => {
        expect(screen.getByText(/server error.*500/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    test('has proper ARIA labels and roles', () => {
      render(<DebugPanel />);

      expect(screen.getByRole('button', { name: /extract slides/i })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /api response/i })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /api endpoint/i })).toBeInTheDocument();
    });

    test('provides helpful error messages for screen readers', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const user = userEvent.setup();

      render(<DebugPanel />);

      await user.click(screen.getByRole('button', { name: /test api/i }));

      await waitFor(() => {
        const errorElement = screen.getByRole('alert');
        expect(errorElement).toBeInTheDocument();
        expect(errorElement).toHaveTextContent(/api request failed/i);
      });
    });
  });
});