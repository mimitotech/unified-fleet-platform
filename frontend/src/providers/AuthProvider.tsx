import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, clearAuth, type User } from '@/lib/api';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ufp_token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    authApi.me().then(setUser).catch(() => clearAuth()).finally(() => setIsLoading(false));
  }, []);

  const signIn = async (email: string, password: string) => {
    const { token, user: u } = await authApi.login(email, password);
    localStorage.setItem('ufp_token', token);
    localStorage.setItem('ufp_role', u.role);
    setUser(u);
  };

  const signOut = () => {
    clearAuth();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
