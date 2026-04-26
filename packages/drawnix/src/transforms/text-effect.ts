import { Transforms, PlaitBoard, PlaitElement, Path } from '@plait/core';
import { TextEffect, TextEffectType } from '../utils/text-style';

/**
 * Set text effects on selected elements
 */
export function setTextEffects(board: PlaitBoard, effects: TextEffect[]) {
  const selectedElements = board.getSelectedElements();

  if (!selectedElements.length) return;

  selectedElements.forEach((element, index) => {
    const path = [index];
    const currentTextStyle = (element as any).textStyle || {};
    const newTextStyle = {
      ...currentTextStyle,
      effects,
    };
    Transforms.setNode(board, { textStyle: newTextStyle }, path);
  });
}

/**
 * Add or update a specific text effect
 */
export function setTextEffect(board: PlaitBoard, effectType: TextEffectType, effectConfig: any) {
  const selectedElements = board.getSelectedElements();

  if (!selectedElements.length) return;

  selectedElements.forEach((element, index) => {
    const path = [index];
    const currentTextStyle = (element as any).textStyle || {};
    const currentEffects = currentTextStyle.effects || [];
    
    // Find existing effect of this type
    const existingIndex = currentEffects.findIndex((e: TextEffect) => e.type === effectType);
    
    let newEffects: TextEffect[];
    if (existingIndex >= 0) {
      // Update existing effect
      newEffects = [...currentEffects];
      newEffects[existingIndex] = { type: effectType, [effectType]: effectConfig };
    } else {
      // Add new effect
      newEffects = [...currentEffects, { type: effectType, [effectType]: effectConfig }];
    }
    
    const newTextStyle = {
      ...currentTextStyle,
      effects: newEffects,
    };
    Transforms.setNode(board, { textStyle: newTextStyle }, path);
  });
}

/**
 * Remove a specific text effect
 */
export function removeTextEffect(board: PlaitBoard, effectType: TextEffectType) {
  const selectedElements = board.getSelectedElements();

  if (!selectedElements.length) return;

  selectedElements.forEach((element, index) => {
    const path = [index];
    const currentTextStyle = (element as any).textStyle || {};
    const currentEffects = currentTextStyle.effects || [];
    
    // Filter out the effect to remove
    const newEffects = currentEffects.filter((e: TextEffect) => e.type !== effectType);
    
    const newTextStyle = {
      ...currentTextStyle,
      effects: newEffects,
    };
    Transforms.setNode(board, { textStyle: newTextStyle }, path);
  });
}

/**
 * Set text scale (for font size resizing)
 */
export function setTextScale(board: PlaitBoard, scale: number) {
  const selectedElements = board.getSelectedElements();

  if (!selectedElements.length) return;

  selectedElements.forEach((element, index) => {
    const path = [index];
    const currentTextStyle = (element as any).textStyle || {};
    const newTextStyle = {
      ...currentTextStyle,
      scale,
    };
    Transforms.setNode(board, { textStyle: newTextStyle }, path);
  });
}

/**
 * Set font size (and optionally update scale)
 */
export function setFontSizeWithScale(board: PlaitBoard, fontSize: number, maintainScale: boolean = true) {
  const selectedElements = board.getSelectedElements();

  if (!selectedElements.length) return;

  selectedElements.forEach((element, index) => {
    const path = [index];
    const currentTextStyle = (element as any).textStyle || {};
    const currentScale = maintainScale ? (currentTextStyle.scale || 1) : 1;
    
    const newTextStyle = {
      ...currentTextStyle,
      fontSize,
      scale: currentScale,
    };
    Transforms.setNode(board, { textStyle: newTextStyle }, path);
  });
}
