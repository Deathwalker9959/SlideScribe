/**
 * Tests for Subtitle Editor Component
 * Tests for subtitle timeline, timing controls, and validation
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import SubtitleEditor from '../src/taskpane/components/SubtitleEditor';

// Mock data for testing
const mockSubtitles = [
  {
    id: 'subtitle-1',
    start: 0.0,
    end: 3.5,
    text: 'Welcome to this presentation',
    validated: true,
  },
  {
    id: 'subtitle-2',
    start: 3.5,
    end: 7.0,
    text: 'Today we will discuss the future of AI',
    validated: true,
  },
  {
    id: 'subtitle-3',
    start: 7.0,
    end: 10.5,
    text: 'Let me show you some exciting developments',
    validated: false,
  },
];

// Mock Office.js PowerPoint API
const mockPowerPoint = {
  run: jest.fn((callback) => {
    const context = {
      presentation: {
        slides: {
          items: [
            { id: 'slide-1', title: 'Slide 1' },
            { id: 'slide-2', title: 'Slide 2' },
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
};

describe('SubtitleEditor Component', () => {
  const defaultProps = {
    subtitles: mockSubtitles,
    onSubtitlesChange: jest.fn(),
    presentationDuration: 30.0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render subtitle editor with subtitles', () => {
    render(<SubtitleEditor {...defaultProps} />);

    expect(screen.getByText('Subtitle Editor')).toBeInTheDocument();
    expect(screen.getByText('Welcome to this presentation')).toBeInTheDocument();
    expect(screen.getByText('Today we will discuss the future of AI')).toBeInTheDocument();
    expect(screen.getByText('Let me show you some exciting developments')).toBeInTheDocument();
  });

  it('should display validation status for each subtitle', () => {
    render(<SubtitleEditor {...defaultProps} />);

    // Validated subtitles should show check marks
    const validatedSubtitles = screen.getAllByTestId('subtitle-validated');
    expect(validatedSubtitles).toHaveLength(2);

    // Non-validated subtitle should show warning
    const invalidSubtitle = screen.getByTestId('subtitle-invalid');
    expect(invalidSubtitle).toBeInTheDocument();
  });

  it('should handle subtitle text editing', async () => {
    const mockOnSubtitlesChange = jest.fn();
    render(<SubtitleEditor {...defaultProps} onSubtitlesChange={mockOnSubtitlesChange} />);

    // Find the first subtitle text field
    const textField = screen.getByDisplayValue('Welcome to this presentation');

    // Update the text
    fireEvent.change(textField, { target: { value: 'Welcome to this amazing presentation' } });

    // Wait for the change to be handled
    await waitFor(() => {
      expect(mockOnSubtitlesChange).toHaveBeenCalledTimes(1);
    });

    const updatedSubtitles = mockOnSubtitlesChange.mock.calls[0][0];
    expect(updatedSubtitles[0].text).toBe('Welcome to this amazing presentation');
  });

  it('should handle timing adjustments with nudge controls', async () => {
    const mockOnSubtitlesChange = jest.fn();
    render(<SubtitleEditor {...defaultProps} onSubtitlesChange={mockOnSubtitlesChange} />);

    // Find nudge controls for the first subtitle
    const nudgeBackward = screen.getByTestId('nudge-backward-subtitle-1');
    const nudgeForward = screen.getByTestId('nudge-forward-subtitle-1');

    // Nudge forward by 0.1s
    fireEvent.click(nudgeForward);

    await waitFor(() => {
      expect(mockOnSubtitlesChange).toHaveBeenCalledTimes(1);
    });

    const updatedSubtitles = mockOnSubtitlesChange.mock.calls[0][0];
    expect(updatedSubtitles[0].start).toBe(0.1);
    expect(updatedSubtitles[0].end).toBe(3.6);

    // Nudge backward by 0.1s
    mockOnSubtitlesChange.mockClear();
    fireEvent.click(nudgeBackward);

    await waitFor(() => {
      expect(mockOnSubtitlesChange).toHaveBeenCalledTimes(1);
    });

    const updatedSubtitles2 = mockOnSubtitlesChange.mock.calls[0][0];
    expect(updatedSubtitles2[0].start).toBe(0.0);
    expect(updatedSubtitles2[0].end).toBe(3.5);
  });

  it('should validate subtitle timing and prevent overlaps', async () => {
    const mockOnSubtitlesChange = jest.fn();
    render(<SubtitleEditor {...defaultProps} onSubtitlesChange={mockOnSubtitlesChange} />);

    // Try to extend the first subtitle to overlap with the second
    const endTimeInput = screen.getByTestId('end-time-subtitle-1');
    fireEvent.change(endTimeInput, { target: { value: '5.0' } });

    await waitFor(() => {
      expect(screen.getByText('Subtitles cannot overlap')).toBeInTheDocument();
    });

    // Should show validation error
    expect(screen.getByTestId('timing-error')).toBeInTheDocument();
  });

  it('should handle subtitle duration validation', async () => {
    const mockOnSubtitlesChange = jest.fn();
    render(<SubtitleEditor {...defaultProps} onSubtitlesChange={mockOnSubtitlesChange} />);

    // Set very short duration (should show warning)
    const endTimeInput = screen.getByTestId('end-time-subtitle-1');
    fireEvent.change(endTimeInput, { target: { value: '0.5' } });

    await waitFor(() => {
      expect(screen.getByText('Subtitle duration too short (min: 1.0s)')).toBeInTheDocument();
    });
  });

  it('should add new subtitles', async () => {
    const mockOnSubtitlesChange = jest.fn();
    render(<SubtitleEditor {...defaultProps} onSubtitlesChange={mockOnSubtitlesChange} />);

    // Click add subtitle button
    const addButton = screen.getByTestId('add-subtitle');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockOnSubtitlesChange).toHaveBeenCalledTimes(1);
    });

    const updatedSubtitles = mockOnSubtitlesChange.mock.calls[0][0];
    expect(updatedSubtitles).toHaveLength(4); // Original 3 + 1 new

    // New subtitle should be added at the end
    const newSubtitle = updatedSubtitles[3];
    expect(newSubtitle.start).toBe(10.5);
    expect(newSubtitle.end).toBe(13.5);
    expect(newSubtitle.text).toBe('');
  });

  it('should delete subtitles', async () => {
    const mockOnSubtitlesChange = jest.fn();
    render(<SubtitleEditor {...defaultProps} onSubtitlesChange={mockOnSubtitlesChange} />);

    // Find delete button for second subtitle
    const deleteButton = screen.getByTestId('delete-subtitle-2');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockOnSubtitlesChange).toHaveBeenCalledTimes(1);
    });

    const updatedSubtitles = mockOnSubtitlesChange.mock.calls[0][0];
    expect(updatedSubtitles).toHaveLength(2); // Original 3 - 1 deleted

    // Second subtitle should be removed
    const remainingTexts = updatedSubtitles.map(s => s.text);
    expect(remainingTexts).not.toContain('Today we will discuss the future of AI');
  });

  it('should export subtitles in SRT format', async () => {
    const mockOnSubtitlesChange = jest.fn();
    render(<SubtitleEditor {...defaultProps} onSubtitlesChange={mockOnSubtitlesChange} />);

    // Click export SRT button
    const exportButton = screen.getByTestId('export-srt');
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('Subtitles exported to SRT format')).toBeInTheDocument();
    });
  });

  it('should export subtitles in VTT format', async () => {
    const mockOnSubtitlesChange = jest.fn();
    render(<SubtitleEditor {...defaultProps} onSubtitlesChange={mockOnSubtitlesChange} />);

    // Click export VTT button
    const exportButton = screen.getByTestId('export-vtt');
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('Subtitles exported to VTT format')).toBeInTheDocument();
    });
  });

  it('should handle auto-fix for subtitle timing', async () => {
    // Create subtitles with timing issues
    const problematicSubtitles = [
      { id: 'subtitle-1', start: 0.0, end: 2.0, text: 'Too short', validated: false },
      { id: 'subtitle-2', start: 1.5, end: 4.0, text: 'Overlaps with previous', validated: false },
    ];

    const mockOnSubtitlesChange = jest.fn();
    render(
      <SubtitleEditor
        {...defaultProps}
        subtitles={problematicSubtitles}
        onSubtitlesChange={mockOnSubtitlesChange}
      />
    );

    // Click auto-fix button
    const autoFixButton = screen.getByTestId('auto-fix-timing');
    fireEvent.click(autoFixButton);

    await waitFor(() => {
      expect(mockOnSubtitlesChange).toHaveBeenCalledTimes(1);
    });

    const fixedSubtitles = mockOnSubtitlesChange.mock.calls[0][0];

    // Check that timing issues were resolved
    expect(fixedSubtitles[0].end - fixedSubtitles[0].start).toBeGreaterThanOrEqual(1.0);
    expect(fixedSubtitles[1].start).toBeGreaterThanOrEqual(fixedSubtitles[0].end);
  });

  it('should display timeline visualization', () => {
    render(<SubtitleEditor {...defaultProps} />);

    // Timeline should be visible
    expect(screen.getByTestId('subtitle-timeline')).toBeInTheDocument();

    // Subtitle blocks should be visible on timeline
    const timelineBlocks = screen.getAllByTestId('timeline-block');
    expect(timelineBlocks).toHaveLength(3);
  });

  it('should handle zoom controls for timeline', async () => {
    render(<SubtitleEditor {...defaultProps} />);

    // Zoom in
    const zoomInButton = screen.getByTestId('zoom-in');
    fireEvent.click(zoomInButton);

    await waitFor(() => {
      expect(screen.getByTestId('timeline-scale')).toHaveTextContent('200%');
    });

    // Zoom out
    const zoomOutButton = screen.getByTestId('zoom-out');
    fireEvent.click(zoomOutButton);

    await waitFor(() => {
      expect(screen.getByTestId('timeline-scale')).toHaveTextContent('100%');
    });
  });

  it('should handle subtitle search and filtering', async () => {
    render(<SubtitleEditor {...defaultProps} />);

    // Type in search box
    const searchInput = screen.getByTestId('subtitle-search');
    fireEvent.change(searchInput, { target: { value: 'presentation' } });

    await waitFor(() => {
      // Should show only subtitles containing "presentation"
      expect(screen.getByText('Welcome to this presentation')).toBeInTheDocument();
      expect(screen.queryByText('Today we will discuss the future of AI')).not.toBeInTheDocument();
    });
  });

  it('should show character count and reading time', () => {
    render(<SubtitleEditor {...defaultProps} />);

    // Character count should be displayed
    expect(screen.getByTestId('character-count')).toBeInTheDocument();

    // Estimated reading time should be displayed
    expect(screen.getByTestId('reading-time')).toBeInTheDocument();
  });

  it('should handle keyboard shortcuts for subtitle navigation', () => {
    render(<SubtitleEditor {...defaultProps} />);

    // Test arrow key navigation
    const firstSubtitle = screen.getByTestId('subtitle-1');
    firstSubtitle.focus();

    fireEvent.keyDown(firstSubtitle, { key: 'ArrowDown' });

    // Should select next subtitle
    expect(screen.getByTestId('subtitle-2')).toHaveFocus();

    // Test up arrow
    fireEvent.keyDown(screen.getByTestId('subtitle-2'), { key: 'ArrowUp' });

    // Should select previous subtitle
    expect(screen.getByTestId('subtitle-1')).toHaveFocus();
  });
});