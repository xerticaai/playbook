import { useState, useEffect, useCallback } from 'react'

export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('xsales_theme') as 'dark' | 'light') || 'dark'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('xsales_theme', theme)
  }, [theme])

  const toggle = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), [])

  return { theme, toggle }
}
