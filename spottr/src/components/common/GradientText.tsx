import { type FC, type ReactNode } from 'react';

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4';

interface GradientTextProps {
  children: ReactNode;
  as?: HeadingLevel | 'p' | 'span';
  className?: string;
  /** Font weight. Default: 'extrabold'. */
  weight?:
    | 'normal'
    | 'medium'
    | 'semibold'
    | 'bold'
    | 'extrabold'
    | 'black';
}

const weightMap: Record<NonNullable<GradientTextProps['weight']>, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
  extrabold: 'font-extrabold',
  black: 'font-black',
};

/**
 * Gradient text using Playfair Display with the signature
 * white→sky-blue→purple gradient.
 */
const GradientText: FC<GradientTextProps> = ({
  children,
  as: Tag = 'span',
  className = '',
  weight = 'extrabold',
}) => (
  <Tag
    className={[
      'gradient-text',
      weightMap[weight],
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    style={{ fontFamily: "'Playfair Display', serif" }}
  >
    {children}
  </Tag>
);

export default GradientText;
