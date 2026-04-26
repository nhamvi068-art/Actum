import React from 'react';

interface MigrationScreenProps {
    progress: number;
    message?: string;
    onCancel?: () => void;
}

/**
 * 迁移过渡界面
 * 在渲染旧版 Base64 数据时显示
 * 支持用户取消操作
 */
export const MigrationScreen: React.FC<MigrationScreenProps> = ({
    progress,
    message = '正在升级旧版文件，以提供更流畅的体验...',
    onCancel
}) => {
    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                zIndex: 9999,
            }}
        >
            <div
                style={{
                    textAlign: 'center',
                    maxWidth: '400px',
                    padding: '40px',
                }}
            >
                {/* 图标 */}
                <div
                    style={{
                        width: '64px',
                        height: '64px',
                        margin: '0 auto 24px',
                        animation: 'pulse 1.5s ease-in-out infinite',
                    }}
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                </div>

                {/* 标题 */}
                <h2
                    style={{
                        fontSize: '20px',
                        fontWeight: 600,
                        color: '#1f2937',
                        marginBottom: '8px',
                    }}
                >
                    正在升级文件格式
                </h2>

                {/* 描述 */}
                <p
                    style={{
                        fontSize: '14px',
                        color: '#6b7280',
                        marginBottom: '24px',
                    }}
                >
                    {message}
                </p>

                {/* 进度条 */}
                <div
                    style={{
                        width: '100%',
                        height: '8px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginBottom: '12px',
                    }}
                >
                    <div
                        style={{
                            width: `${progress}%`,
                            height: '100%',
                            backgroundColor: '#3b82f6',
                            borderRadius: '4px',
                            transition: 'width 0.3s ease',
                        }}
                    />
                </div>

                {/* 百分比 */}
                <p
                    style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#3b82f6',
                        marginBottom: '24px',
                    }}
                >
                    {progress}%
                </p>

                {/* 取消按钮 */}
                {onCancel && (
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '10px 24px',
                            fontSize: '14px',
                            color: '#6b7280',
                            backgroundColor: 'transparent',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = '#f3f4f6';
                            e.currentTarget.style.borderColor = '#9ca3af';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.borderColor = '#d1d5db';
                        }}
                    >
                        取消并返回首页
                    </button>
                )}

                {/* 加载提示 */}
                <p
                    style={{
                        fontSize: '12px',
                        color: '#9ca3af',
                        marginTop: '24px',
                    }}
                >
                    请勿关闭页面
                </p>
            </div>

            {/* 内联动画样式 */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(0.95); }
                }
            `}</style>
        </div>
    );
};
