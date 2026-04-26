import { Transforms, PlaitBoard, Path } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { updateTextPropertyDeep, DEFAULT_TEXT_STYLE } from '../utils/text-style';

/**
 * Set text font size with dual-track data flow
 * Updates both:
 * - Macroscopic: element.textStyle.fontSize
 * - Microscopic: text.children leaf nodes
 */
export const setTextFontSize = (
  board: PlaitBoard,
  element: any,
  newFontSize: number
) => {
  if (!PlaitDrawElement.isText(element)) return;

  const path = PlaitBoard.findPath(board, element);
  if (!path) return;

  // Generate new internal rich text JSON with deeply updated font-size
  const newTextChildren = updateTextPropertyDeep(
    (element.text as any)?.children || [{ text: '' }],
    'font-size',
    newFontSize
  );

  const newText = {
    ...element.text,
    children: newTextChildren,
    textStyle: {
      ...((element.text as any)?.textStyle || {}),
      fontSize: newFontSize
    }
  };

  // Sync update both macroscopic and microscopic data
  Transforms.setNode(
    board,
    {
      textStyle: { ...(element.textStyle || DEFAULT_TEXT_STYLE), fontSize: newFontSize },
      text: newText
    },
    { at: path }
  );
};

/**
 * Set text color with dual-track data flow
 * Updates both:
 * - Macroscopic: element.textStyle.color
 * - Microscopic: text.children leaf nodes
 */
export const setTextColor = (
  board: PlaitBoard,
  element: any,
  newColor: string
) => {
  if (!PlaitDrawElement.isText(element)) return;

  const path = PlaitBoard.findPath(board, element);
  if (!path) return;

  // Generate new internal rich text JSON with deeply updated color
  const newTextChildren = updateTextPropertyDeep(
    (element.text as any)?.children || [{ text: '' }],
    'color',
    newColor
  );

  const newText = {
    ...element.text,
    children: newTextChildren,
    textStyle: {
      ...((element.text as any)?.textStyle || {}),
      color: newColor
    }
  };

  // Sync update both macroscopic and microscopic data
  Transforms.setNode(
    board,
    {
      textStyle: { ...(element.textStyle || DEFAULT_TEXT_STYLE), color: newColor },
      text: newText
    },
    { at: path }
  );
};

/**
 * Set text font family with dual-track data flow
 * Updates both:
 * - Macroscopic: element.textStyle.fontFamily
 * - Microscopic: text.children leaf nodes
 */
export const setTextFontFamily = (
  board: PlaitBoard,
  element: any,
  newFontFamily: string
) => {
  if (!PlaitDrawElement.isText(element)) return;

  const path = PlaitBoard.findPath(board, element);
  if (!path) return;

  // Generate new internal rich text JSON with deeply updated font-family
  const newTextChildren = updateTextPropertyDeep(
    (element.text as any)?.children || [{ text: '' }],
    'font-family',
    newFontFamily
  );

  const newText = {
    ...element.text,
    children: newTextChildren,
    textStyle: {
      ...((element.text as any)?.textStyle || {}),
      fontFamily: newFontFamily
    }
  };

  // Sync update both macroscopic and microscopic data
  Transforms.setNode(
    board,
    {
      textStyle: { ...(element.textStyle || DEFAULT_TEXT_STYLE), fontFamily: newFontFamily },
      text: newText
    },
    { at: path }
  );
};

/**
 * Set text line height with dual-track data flow
 */
export const setTextLineHeight = (
  board: PlaitBoard,
  element: any,
  newLineHeight: number
) => {
  if (!PlaitDrawElement.isText(element)) return;

  const path = PlaitBoard.findPath(board, element);
  if (!path) return;

  const newTextChildren = updateTextPropertyDeep(
    (element.text as any)?.children || [{ text: '' }],
    'line-height',
    newLineHeight
  );

  const newText = {
    ...element.text,
    children: newTextChildren,
    textStyle: {
      ...((element.text as any)?.textStyle || {}),
      lineHeight: newLineHeight
    }
  };

  Transforms.setNode(
    board,
    {
      textStyle: { ...(element.textStyle || DEFAULT_TEXT_STYLE), lineHeight: newLineHeight },
      text: newText
    },
    { at: path }
  );
};

/**
 * Set text letter spacing with dual-track data flow
 */
export const setTextLetterSpacing = (
  board: PlaitBoard,
  element: any,
  newLetterSpacing: number
) => {
  if (!PlaitDrawElement.isText(element)) return;

  const path = PlaitBoard.findPath(board, element);
  if (!path) return;

  const newTextChildren = updateTextPropertyDeep(
    (element.text as any)?.children || [{ text: '' }],
    'letter-spacing',
    newLetterSpacing
  );

  const newText = {
    ...element.text,
    children: newTextChildren,
    textStyle: {
      ...((element.text as any)?.textStyle || {}),
      letterSpacing: newLetterSpacing
    }
  };

  Transforms.setNode(
    board,
    {
      textStyle: { ...(element.textStyle || DEFAULT_TEXT_STYLE), letterSpacing: newLetterSpacing },
      text: newText
    },
    { at: path }
  );
};

/**
 * Handle text element resize - scales font size proportionally
 * Called when a text element is resized
 */
export const handleTextResize = (
  board: PlaitBoard,
  element: any,
  oldWidth: number,
  newWidth: number
) => {
  if (!PlaitDrawElement.isText(element)) return;
  if (oldWidth <= 0 || newWidth <= 0) return;

  // Calculate scale ratio
  const scale = newWidth / oldWidth;

  // Get current font size (default to 14 if not set)
  const oldFontSize = element.textStyle?.fontSize || DEFAULT_TEXT_STYLE.fontSize;

  // Calculate new font size (rounded to prevent decimal rendering issues)
  const newFontSize = Math.max(8, Math.round(oldFontSize * scale));

  // Only update if font size actually changed
  if (newFontSize !== oldFontSize) {
    setTextFontSize(board, element, newFontSize);
  }
};

/**
 * Create default text element with preset style
 * Used when creating new text on the canvas
 */
export const createDefaultTextElement = (
  x: number,
  y: number,
  width: number = 100,
  height: number = 40,
  textContent: string = ''
) => {
  const defaultStyle = DEFAULT_TEXT_STYLE;

  return {
    type: 'geometry',
    shape: 'text',
    points: [
      [x, y],
      [x + width, y + height]
    ] as [number, number][],
    // Macroscopic: inject default textStyle
    textStyle: { ...defaultStyle },
    // Microscopic: inject default rich text data (gene consistency)
    text: {
      type: 'paragraph',
      align: defaultStyle.textAlign || 'left',
      children: [
        {
          text: textContent,
          // Internal leaf nodes must carry the same default values
          'font-size': defaultStyle.fontSize,
          'font-family': defaultStyle.fontFamily,
          color: defaultStyle.color
        }
      ]
    }
  };
};
