import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * 全局错误边界组件
 * 捕获任何子组件抛出的渲染错误，显示降级的 UI
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null
        };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {
            hasError: true,
            error
        };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // 如果传入了自定义 fallback，使用它
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // 默认显示错误信息
            return (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    backgroundColor: '#f9fafb',
                    padding: '20px'
                }}>
                    <div style={{
                        textAlign: 'center',
                        maxWidth: '500px'
                    }}>
                        <h2 style={{ color: '#dc2626', marginBottom: '16px' }}>
                            出现了一些问题
                        </h2>
                        <p style={{ color: '#6b7280', marginBottom: '24px' }}>
                            应用遇到了意外错误，请尝试刷新页面或返回首页。
                        </p>
                        <button
                            onClick={() => window.location.href = '/'}
                            style={{
                                padding: '10px 20px',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '14px'
                            }}
                        >
                            返回首页
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
