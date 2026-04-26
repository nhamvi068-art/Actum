import {
  TextEffect,
  TextShadowConfig,
  TextGradientConfig,
  TextStrokeConfig,
  GradientStop,
} from './text-style';

/**
 * Build CSS text-shadow string from config
 */
export function buildShadowCSS(shadow?: TextShadowConfig): string {
  if (!shadow) return 'none';
  
  const { offsetX, offsetY, blur, color } = shadow;
  return `${offsetX}px ${offsetY}px ${blur}px ${color}`;
}

/**
 * Build CSS gradient string from config
 */
export function buildGradientCSS(gradient?: TextGradientConfig): string {
  if (!gradient || !gradient.stops || gradient.stops.length === 0) {
    return 'none';
  }

  const { type, angle, stops } = gradient;

  if (type === 'linear') {
    const angleDeg = angle ?? 90;
    const direction = (angleDeg - 90) / 180 * 100;
    return `linear-gradient(${direction}%, ${formatGradientStops(stops)})`;
  } else {
    return `radial-gradient(circle, ${formatGradientStops(stops)})`;
  }
}

/**
 * Format gradient stops to CSS color stops
 */
function formatGradientStops(stops: GradientStop[]): string {
  // Sort stops by offset
  const sortedStops = [...stops].sort((a, b) => a.offset - b.offset);
  
  return sortedStops
    .map(stop => `${stop.color} ${stop.offset * 100}%`)
    .join(', ');
}

/**
 * Build CSS text-stroke string from config (webkit only)
 */
export function buildStrokeCSS(stroke?: TextStrokeConfig): string {
  if (!stroke) return '0px';
  
  const { width, color } = stroke;
  return `${width}px ${color}`;
}

/**
 * Build CSS filter for glow effect
 */
export function buildGlowCSS(blur: number, color: string): string {
  return `drop-shadow(0 0 ${blur}px ${color})`;
}

/**
 * Build all text effects as CSS properties
 */
export function buildTextEffects(effects?: TextEffect[]): CSSProperties {
  const styles: CSSProperties = {};
  
  if (!effects || effects.length === 0) {
    return styles;
  }
  
  for (const effect of effects) {
    switch (effect.type) {
      case 'shadow':
        if (effect.shadow) {
          styles.textShadow = buildShadowCSS(effect.shadow);
        }
        break;
        
      case 'gradient':
        if (effect.gradient) {
          styles.backgroundImage = buildGradientCSS(effect.gradient);
          styles.backgroundClip = 'text';
          styles.webkitBackgroundClip = 'text';
          styles.color = 'transparent';
        }
        break;
        
      case 'stroke':
        if (effect.stroke) {
          styles.webkitTextStroke = buildStrokeCSS(effect.stroke);
        }
        break;
        
      case 'glow':
        if (effect.glow) {
          const { blur, color } = effect.glow;
          // Apply as filter for glow effect
          styles.filter = buildGlowCSS(blur, color);
        }
        break;
    }
  }
  
  return styles;
}

/**
 * Build complete text container style from config
 */
export function buildTextContainerStyle(
  fontSize: number,
  fontFamily?: string,
  fontWeight?: number | string,
  scale: number = 1,
  effects?: TextEffect[]
): CSSProperties {
  const finalFontSize = fontSize * scale;
  
  const baseStyle: CSSProperties = {
    fontSize: `${finalFontSize}px`,
    fontFamily: fontFamily,
    fontWeight: fontWeight,
    lineHeight: getLineHeightByFontSize(finalFontSize),
  };
  
  const effectStyles = buildTextEffects(effects);
  
  return { ...baseStyle, ...effectStyles };
}

/**
 * Calculate line height based on font size
 */
export function getLineHeightByFontSize(fontSize: number): number {
  // Standard line height multiplier for body text
  return 1.5;
}

/**
 * Parse CSS shadow string back to config (for editing)
 */
export function parseShadowCSS(cssShadow: string): TextShadowConfig | null {
  if (!cssShadow || cssShadow === 'none') return null;
  
  const parts = cssShadow.split(' ');
  if (parts.length < 3) return null;
  
  const offsetX = parseFloat(parts[0]);
  const offsetY = parseFloat(parts[1]);
  const blur = parseFloat(parts[2]);
  const color = parts.slice(3).join(' ');
  
  if (isNaN(offsetX) || isNaN(offsetY) || isNaN(blur)) return null;
  
  return {
    offsetX,
    offsetY,
    blur,
    color,
  };
}

/**
 * Parse CSS gradient string back to config (for editing)
 */
export function parseGradientCSS(cssGradient: string): TextGradientConfig | null {
  if (!cssGradient || cssGradient === 'none') return null;
  
  // Simple parser for linear-gradient
  const linearMatch = cssGradient.match(/linear-gradient\((\d+)%?,\s*(.+)\)/);
  if (linearMatch) {
    const angle = parseInt(linearMatch[1], 10);
    const stopsStr = linearMatch[2];
    
    // Parse color stops
    const stops: GradientStop[] = [];
    const colorStopRegex = /(#[0-9a-fA-F]+|rgba?\([^)]+\)|[a-z]+)\s*(\d+(?:\.\d+)?)%?/g;
    let match;
    
    while ((match = colorStopRegex.exec(stopsStr)) !== null) {
      stops.push({
        color: match[1],
        offset: match[2] ? parseFloat(match[2]) / 100 : 0,
      });
    }
    
    return {
      type: 'linear',
      angle,
      stops: stops.length > 0 ? stops : [
        { offset: 0, color: '#ff0000' },
        { offset: 1, color: '#0000ff' },
      ],
    };
  }
  
  return null;
}

/**
 * Parse CSS stroke string back to config (for editing)
 */
export function parseStrokeCSS(cssStroke: string): TextStrokeConfig | null {
  if (!cssStroke || cssStroke === '0px') return null;
  
  const parts = cssStroke.split(' ');
  if (parts.length < 2) return null;
  
  const width = parseFloat(parts[0]);
  const color = parts.slice(1).join(' ');
  
  if (isNaN(width)) return null;
  
  return { width, color };
}
