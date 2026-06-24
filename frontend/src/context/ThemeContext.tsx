import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

// -- Types ----------------------------------------------------------------
type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

// -- ECharts theme color objects ------------------------------------------
// Dark palette (Huawei NOC deep navy)
const ECHARTS_DARK = {
  palette: [
    '#5470C6', '#91CC75', '#FAC858', '#EE6666', '#73C0DE',
    '#3BA272', '#FC8452', '#9A60B4', '#EA7CCC',
  ],
  tooltipBg:     '#151E32',
  tooltipBorder: '#2A3441',
  tooltipText:   '#F1F5F9',
  axisLine:      '#2A3441',
  axisLabel:     '#94A3B8',
  splitLine:     '#2A3441',
  legendText:    '#94A3B8',
  axisPointer:   '#3B82F630',
};

// Light palette (Huawei iMaster NCE blue-white)
const ECHARTS_LIGHT = {
  palette: [
    '#1890FF', '#2FC25B', '#FACC14', '#F04864', '#13C2C2',
    '#66B2FF', '#FF7A45', '#9270CA', '#EB2F96',
  ],
  tooltipBg:     '#FFFFFF',
  tooltipBorder: '#E5E6EB',
  tooltipText:   '#1D2129',
  axisLine:      '#E5E6EB',
  axisLabel:     '#86909C',
  splitLine:     '#E5E6EB',
  legendText:    '#86909C',
  axisPointer:   '#1890FF30',
};

// -- Topology theme color objects -----------------------------------------
const TOPOLOGY_DARK = {
  domain: {
    cp:     '#2563EB',
    sp:     '#6366F1',
    up:     '#059669',
    dm:     '#8B5CF6',
    legacy: '#64748B',
  },
  nodeBgRunning:  '#1E293B',
  nodeBgStopped:  '#171717',
  stoppedBorder:  '#DC2626',
  labelColor:     '#FFFFFF',
  labelBorder:    '#0e1520',
  linkActive:     '#475569',
  linkIdle:       '#334155',
  linkLabelBg:    '#1E293B',
  linkLabelText:  '#FFFFFF',
  tooltipBg:      'rgba(21,30,50,0.95)',
  tooltipBorder:  '#2a3a4a',
  tooltipText:    '#F1F5F9',
  statusRunning:  '#4caf50',
  statusStopped:  '#ef5350',
  mutedText:      '#6b7280',
};

const TOPOLOGY_LIGHT = {
  domain: {
    cp:     '#1890FF',
    sp:     '#722ED1',
    up:     '#13C2C2',
    dm:     '#9270CA',
    legacy: '#86909C',
  },
  nodeBgRunning:  '#FFFFFF',
  nodeBgStopped:  '#F2F3F5',
  stoppedBorder:  '#F53F3F',
  labelColor:     '#1D2129',
  labelBorder:    '#FFFFFF',
  linkActive:     '#C9CDD4',
  linkIdle:       '#E5E6EB',
  linkLabelBg:    '#FFFFFF',
  linkLabelText:  '#4E5969',
  tooltipBg:      'rgba(255,255,255,0.96)',
  tooltipBorder:  '#E5E6EB',
  tooltipText:    '#1D2129',
  statusRunning:  '#00B42A',
  statusStopped:  '#F53F3F',
  mutedText:      '#86909C',
};

// -- Context --------------------------------------------------------------
const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'xcloud_theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Sync data-theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// -- Hooks ----------------------------------------------------------------
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

/** Returns ECharts chart config colors for the current theme */
export function useEChartsTheme() {
  const { theme } = useTheme();
  return theme === 'dark' ? ECHARTS_DARK : ECHARTS_LIGHT;
}

/** Returns Topology-specific colors for the current theme */
export function useTopologyTheme() {
  const { theme } = useTheme();
  return theme === 'dark' ? TOPOLOGY_DARK : TOPOLOGY_LIGHT;
}
