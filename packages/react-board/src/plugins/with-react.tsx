import {
  type PlaitTextBoard,
  type RenderComponentRef,
  type TextProps,
} from '@plait/common';
import type { PlaitBoard } from '@plait/core';
import { createRoot } from 'react-dom/client';
import { Text } from '@plait-board/react-text';
import { ReactEditor } from 'slate-react';
import type { ReactBoard } from './board';

export const withReact = (board: PlaitBoard & PlaitTextBoard) => {
  const newBoard = board as PlaitBoard & PlaitTextBoard & ReactBoard;

  newBoard.renderText = (
    container: Element | DocumentFragment,
    props: TextProps
  ) => {
    const root = createRoot(container);
    let currentEditor: ReactEditor;
    const text = (
      <Text
        {...props}
        afterInit={(editor) => {
          currentEditor = editor as ReactEditor;
          props.afterInit && props.afterInit(editor);
        }}
      ></Text>
    );
    root.render(text);
    let newProps = { ...props };
    const ref: RenderComponentRef<TextProps> = {
      destroy: () => {
        setTimeout(() => {
          root.unmount();
        }, 0);
      },
      update: (updatedProps: Partial<TextProps>) => {
        console.log('【3. with-react update 入口】触发 update！');
        
        // 💥 关键修复：从 props.element 中去取新旧节点
        const oldElement = (newProps as any).element;
        const newElement = (updatedProps as any).element;
        
        console.log('【3. with-react update】oldElement:', oldElement, 'newElement:', newElement);
        
        // 比较字号
        const oldFontSize = oldElement?.textStyle?.fontSize;
        const newFontSize = newElement?.textStyle?.fontSize;
        
        // 如果字号变了，强制放行刷新！
        if (oldFontSize !== newFontSize) {
          console.log(`【3. with-react update】字号发生变化！从 ${oldFontSize} 变成 ${newFontSize}，强制刷新！`);
        }
        
        // 保留原有的文本内容比对
        const textChanged = newProps.text !== updatedProps.text;
        
        const hasUpdated = textChanged || (oldFontSize !== newFontSize);
        
        console.log('【3. with-react update】hasUpdated:', hasUpdated, '| textChanged:', textChanged);
        if (!hasUpdated) {
          console.log('【3. with-react update】检测到无变化，直接返回，不刷新组件！');
          return;
        }
        
        const readonly = ReactEditor.isReadOnly(currentEditor);
        newProps = { ...newProps, ...updatedProps };
        root.render(<Text {...newProps}></Text>);

        if (readonly === true && newProps.readonly === false) {
          setTimeout(() => {
            ReactEditor.focus(currentEditor);
          }, 100);
        } else if (readonly === false && newProps.readonly === true) {
          ReactEditor.blur(currentEditor);
          ReactEditor.deselect(currentEditor);
        }
      },
    };
    return ref;
  };

  return newBoard;
};
