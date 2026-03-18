import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

type UserRole = 'admin' | 'employee';

interface CompanySettings {
  sells_products: boolean;
  sells_services: boolean;
  has_stock: boolean;
  has_logistics: boolean;
  uses_meta_ads: boolean;
  uses_google_ads: boolean;
  onboarding_completed: boolean;
  onboarding_completion_pct: number;
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  profile: { full_name: string; company_id: string } | null;
  companySettings: CompanySettings | null;
  companyName: string;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  profile: null,
  companySettings: null,
  companyName: '',
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [profile, setProfile] = useState<{ full_name: string; company_id: string } | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();
      
      if (roleData) setRole(roleData.role as UserRole);

      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, company_id')
        .eq('id', userId)
        .single();
      
      if (profileData) {
        setProfile(profileData as { full_name: string; company_id: string });

        // Fetch company name
        if (profileData.company_id) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('name')
            .eq('id', profileData.company_id)
            .single();
          if (companyData) setCompanyName(companyData.name);

          // Fetch company settings
          const { data: settingsData } = await supabase
            .from('company_settings')
            .select('*')
            .eq('company_id', profileData.company_id)
            .single();
          if (settingsData) setCompanySettings(settingsData as unknown as CompanySettings);
        }
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setRole(null);
          setProfile(null);
          setCompanySettings(null);
          setCompanyName('');
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user) await fetchUserData(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, profile, companySettings, companyName, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
