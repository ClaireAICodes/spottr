import { type FC } from 'react';
import GradientText from '../common/GradientText';

/**
 * Top header bar — app title "Spottr" in gradient Playfair Display.
 * Transparent glass, no subtitle, per features-screens.md spec.
 */
const Header: FC = () => (
  <header
    className="sticky top-0 z-40 px-4 sm:px-6 py-4"
    style={{
      background: 'rgba(15, 23, 42, 0.6)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    }}
  >
    <GradientText as="h1" weight="extrabold" className="text-2xl sm:text-3xl">
      Spottr
    </GradientText>
  </header>
);

export default Header;
