import React, { useState, useEffect } from 'react';
import { Button } from '@ui/button';
import { Input } from '@ui/input';
import { Label } from '@ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/card';
import { Alert, AlertDescription } from '@ui/alert';
import { Loader2, LogIn, LogOut, User, Shield, ShieldCheck } from 'lucide-react';
import { apiClient, LoginRequest } from '@utils/apiClient';

interface AuthPanelProps {
  onAuthChange?: (isAuthenticated: boolean) => void;
  className?: string;
}

export function AuthPanel({ onAuthChange, className }: AuthPanelProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loginForm, setLoginForm] = useState<LoginRequest>({
    username: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      if (apiClient.isAuthenticated()) {
        const user = await apiClient.getCurrentUser();
        setCurrentUser(user);
        setIsAuthenticated(true);
        onAuthChange?.(true);
      }
    } catch (error) {
      console.log('Not authenticated:', error);
      setIsAuthenticated(false);
      setCurrentUser(null);
      onAuthChange?.(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.login(loginForm);
      setCurrentUser(response.user);
      setIsAuthenticated(true);
      setShowLogin(false);
      setLoginForm({ username: '', password: '' });
      onAuthChange?.(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await apiClient.logout();
      setCurrentUser(null);
      setIsAuthenticated(false);
      onAuthChange?.(false);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof LoginRequest) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setLoginForm(prev => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  if (isAuthenticated && currentUser) {
    return (
      <div className={`auth-panel auth-panel--authenticated ${className || ''}`}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <CardTitle className="text-lg">Authenticated</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Logout
              </Button>
            </div>
            <CardDescription>
              Connected as <span className="font-medium">{currentUser.username}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>User ID: {currentUser.id}</span>
            </div>
            {currentUser.email && (
              <div className="flex items-center space-x-2 text-sm text-muted-foreground mt-1">
                <span>Email: {currentUser.email}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showLogin) {
    return (
      <div className={`auth-panel auth-panel--login ${className || ''}`}>
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Authentication Required</CardTitle>
            </div>
            <CardDescription>
              Please login to access SlideScribe features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={loginForm.username}
                  onChange={handleInputChange('username')}
                  placeholder="Enter your username"
                  required
                  disabled={isLoading}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={loginForm.password}
                  onChange={handleInputChange('password')}
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                />
              </div>
              
              <div className="flex space-x-2">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4 mr-2" />
                      Login
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowLogin(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`auth-panel auth-panel--prompt ${className || ''}`}>
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Authentication Required</CardTitle>
          </div>
          <CardDescription>
            Login to access SlideScribe narration features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => setShowLogin(true)}
            className="w-full"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Login to SlideScribe
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// For development/demo purposes - auto-login with test credentials
export function DevAuthPanel({ onAuthChange, className }: AuthPanelProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleAutoLogin = async () => {
    setIsLoading(true);
    try {
      // Try to login with test credentials
      await apiClient.login({ username: 'testuser', password: 'testpass' });
      onAuthChange?.(true);
    } catch (error) {
      console.log('Auto-login failed, using mock auth for development');
      // For development, set a mock token
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('slidescribe_auth_token', 'dev_token');
      }
      onAuthChange?.(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`auth-panel auth-panel--dev ${className || ''}`}>
      <Card>
        <CardHeader>
          <CardTitle>Development Mode</CardTitle>
          <CardDescription>
            Quick access for development and testing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleAutoLogin}
            disabled={isLoading}
            className="w-full"
            variant="outline"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                Continue without Login
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}