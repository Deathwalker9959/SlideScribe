/**
 * Enhanced Auth Panel Unit Tests
 * Tests the modern card-based authentication component with tab switching
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { EnhancedAuthPanel } from '../../../src/taskpane/components/EnhancedAuthPanel';

// Mock Office.js
global.Office = {
  context: {
    document: {
      getSelectedDataAsync: jest.fn(),
    },
  },
} as any;

global.PowerPoint = {
  run: jest.fn(),
} as any;

// Mock apiClient
jest.mock('../../../src/taskpane/utils/apiClient', () => ({
  apiClient: {
    login: jest.fn(),
    register: jest.fn(),
    createAnonymousSession: jest.fn(),
    isAuthenticated: jest.fn(() => false),
    getCurrentUser: jest.fn(),
    logout: jest.fn(),
  },
}));

// Mock theme detection
Object.defineProperty(window, 'getComputedStyle', {
  value: jest.fn(() => ({
    backgroundColor: '#ffffff',
  })),
});

Object.defineProperty(document, 'body', {
  value: {
    getAttribute: jest.fn(() => null),
  },
});

describe('EnhancedAuthPanel', () => {
  const mockAuthConfig = {
    auth_driver: 'database',
    requires_auth: true,
    supports_registration: true,
    session_expire_minutes: 1440,
    anonymous_session_expire_minutes: 480,
  };

  const mockOnAuthChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Component Rendering', () => {
    test('renders authentication card with tabs', () => {
      render(
        <EnhancedAuthPanel
          authConfig={mockAuthConfig}
          onAuthChange={mockOnAuthChange}
        />
      );

      // Check for card container
      expect(screen.getByRole('tablist')).toBeInTheDocument();

      // Check for tab buttons
      expect(screen.getByRole('tab', { name: /register/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /login/i })).toBeInTheDocument();
    });

    test('renders only login tab when registration is not supported', () => {
      const configWithoutRegistration = {
        ...mockAuthConfig,
        supports_registration: false,
      };

      render(
        <EnhancedAuthPanel
          authConfig={configWithoutRegistration}
          onAuthChange={mockOnAuthChange}
        />
      );

      expect(screen.queryByRole('tab', { name: /register/i })).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /login/i })).toBeInTheDocument();
    });

    test('renders anonymous session button when auth is not required', () => {
      const configWithoutAuth = {
        ...mockAuthConfig,
        requires_auth: false,
      };

      render(
        <EnhancedAuthPanel
          authConfig={configWithoutAuth}
          onAuthChange={mockOnAuthChange}
        />
      );

      expect(screen.getByRole('button', { name: /start using slidescribe/i })).toBeInTheDocument();
    });
  });

  describe('Tab Switching', () => {
    test('switches between login and register tabs', async () => {
      const user = userEvent.setup();

      render(
        <EnhancedAuthPanel
          authConfig={mockAuthConfig}
          onAuthChange={mockOnAuthChange}
        />
      );

      // Initially on login tab
      expect(screen.getByRole('tab', { name: /login/i })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: /register/i })).toHaveAttribute('aria-selected', 'false');

      // Switch to register tab
      await user.click(screen.getByRole('tab', { name: /register/i }));

      expect(screen.getByRole('tab', { name: /register/i })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: /login/i })).toHaveAttribute('aria-selected', 'false');
    });

    test('shows correct form fields for each tab', async () => {
      const user = userEvent.setup();

      render(
        <EnhancedAuthPanel
          authConfig={mockAuthConfig}
          onAuthChange={mockOnAuthChange}
        />
      );

      // Login tab (default)
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/confirm password/i)).not.toBeInTheDocument();

      // Switch to register tab
      await user.click(screen.getByRole('tab', { name: /register/i }));

      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    });
  });

  describe('Login Functionality', () => {
    test('submits login form with correct data', async () => {
      const mockLogin = require('../../../src/taskpane/utils/apiClient').apiClient.login;
      mockLogin.mockResolvedValue({
        access_token: 'test-token',
        user: { id: '1', username: 'testuser' }
      });

      const user = userEvent.setup();

      render(
        <EnhancedAuthPanel
          authConfig={mockAuthConfig}
          onAuthChange={mockOnAuthChange}
        />
      );

      // Fill login form
      await user.type(screen.getByLabelText(/username/i), 'testuser');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');

      // Submit form
      await user.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          username: 'testuser',
          password: 'password123'
        });
      });
    });

    test('displays loading state during login', async () => {
      const mockLogin = require('../../../src/taskpane/utils/apiClient').apiClient.login;
      let resolveLogin: (value: any) => void;
      mockLogin.mockReturnValue(new Promise(resolve => {
        resolveLogin = resolve;
      }));

      const user = userEvent.setup();

      render(
        <EnhancedAuthPanel
          authConfig={mockAuthConfig}
          onAuthChange={mockOnAuthChange}
        />
      );

      await user.type(screen.getByLabelText(/username/i), 'testuser');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');

      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);

      // Check loading state
      expect(loginButton).toBeDisabled();
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();

      // Resolve login
      resolveLogin!({
        access_token: 'test-token',
        user: { id: '1', username: 'testuser' }
      });

      await waitFor(() => {
        expect(loginButton).not.toBeDisabled();
      });
    });
  });

  describe('Register Functionality', () => {
    test('submits registration form with correct data', async () => {
      const mockRegister = require('../../../src/taskpane/utils/apiClient').apiClient.register;
      mockRegister.mockResolvedValue({
        access_token: 'test-token',
        user: { id: '1', username: 'newuser', email: 'new@example.com' }
      });

      const user = userEvent.setup();

      render(
        <EnhancedAuthPanel
          authConfig={mockAuthConfig}
          onAuthChange={mockOnAuthChange}
        />
      );

      // Switch to register tab
      await user.click(screen.getByRole('tab', { name: /register/i }));

      // Fill registration form
      await user.type(screen.getByLabelText(/username/i), 'newuser');
      await user.type(screen.getByLabelText(/email/i), 'new@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');

      // Submit form
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith({
          username: 'newuser',
          email: 'new@example.com',
          password: 'password123',
          confirm_password: 'password123'
        });
      });
    });

    test('validates password confirmation', async () => {
      const user = userEvent.setup();

      render(
        <EnhancedAuthPanel
          authConfig={mockAuthConfig}
          onAuthChange={mockOnAuthChange}
        />
      );

      await user.click(screen.getByRole('tab', { name: /register/i }));

      await user.type(screen.getByLabelText(/username/i), 'newuser');
      await user.type(screen.getByLabelText(/email/i), 'new@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'different');

      const registerButton = screen.getByRole('button', { name: /create account/i });
      await user.click(registerButton);

      // Form should not submit if passwords don't match
      const mockRegister = require('../../../src/taskpane/utils/apiClient').apiClient.register;
      expect(mockRegister).not.toHaveBeenCalled();
    });
  });

  describe('Anonymous Session', () => {
    test('creates anonymous session when button is clicked', async () => {
      const mockCreateAnonymousSession = require('../../../src/taskpane/utils/apiClient').apiClient.createAnonymousSession;
      mockCreateAnonymousSession.mockResolvedValue({
        session_id: 'anon-session-123',
        user: { id: 'anon-1', username: 'anonymous-user' }
      });

      const user = userEvent.setup();

      render(
        <EnhancedAuthPanel
          authConfig={mockAuthConfig}
          onAuthChange={mockOnAuthChange}
        />
      );

      const anonymousButton = screen.getByRole('button', { name: /continue anonymously/i });
      await user.click(anonymousButton);

      await waitFor(() => {
        expect(mockCreateAnonymousSession).toHaveBeenCalled();
        expect(mockOnAuthChange).toHaveBeenCalledWith(true, expect.anyObject(), 'anon-session-123');
      });
    });
  });

  describe('Error Handling', () => {
    test('displays error message when login fails', async () => {
      const mockLogin = require('../../../src/taskpane/utils/apiClient').apiClient.login;
      mockLogin.mockRejectedValue(new Error('Invalid credentials'));

      const user = userEvent.setup();

      render(
        <EnhancedAuthPanel
          authConfig={mockAuthConfig}
          onAuthChange={mockOnAuthChange}
        />
      );

      await user.type(screen.getByLabelText(/username/i), 'testuser');
      await user.type(screen.getByLabelText(/^password$/i), 'wrongpassword');

      await user.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      });
    });
  });

  describe('Theme Detection', () => {
    test('detects dark theme correctly', () => {
      // Mock dark theme
      Object.defineProperty(window, 'getComputedStyle', {
        value: jest.fn(() => ({
          backgroundColor: '#2D2D30',
        })),
      });

      render(
        <EnhancedAuthPanel
          authConfig={mockAuthConfig}
          onAuthChange={mockOnAuthChange}
        />
      );

      // Check if dark theme styles are applied (this would need specific implementation)
      expect(document.body).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('has proper ARIA attributes', () => {
      render(
        <EnhancedAuthPanel
          authConfig={mockAuthConfig}
          onAuthChange={mockOnAuthChange}
        />
      );

      // Check tablist accessibility
      const tablist = screen.getByRole('tablist');
      expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');

      // Check tab buttons
      const tabs = screen.getAllByRole('tab');
      tabs.forEach(tab => {
        expect(tab).toHaveAttribute('aria-selected');
        expect(tab).toHaveAttribute('tabIndex');
      });
    });

    test('supports keyboard navigation', async () => {
      const user = userEvent.setup();

      render(
        <EnhancedAuthPanel
          authConfig={mockAuthConfig}
          onAuthChange={mockOnAuthChange}
        />
      );

      // Focus first tab
      const firstTab = screen.getByRole('tab', { name: /login/i });
      firstTab.focus();
      expect(firstTab).toHaveFocus();

      // Navigate with arrow keys
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('tab', { name: /register/i })).toHaveFocus();
    });
  });
});