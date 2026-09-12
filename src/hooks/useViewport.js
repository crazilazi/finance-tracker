import { useEffect, useState } from 'react';

/**
 * Breakpoint contract for the whole app (keep in sync with src/index.css):
 *   mobile   < 768   sidebar in drawer, single column, icon-only buttons
 *   tablet   768–1023 collapsed 72px sidebar, 1–2 columns
 *   laptop   1024–1439
 *   desktop  ≥ 1440
 *
 * `isCompact` (< 1100) is used by the top bar, whose control cluster needs
 * more room than the sidebar leaves on tablets and small laptops.
 */
export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  compact: 1100,
  desktop: 1440,
};

const DEFAULT_WIDTH = 1440;

export default function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? DEFAULT_WIDTH : window.innerWidth
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return {
    width,
    isMobile: width < BREAKPOINTS.mobile,
    isTablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet,
    isCompact: width < BREAKPOINTS.compact,
    isDesktop: width >= BREAKPOINTS.tablet,
  };
}
