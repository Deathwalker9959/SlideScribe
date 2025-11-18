/**
 * Theme Service Unit Tests
 * Tests PowerPoint theme detection and management
 */

import { PowerPointThemeService, ThemeServiceFactory } from '../../../src/taskpane/services/utility/ThemeService';

// Mock window and document
Object.defineProperty(window, 'getComputedStyle', {
  value: jest.fn(),
  writable: true,
});

Object.defineProperty(document, 'body', {
  value: {
    className: '',
    getAttribute: jest.fn(),
    setAttribute: jest.fn(),
  },
  writable: true,
});

Object.defineProperty(document, 'documentElement', {
  value: {
    style: {},
  },
  writable: true,
});

Object.defineProperty(document, 'querySelector', {
  value: jest.fn(),
  writable: true,
});

Object.defineProperty(window, 'matchMedia', {
  value: jest.fn(),
  writable: true,
});

Object.defineProperty(global, 'MutationObserver', {
  value: jest.fn().mockImplementation((callback) => ({
    observe: jest.fn(),
    disconnect: jest.fn(),
  })),
  writable: true,
});

describe('ThemeService', () => {
  let themeService: PowerPointThemeService;

  beforeEach(() => {
    jest.clearAllMocks();
    themeService = new PowerPointThemeService();
  });

  afterEach(() => {
    themeService.destroy();
  });

  describe('Theme Detection', () => {
    test('detects light theme from computed background color', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({
        backgroundColor: '#FFFFFF',
        color: '#000000',
      });

      const theme = await themeService.detectPowerPointTheme();

      expect(theme.mode).toBe('light');
      expect(theme.colors.background).toBe('#FFFFFF');
      expect(theme.colors.text).toBe('#2D2D30');
    });

    test('detects dark theme from computed background color', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({
        backgroundColor: '#2D2D30',
        color: '#FFFFFF',
      });

      const theme = await themeService.detectPowerPointTheme();

      expect(theme.mode).toBe('dark');
      expect(theme.colors.background).toBe('#2D2D30');
      expect(theme.colors.text).toBe('#FFFFFF');
    });

    test('detects theme from body class', async () => {
      document.body.className = 'office-theme-dark theme-dark';

      const theme = await themeService.detectPowerPointTheme();

      expect(theme.mode).toBe('dark');
    });

    test('detects light theme from body class', async () => {
      document.body.className = 'office-theme-light theme-light';

      const theme = await themeService.detectPowerPointTheme();

      expect(theme.mode).toBe('light');
    });

    test('detects theme from data-office-theme attribute', async () => {
      const mockGetAttribute = document.body.getAttribute as jest.Mock;
      mockGetAttribute.mockReturnValue('dark');

      const theme = await themeService.detectPowerPointTheme();

      expect(theme.mode).toBe('dark');
    });

    test('detects theme from PowerPoint application element', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle
        .mockReturnValueOnce({ backgroundColor: 'transparent' }) // body
        .mockReturnValueOnce({ backgroundColor: '#1E1E1E' }); // PowerPoint element

      const mockQuerySelector = document.querySelector as jest.Mock;
      mockQuerySelector.mockReturnValue({
        getAttribute: jest.fn().mockReturnValue('powerpoint'),
      });

      const theme = await themeService.detectPowerPointTheme();

      expect(theme.mode).toBe('dark');
    });

    test('falls back to system preference', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({ backgroundColor: 'transparent' });

      const mockMatchMedia = window.matchMedia as jest.Mock;
      mockMatchMedia.mockReturnValue({ matches: true });

      const theme = await themeService.detectPowerPointTheme();

      expect(theme.mode).toBe('dark');
    });

    test('defaults to light theme when detection fails', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({ backgroundColor: 'transparent' });

      const mockMatchMedia = window.matchMedia as jest.Mock;
      mockMatchMedia.mockReturnValue({ matches: false });

      const theme = await themeService.detectPowerPointTheme();

      expect(theme.mode).toBe('light');
    });
  });

  describe('Color Calculation', () => {
    test('calculates luminance for light colors correctly', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({
        backgroundColor: '#FFFFFF',
      });

      await themeService.detectPowerPointTheme();
      expect(themeService.isDarkTheme()).toBe(false);
    });

    test('calculates luminance for dark colors correctly', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({
        backgroundColor: '#000000',
      });

      await themeService.detectPowerPointTheme();
      expect(themeService.isDarkTheme()).toBe(true);
    });

    test('handles RGB color format', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({
        backgroundColor: 'rgb(255, 255, 255)',
      });

      await themeService.detectPowerPointTheme();
      expect(themeService.isDarkTheme()).toBe(false);
    });

    test('handles hex color format', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({
        backgroundColor: '#2D2D30',
      });

      await themeService.detectPowerPointTheme();
      expect(themeService.isDarkTheme()).toBe(true);
    });

    test('handles short hex color format', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({
        backgroundColor: '#FFF',
      });

      await themeService.detectPowerPointTheme();
      expect(themeService.isDarkTheme()).toBe(false);
    });
  });

  describe('Theme Colors', () => {
    test('provides correct light theme colors', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({
        backgroundColor: '#FFFFFF',
      });

      const theme = await themeService.detectPowerPointTheme();

      expect(theme.colors.background).toBe('#FFFFFF');
      expect(theme.colors.surface).toBe('#F1F3F4');
      expect(theme.colors.border).toBe('#D1D1D1');
      expect(theme.colors.text).toBe('#2D2D30');
      expect(theme.colors.primary).toBe('#0078D4');
      expect(theme.colors.primaryHover).toBe('#106EBE');
    });

    test('provides correct dark theme colors', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({
        backgroundColor: '#2D2D30',
      });

      const theme = await themeService.detectPowerPointTheme();

      expect(theme.colors.background).toBe('#2D2D30');
      expect(theme.colors.surface).toBe('#3E3E42');
      expect(theme.colors.border).toBe('#4D4D50');
      expect(theme.colors.text).toBe('#FFFFFF');
      expect(theme.colors.primary).toBe('#4080FF');
      expect(theme.colors.primaryHover).toBe('#5A9CFF');
    });
  });

  describe('Theme Management', () => {
    test('gets current theme', () => {
      const theme = themeService.getCurrentTheme();
      expect(theme).toHaveProperty('mode');
      expect(theme).toHaveProperty('colors');
      expect(theme.colors).toHaveProperty('background');
      expect(theme.colors).toHaveProperty('text');
    });

    test('sets theme mode', () => {
      themeService.setTheme({ mode: 'dark' });
      expect(themeService.getCurrentTheme().mode).toBe('dark');
    });

    test('sets theme colors', () => {
      const customColors = {
        primary: '#FF0000',
        background: '#00FF00',
      };

      themeService.setTheme({ colors: customColors });
      const theme = themeService.getCurrentTheme();

      expect(theme.colors.primary).toBe('#FF0000');
      expect(theme.colors.background).toBe('#00FF00');
      expect(theme.colors.text).not.toBe('#FF0000'); // Should not affect other colors
    });

    test('partially updates theme colors', () => {
      const originalTheme = themeService.getCurrentTheme();
      const originalBorder = originalTheme.colors.border;

      themeService.setTheme({
        colors: { primary: '#FF0000' }
      });

      const updatedTheme = themeService.getCurrentTheme();
      expect(updatedTheme.colors.primary).toBe('#FF0000');
      expect(updatedTheme.colors.border).toBe(originalBorder); // Should preserve existing color
    });
  });

  describe('Event System', () => {
    test('subscribes to theme changes', () => {
      const callback = jest.fn();
      const unsubscribe = themeService.subscribeToThemeChanges(callback);

      expect(callback).toHaveBeenCalledWith(themeService.getCurrentTheme());

      themeService.setTheme({ mode: 'dark' });
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({ mode: 'dark' })
      );

      unsubscribe();

      themeService.setTheme({ mode: 'light' });
      expect(callback).toHaveBeenCalledTimes(2); // Should not be called again
    });

    test('handles multiple subscribers', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      themeService.subscribeToThemeChanges(callback1);
      themeService.subscribeToThemeChanges(callback2);
      themeService.subscribeToThemeChanges(callback3);

      themeService.setTheme({ mode: 'dark' });

      expect(callback1).toHaveBeenCalledTimes(2);
      expect(callback2).toHaveBeenCalledTimes(2);
      expect(callback3).toHaveBeenCalledTimes(2);
    });

    test('handles callback errors gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      const normalCallback = jest.fn();

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      themeService.subscribeToThemeChanges(errorCallback);
      themeService.subscribeToThemeChanges(normalCallback);

      // Should not throw due to error callback
      expect(() => {
        themeService.setTheme({ mode: 'dark' });
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in theme change callback:',
        expect.any(Error)
      );

      // Normal callback should still be called
      expect(normalCallback).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });
  });

  describe('System Preference Detection', () => {
    test('detects dark system preference', () => {
      const mockMatchMedia = window.matchMedia as jest.Mock;
      mockMatchMedia.mockReturnValue({ matches: true });

      const preference = themeService.getSystemPreference();
      expect(preference).toBe('dark');
    });

    test('detects light system preference', () => {
      const mockMatchMedia = window.matchMedia as jest.Mock;
      mockMatchMedia.mockReturnValue({ matches: false });

      // Mock light mode query
      mockMatchMedia
        .mockReturnValueOnce({ matches: false }) // dark query
        .mockReturnValueOnce({ matches: true });  // light query

      const preference = themeService.getSystemPreference();
      expect(preference).toBe('light');
    });

    test('detects no system preference', () => {
      const mockMatchMedia = window.matchMedia as jest.Mock;
      mockMatchMedia.mockReturnValue({ matches: false });

      const preference = themeService.getSystemPreference();
      expect(preference).toBe('no-preference');
    });
  });

  describe('Utility Methods', () => {
    test('isDarkTheme returns correct state', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({
        backgroundColor: '#FFFFFF',
      });

      await themeService.detectPowerPointTheme();
      expect(themeService.isDarkTheme()).toBe(false);

      mockComputedStyle.mockReturnValue({
        backgroundColor: '#000000',
      });

      await themeService.detectPowerPointTheme();
      expect(themeService.isDarkTheme()).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('handles undefined document', async () => {
      const originalDocument = global.document;
      delete (global as any).document;

      const service = new PowerPointThemeService();
      const theme = await service.detectPowerPointTheme();

      expect(theme.mode).toBe('light');

      global.document = originalDocument;
    });

    test('handles getComputedStyle errors', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockImplementation(() => {
        throw new Error('CSS computation error');
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const theme = await themeService.detectPowerPointTheme();

      expect(theme.mode).toBe('light');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to detect PowerPoint theme:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('handles invalid color formats', async () => {
      const mockComputedStyle = window.getComputedStyle as jest.Mock;
      mockComputedStyle.mockReturnValue({
        backgroundColor: 'invalid-color',
      });

      await themeService.detectPowerPointTheme();
      expect(themeService.isDarkTheme()).toBe(false); // Default to light
    });
  });

  describe('Factory', () => {
    test('creates service instance', () => {
      const service = ThemeServiceFactory.create();
      expect(service).toBeInstanceOf(PowerPointThemeService);
    });

    test('returns singleton instance', () => {
      const service1 = ThemeServiceFactory.getInstance();
      const service2 = ThemeServiceFactory.getInstance();
      expect(service1).toBe(service2);
    });
  });

  describe('Cleanup', () => {
    test('destroys resources properly', () => {
      const callback = jest.fn();
      themeService.subscribeToThemeChanges(callback);

      expect(callback).toHaveBeenCalledTimes(1);

      themeService.destroy();

      // Should be able to call destroy multiple times
      expect(() => themeService.destroy()).not.toThrow();
    });
  });
});