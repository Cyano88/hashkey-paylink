(() => {
  try {
    const savedTheme = window.localStorage.getItem('hp_theme')
    const dark = savedTheme === 'dark'
      || (savedTheme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    root.style.colorScheme = dark ? 'dark' : 'light'
    const themeColor = document.querySelector('meta[name="theme-color"]')
    themeColor?.setAttribute('content', dark ? '#0A0A0A' : '#F5F5F7')
  } catch {
    // The React theme provider applies the same state when storage is unavailable.
  }
})()
