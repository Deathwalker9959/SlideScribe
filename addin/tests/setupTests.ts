/**
 * Test Setup for Frontend Testing
 * Configures testing environment for Office Add-in components
 */

import '@testing-library/jest-dom';

// Mock Office.js
const mockOffice = {
  context: {
    document: {
      settings: {
        set: jest.fn(),
        get: jest.fn(),
      },
    },
    contentLanguage: 'en-US',
    displayLanguage: 'en-US',
  },
  HostType: {
    PowerPoint: 'PowerPoint',
    Excel: 'Excel',
    Word: 'Word',
    Outlook: 'Outlook',
  },
  onReady: jest.fn(),
  addin: {
    initialize: jest.fn(),
  },
};

// Mock PowerPoint API
const mockPowerPoint = {
  run: jest.fn((callback) => {
    const context = {
      presentation: {
        slides: {
          items: [],
          load: jest.fn(),
          getCount: jest.fn().mockResolvedValue(0),
        },
        title: 'Test Presentation',
      },
      sync: jest.fn().mockResolvedValue(undefined),
    };
    return callback(context);
  }),
};

// Set up global mocks
(global as any).Office = mockOffice;
(global as any).PowerPoint = mockPowerPoint;

// Mock WebSocket
(global as any).WebSocket = jest.fn(() => ({
  send: jest.fn(),
  close: jest.fn(),
  readyState: WebSocket.OPEN,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

// Mock fetch API
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true }),
    status: 200,
  })
) as jest.Mock;

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-url');
global.URL.revokeObjectURL = jest.fn();

// Mock Blob
(global as any).Blob = jest.fn(() => ({}));

// Mock File and FileReader
(global as any).File = jest.fn(() => ({}));
(global as any).FileReader = jest.fn(() => ({
  readAsDataURL: jest.fn(),
  readAsText: jest.fn(),
  onload: jest.fn(),
  result: 'mock-file-content',
}));

// Mock window.matchMedia for responsive testing
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver
(global as any).ResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
(global as any).IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock console methods for cleaner test output
global.console = {
  ...global.console,
  warn: jest.fn(),
  error: jest.fn(),
};

// Set up test environment variables
process.env.NODE_ENV = 'test';

// Mock CSS imports and styling
jest.mock('*.scss', () => ({}));
jest.mock('*.css', () => ({}));

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
  useParams: () => ({}),
  useLocation: () => ({
    pathname: '/',
    search: '',
    hash: '',
    state: null,
  }),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Globe: () => <div data-testid="globe-icon">Globe</div>,
  Play: () => <div data-testid="play-icon">Play</div>,
  Settings: () => <div data-testid="settings-icon">Settings</div>,
  FileText: () => <div data-testid="file-text-icon">FileText</div>,
  Bug: () => <div data-testid="bug-icon">Bug</div>,
  BarChart3: () => <div data-testid="bar-chart-icon">BarChart</div>,
  Loader2: () => <div data-testid="loader-icon">Loader</div>,
  AlertTriangle: () => <div data-testid="alert-icon">Alert</div>,
  CheckCircle: () => <div data-testid="check-icon">Check</div>,
  RefreshCw: () => <div data-testid="refresh-icon">Refresh</div>,
  Home: () => <div data-testid="home-icon">Home</div>,
}));

// Error boundary testing utilities
export const createError = (message: string, code?: string) => {
  const error = new Error(message);
  if (code) {
    (error as any).code = code;
  }
  return error;
};

// Test utilities for Office.js interactions
export const createMockPowerPointContext = (slideCount: number = 3) => ({
  presentation: {
    slides: {
      items: Array.from({ length: slideCount }, (_, i) => ({
        id: `slide-${i + 1}`,
        title: `Slide ${i + 1}`,
        shapes: {
          items: [],
          load: jest.fn(),
        },
      })),
      load: jest.fn(),
      getCount: jest.fn().mockResolvedValue(slideCount),
    },
  },
  sync: jest.fn().mockResolvedValue(undefined),
});

// WebSocket test utilities
export const createMockWebSocket = () => {
  const callbacks: Record<string, Function[]> = {};
  return {
    send: jest.fn(),
    close: jest.fn(),
    readyState: WebSocket.OPEN,
    addEventListener: jest.fn((event: string, callback: Function) => {
      callbacks[event] = callbacks[event] || [];
      callbacks[event].push(callback);
    }),
    removeEventListener: jest.fn((event: string, callback: Function) => {
      if (callbacks[event]) {
        callbacks[event] = callbacks[event].filter(cb => cb !== callback);
      }
    }),
    // Test helper to trigger events
    triggerEvent: (event: string, data?: any) => {
      if (callbacks[event]) {
        callbacks[event].forEach(callback => callback(data));
      }
    },
  };
};

// Animation test utilities
export const waitForAnimation = (ms: number = 100) =>
  new Promise(resolve => setTimeout(resolve, ms));

// Mock performance API
Object.defineProperty(window, 'performance', {
  writable: true,
  value: {
    now: jest.fn(() => Date.now()),
    mark: jest.fn(),
    measure: jest.fn(),
    getEntriesByName: jest.fn(() => []),
  },
});

// Test timeout handling
jest.setTimeout(10000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

export default {};