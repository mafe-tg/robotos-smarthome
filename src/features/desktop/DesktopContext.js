import { createContext, useContext } from 'react';

/**
 * Acciones del escritorio que las apps pueden usar:
 * openApp, closeApp, restart, shutdown, switchUser, notify, prefs, setPrefs, windows.
 */
export const DesktopContext = createContext(null);

export const useDesktop = () => useContext(DesktopContext) || {};
