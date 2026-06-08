import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext({
  isDark: false,
  toggleTheme: () => {},
  colors: {}
});

export const ThemeProvider = ({ children }) => {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemScheme === 'dark');

  useEffect(() => {
    AsyncStorage.getItem('theme').then((val) => {
      if (val === 'dark') setIsDark(true);
      else if (val === 'light') setIsDark(false);
    });
  }, []);

  const toggleTheme = async () => {
    const next = !isDark;
    setIsDark(next);
    await AsyncStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const colors = isDark ? {
    bg: '#0A0A0A',
    card: '#1A1A1A',
    text: '#F2F2F2',
    textSecondary: '#999999',
    accent: '#FFFFFF',
    danger: '#FF5252',
    border: '#333333',
  } : {
    bg: '#F2F2F2',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#666666',
    accent: '#000000',
    danger: '#C62828',
    border: '#E5E5E5',
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);