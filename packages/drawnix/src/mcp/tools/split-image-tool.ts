import { PlaitBoard, getSelectedElements } from '@plait/core';
import { PlaitDrawElement, PlaitImage } from '@plait/draw';
import { executeSmartSplit } from '../../services/canvas-operations/split-image';

/**
 * MCP Tool definition for smart image splitting
 */
export interface SplitImageToolDefinition {
    name: string;
    description: string;
    execute: (board: PlaitBoard) => Promise<{
        success: boolean;
        message: string;
        sliceCount?: number;
    }>;
}

/**
 * Split Image Tool - Splits a composite image into independent sub-images
 */
export const splitImageTool: SplitImageToolDefinition = {
    name: 'split_image',
    description: '将选中的合成大图/宫格图智能拆分为多张独立的图片',
    
    execute: async (board: PlaitBoard) => {
        const selectedElements = getSelectedElements(board);
        
        if (selectedElements.length === 0) {
            return {
                success: false,
                message: '没有选中任何元素'
            };
        }

        // Find the first image element
        const imageElement = selectedElements.find(PlaitDrawElement.isImage) as PlaitImage | undefined;
        
        if (!imageElement) {
            return {
                success: false,
                message: '选中的元素不是图片'
            };
        }

        try {
            const result = await executeSmartSplit(board, imageElement);
            
            if (result.success) {
                return {
                    success: true,
                    message: '图片已成功拆分并重新排版',
                    sliceCount: result.sliceCount
                };
            } else {
                return {
                    success: false,
                    message: result.message
                };
            }
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : '拆分图片时发生未知错误'
            };
        }
    }
};

/**
 * Get all available MCP tools
 */
export const getMCPTools = (): SplitImageToolDefinition[] => {
    return [splitImageTool];
};

/**
 * Execute a tool by name
 */
export const executeMCPTool = async (
    toolName: string,
    board: PlaitBoard
): Promise<{ success: boolean; message: string; sliceCount?: number }> => {
    const tools = getMCPTools();
    const tool = tools.find(t => t.name === toolName);
    
    if (!tool) {
        return {
            success: false,
            message: `找不到名为 ${toolName} 的工具`
        };
    }
    
    return tool.execute(board);
};
