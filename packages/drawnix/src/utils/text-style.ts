import { CSSProperties } from 'react';

/**
 * Gradient stop for text gradient effect
 */
export interface GradientStop {
  offset: number;      // 0-1
  color: string;
}

/**
 * Shadow configuration for text shadow effect
 */
export interface TextShadowConfig {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

/**
 * Stroke configuration for text stroke effect
 */
export interface TextStrokeConfig {
  width: number;
  color: string;
}

/**
 * Gradient configuration for text gradient effect
 */
export interface TextGradientConfig {
  type: 'linear' | 'radial';
  angle?: number;      // 0-360, for linear gradient
  stops: GradientStop[];
}

/**
 * Text effect types
 */
export type TextEffectType = 'shadow' | 'gradient' | 'stroke' | 'glow';

/**
 * Complete text effect configuration
 */
export interface TextEffect {
  type: TextEffectType;
  shadow?: TextShadowConfig;
  gradient?: TextGradientConfig;
  stroke?: TextStrokeConfig;
  glow?: {
    blur: number;
    color: string;
  };
}

/**
 * Unified text style configuration
 */
export interface TextStyleConfig {
  fontSize: number;
  fontFamily?: string;
  fontWeight?: number | string;
  color?: string;           // 添加颜色支持
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  scale?: number;
  effects?: TextEffect[];
  // 新增排版属性
  lineHeight?: number | string;
  letterSpacing?: number | string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

/**
 * Default text style values
 */
export const DEFAULT_TEXT_STYLE: TextStyleConfig = {
  fontSize: 16,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontWeight: 400,
  color: '#000000',        // 默认黑色
  textAlign: 'left',
  scale: 1,
  effects: [],
  lineHeight: 1.5,
  letterSpacing: 0,
  textTransform: 'none',
  italic: false,
  underline: false,
  strike: false,
};

/**
 * Check if text has any effects
 */
export function hasTextEffects(style: TextStyleConfig): boolean {
  return !!(style.effects && style.effects.length > 0);
}

/**
 * Check if text has shadow effect
 */
export function hasShadowEffect(style: TextStyleConfig): boolean {
  return style.effects?.some(e => e.type === 'shadow') ?? false;
}

/**
 * Check if text has gradient effect
 */
export function hasGradientEffect(style: TextStyleConfig): boolean {
  return style.effects?.some(e => e.type === 'gradient') ?? false;
}

/**
 * Check if text has stroke effect
 */
export function hasStrokeEffect(style: TextStyleConfig): boolean {
  return style.effects?.some(e => e.type === 'stroke') ?? false;
}

/**
 * Check if text has glow effect
 */
export function hasGlowEffect(style: TextStyleConfig): boolean {
  return style.effects?.some(e => e.type === 'glow') ?? false;
}

/**
 * Get effective font size considering scale
 */
export function getEffectiveFontSize(style: TextStyleConfig): number {
  const fontSize = style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize;
  const scale = style.scale ?? 1;
  return fontSize * scale;
}

/**
 * Create default shadow effect
 */
export function createDefaultShadow(): TextShadowConfig {
  return {
    offsetX: 2,
    offsetY: 2,
    blur: 4,
    color: 'rgba(0, 0, 0, 0.5)',
  };
}

/**
 * Create default gradient effect
 */
export function createDefaultGradient(): TextGradientConfig {
  return {
    type: 'linear',
    angle: 90,
    stops: [
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: '#0000ff' },
    ],
  };
}

/**
 * Create default stroke effect
 */
export function createDefaultStroke(): TextStrokeConfig {
  return {
    width: 1,
    color: '#000000',
  };
}

/**
 * Get shadow effect from style config
 */
export function getShadowEffect(style: TextStyleConfig): TextShadowConfig | undefined {
  return style.effects?.find(e => e.type === 'shadow')?.shadow;
}

/**
 * Get gradient effect from style config
 */
export function getGradientEffect(style: TextStyleConfig): TextGradientConfig | undefined {
  return style.effects?.find(e => e.type === 'gradient')?.gradient;
}

/**
 * Get stroke effect from style config
 */
export function getStrokeEffect(style: TextStyleConfig): TextStrokeConfig | undefined {
  return style.effects?.find(e => e.type === 'stroke')?.stroke;
}

/**
 * Get glow effect from style config
 */
export function getGlowEffect(style: TextStyleConfig): TextEffect['glow'] | undefined {
  return style.effects?.find(e => e.type === 'glow')?.glow;
}

/**
 * Deep update a property in Slate text nodes (microscopic level)
 * Used to sync internal rich text children with external textStyle
 */
export function updateTextPropertyDeep(
  nodes: any[],
  propertyName: string,
  value: any
): any[] {
  return nodes.map(node => {
    if (node.text !== undefined) {
      // Handle both camelCase and kebab-case property names
      const updatedNode = { ...node };
      // Map common CSS properties
      const propertyMap: Record<string, string> = {
        fontSize: 'font-size',
        fontFamily: 'font-family',
        color: 'color',
        textAlign: 'text-align',
        lineHeight: 'line-height',
        letterSpacing: 'letter-spacing',
        fontWeight: 'font-weight',
        textTransform: 'text-transform',
      };
      const kebabKey = propertyMap[propertyName] || propertyName;
      updatedNode[kebabKey] = value;
      if (propertyName !== kebabKey) {
        updatedNode[propertyName] = value;
      }
      // Special handling for boolean style marks
      if (propertyName === 'italic') {
        updatedNode.italic = value;
      } else if (propertyName === 'underline') {
        updatedNode.underlined = value;
      } else if (propertyName === 'strike') {
        updatedNode.strike = value;
      } else if (propertyName === 'bold') {
        updatedNode.bold = value;
      }
      return updatedNode;
    } else if (node.children) {
      return { ...node, children: updateTextPropertyDeep(node.children, propertyName, value) };
    }
    return node;
  });
}
