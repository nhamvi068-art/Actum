import { createEditor, type Descendant, Range, Transforms, Editor } from 'slate';
import { isKeyHotkey } from 'is-hotkey';
import {
  Editable,
  RenderElementProps,
  RenderLeafProps,
  Slate,
  withReact,
} from 'slate-react';
import {
  type CustomElement,
  type CustomText,
  type LinkElement,
  type ParagraphElement,
  type TextProps,
} from '@plait/common';
import React, { useMemo, useCallback, useEffect, CSSProperties } from 'react';
import { withHistory } from 'slate-history';
import { isUrl, LinkEditor } from '@plait/text-plugins';
import { withText } from './plugins/with-text';
import { CustomEditor, RenderElementPropsFor } from './custom-types';

import './styles/index.scss';
import { LinkComponent, withInlineLink } from './plugins/with-link';

// 扩展 TextProps 以支持缩放
export interface TextComponentProps extends TextProps {
  zoomScale?: number;
}

// 快捷键映射
const HOTKEYS: Record<string, string> = {
  'mod+b': 'bold',
  'mod+i': 'italic',
  'mod+u': 'underlined',
  'mod+shift+s': 'strike',
};

export default function Text(props: TextComponentProps): JSX.Element {
  const { text, element, readonly, onChange, onComposition, afterInit, zoomScale = 1 } = props;

  // 从 textStyle 中提取所有排版属性
  const textStyle = (text as any)?.textStyle || {};
  const currentFontFamily = textStyle.fontFamily || 'inherit';
  const currentFontWeight = textStyle.fontWeight || 'normal';
  const currentItalic = textStyle.italic || false;
  const currentUnderline = textStyle.underline || false;
  const currentStrike = textStyle.strike || false;
  const currentTextTransform = textStyle.textTransform || 'none';
  const currentTextAlign = (text as any)?.align || 'left';

  // 终极数据提取：防范 Slate 格式化清洗！
  // 1. 优先尝试从我们塞进去的宏观 textStyle 中拿
  let fontSize = textStyle.fontSize;
  let lineHeight = textStyle.lineHeight;
  let letterSpacing = textStyle.letterSpacing;

  // 2. 如果被 Slate 清洗了，直接去最深处的叶子节点里强行挖出来！
  if (!fontSize && text?.children) {
     const firstLeaf = text.children[0]?.children?.[0] || text.children[0];
     fontSize = firstLeaf?.['font-size'] || firstLeaf?.fontSize;
     lineHeight = firstLeaf?.['line-height'] || firstLeaf?.lineHeight;
     letterSpacing = firstLeaf?.['letter-spacing'] || firstLeaf?.letterSpacing;
  }

  // 3. 兜底默认值
  fontSize = fontSize || 14;
  lineHeight = lineHeight || 1.5;
  letterSpacing = letterSpacing || 0;

  // 核弹级修复：生成一个基于样式的唯一 Key！
  // 只要字号变了，强迫 React 销毁旧节点，重新渲染真实的 DOM！绕过一切缓存！
  const renderKey = `text-render-${fontSize}-${lineHeight}-${letterSpacing}`;

  // 计算 textDecoration
  let textDecoration = 'none';
  if (currentUnderline && currentStrike) {
    textDecoration = 'underline line-through';
  } else if (currentUnderline) {
    textDecoration = 'underline';
  } else if (currentStrike) {
    textDecoration = 'line-through';
  }

  const renderLeaf = useCallback(
    (props: RenderLeafProps) => (
      <Leaf
        {...props}
        fontSize={fontSize}
        fontFamily={currentFontFamily}
        lineHeight={lineHeight}
        letterSpacing={letterSpacing}
        fontWeight={currentFontWeight}
        italic={currentItalic}
        underline={currentUnderline}
        strike={currentStrike}
        textTransform={currentTextTransform}
      />
    ),
    [fontSize, currentFontFamily, lineHeight, letterSpacing, currentFontWeight, currentItalic, currentUnderline, currentStrike, currentTextTransform]
  );

  const initialValue: Descendant[] = [text];

  const editor = useMemo(() => {
    const editor = withInlineLink(
      withText(withHistory(withReact(createEditor())))
    );
    afterInit && afterInit(editor);
    return editor;
  }, []);

  useEffect(() => {
    if (text === editor.children[0]) {
      return;
    }
    editor.children = [text];
    editor.onChange();
  }, [text, editor]);

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    const { selection } = editor;

    // 处理格式化快捷键 (加粗/斜体/下划线/删除线)
    for (const hotkey in HOTKEYS) {
      if (isKeyHotkey(hotkey, event.nativeEvent)) {
        event.preventDefault();
        const mark = HOTKEYS[hotkey];
        toggleMark(editor, mark);
        return;
      }
    }

    // Default left/right behavior is unit:'character'.
    // This fails to distinguish between two cursor positions, such as
    // <inline>foo<cursor/></inline> vs <inline>foo</inline><cursor/>.
    // Here we modify the behavior to unit:'offset'.
    // This lets the user step into and out of the inline without stepping over characters.
    // You may wish to customize this further to only use unit:'offset' in specific cases.
    if (selection && Range.isCollapsed(selection)) {
      const { nativeEvent } = event;
      if (isKeyHotkey('left', nativeEvent)) {
        event.preventDefault();
        Transforms.move(editor, { unit: 'offset', reverse: true });
        return;
      }
      if (isKeyHotkey('right', nativeEvent)) {
        event.preventDefault();
        Transforms.move(editor, { unit: 'offset' });
        return;
      }
    }
  };

  // 切换文本格式
  const toggleMark = (editor: Editor, format: string) => {
    const isActive = isMarkActive(editor, format);
    if (isActive) {
      Editor.removeMark(editor, format);
    } else {
      Editor.addMark(editor, format, true);
    }
  };

  // 检查当前光标处是否激活某格式
  const isMarkActive = (editor: Editor, format: string) => {
    const marks = Editor.marks(editor);
    return marks ? marks[format as keyof typeof marks] === true : false;
  };

  // 计算缩放容器样式
  const containerStyle: CSSProperties = zoomScale !== 1
    ? {
        transform: `scale(${zoomScale})`,
        transformOrigin: '0 0',
        width: '100%',
        height: '100%',
      }
    : {};

  // TextManage 已经创建了 foreignObject，Text 组件只需要渲染内容
  // 直接渲染 Slate 编辑器容器
  return (
    // 1. 救命神药：强制允许 SVG 溢出显示，防止边缘被一刀切
    <div
      key={renderKey}
      className="slate-editable-container plait-text-container"
      style={{
        // 2. 重新挂载外层字号！这是字能变大的肉体保障！
        fontSize: `${fontSize}px`,
        fontFamily: currentFontFamily,
        // 关键：溢出显示，防止边缘被截断
        overflow: 'visible',
        // 3. 统一行高：使用动态行高值
        lineHeight: lineHeight,
        letterSpacing: typeof letterSpacing === 'number' ? `${letterSpacing}px` : letterSpacing,
        fontWeight: currentFontWeight,
        fontStyle: currentItalic ? 'italic' : 'normal',
        textDecoration: textDecoration,
        textTransform: currentTextTransform,
        textAlign: currentTextAlign,
        // 确保容器撑满
        width: '100%',
        minHeight: '100%',
        // 给一点点冗余空间，防止左右被截
        padding: '0 2px 4px 2px',
        ...containerStyle,
        pointerEvents: readonly === undefined || readonly ? 'none' : 'auto',
      }}
    >
      {/* 4. 使用内联样式，强制里面的所有 Slate 富文本节点继承我们外层的字号！ */}
      {/* 这一步是解决内部 Slate 死死卡住 14px 的终极利器 */}
      <style>
        {`
          .slate-editable-container span[data-slate-string],
          .slate-editable-container span[data-slate-leaf],
          .slate-editable-container p,
          .slate-editable-container div {
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
            letter-spacing: inherit !important;
            font-style: inherit !important;
            text-decoration: inherit !important;
            text-transform: inherit !important;
            text-align: inherit !important;
            margin: 0 !important;
          }
        `}
      </style>

      <Slate
            editor={editor}
            initialValue={initialValue}
            onChange={(value: Descendant[]) => {
              onChange &&
                onChange({
                  newText: editor.children[0] as ParagraphElement,
                  operations: editor.operations,
                });
            }}
          >
            <Editable
              className="plait-text-editable"
              // 3. 杀掉 Slate 内部默认的段落外边距，这是导致字往下掉被截断的最大元凶
              style={{ margin: 0, padding: 0 }}
              renderElement={(props) => <Element {...props} />}
              renderLeaf={renderLeaf}
              readOnly={readonly === undefined ? true : readonly}
              onCompositionStart={(event) => {
                if (onComposition) {
                  onComposition(event as unknown as CompositionEvent);
                }
              }}
              onCompositionUpdate={(event) => {
                if (onComposition) {
                  onComposition(event as unknown as CompositionEvent);
                }
              }}
              onCompositionEnd={(event) => {
                if (onComposition) {
                  onComposition(event as unknown as CompositionEvent);
                }
              }}
              onKeyDown={onKeyDown}
            />
          </Slate>
        </div>
  );
};

const Element = (props: RenderElementProps) => {
  const { attributes, children, element } = props as RenderElementPropsFor<
    CustomElement & { type: string }
  >;
  switch (element.type) {
    case 'link':
      return (
        <LinkComponent {...(props as RenderElementPropsFor<LinkElement>)} />
      );
    default:
      return (
        <ParagraphComponent
          {...(props as RenderElementPropsFor<ParagraphElement>)}
        />
      );
  }
};

const ParagraphComponent = ({
  attributes,
  children,
  element,
}: RenderElementPropsFor<ParagraphElement>) => {
  const style = { textAlign: element.align } as CSSProperties;
  return (
    <div style={style} {...attributes}>
      {children}
    </div>
  );
};

interface LeafProps extends RenderLeafProps {
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number | string;
  letterSpacing?: number | string;
  fontWeight?: number | string;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

const Leaf: React.FC<LeafProps> = ({
  children,
  leaf,
  attributes,
  fontSize = 14,
  fontFamily,
  lineHeight,
  letterSpacing,
  fontWeight = 'normal',
  italic,
  underline,
  strike,
  textTransform
}) => {
  // 优先从叶子节点读取字号，否则使用传入的默认值
  const leafFontSize = (leaf as CustomText).fontSize || (leaf as any)['font-size'] || fontSize;
  // 读取 fontWeight（优先从 props，其次叶子节点）
  const leafFontWeight = (leaf as CustomText).fontWeight || (leaf as any)['font-weight'] || fontWeight;
  // 从 props 读取其他属性
  const leafFontFamily = fontFamily;
  const leafLineHeight = lineHeight;
  const leafLetterSpacing = letterSpacing;
  const leafTextTransform = textTransform;

  // 计算 textDecoration（优先使用 props，其次叶子节点）
  let leafTextDecoration = 'none';
  const hasUnderline = underline || (leaf as CustomText).underlined;
  const hasStrike = strike || (leaf as CustomText).strike;
  if (hasUnderline && hasStrike) {
    leafTextDecoration = 'underline line-through';
  } else if (hasUnderline) {
    leafTextDecoration = 'underline';
  } else if (hasStrike) {
    leafTextDecoration = 'line-through';
  }

  if ((leaf as CustomText).bold) {
    children = <strong>{children}</strong>;
  }

  if ((leaf as CustomText).code) {
    children = <code>{children}</code>;
  }

  // 使用 props 中的 italic 状态，不再用 <em> 包裹（由外层 fontStyle 控制）
  if ((leaf as CustomText).italic) {
    children = <em>{children}</em>;
  }

  // 使用 props 中的 underline/strike 状态，不再用 <u>/<s> 包裹（由外层 textDecoration 控制）
  if ((leaf as CustomText).underlined) {
    children = <u>{children}</u>;
  }

  if ((leaf as CustomText).strike) {
    children = <s>{children}</s>;
  }

  return (
    <span
      style={{
        color: (leaf as CustomText).color,
        fontSize: `${leafFontSize}px`,
        fontFamily: leafFontFamily,
        fontWeight: leafFontWeight,
        lineHeight: leafLineHeight,
        letterSpacing: typeof leafLetterSpacing === 'number' ? `${leafLetterSpacing}px` : leafLetterSpacing,
        textDecoration: leafTextDecoration,
        textTransform: leafTextTransform,
      }}
      {...attributes}
    >
      {children}
    </span>
  );
};
