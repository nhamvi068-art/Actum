import React, { useState } from 'react';

interface CrashRecoveryDialogProps {
    error: Error | null;
}

/**
 * 崩溃恢复对话框
 * 当应用发生严重错误时显示，提供用户友好的恢复选项
 */
export const CrashRecoveryDialog: React.FC<CrashRecoveryDialogProps> = ({ error }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isClearing, setIsClearing] = useState(false);

    // 安全返回首页
    const handleSafeReturn = () => {
        console.log('[CrashRecovery] Safe return to homepage');
        window.location.href = '/';
    };

    // 清除缓存并重置
    const handleHardReset = async () => {
        console.log('[CrashRecovery] Starting hard reset...');
        setIsClearing(true);

        try {
            // 清除所有本地存储
            if (typeof localStorage !== 'undefined') {
                // 只清除与画板相关的 key，保留其他应用数据
                const keysToRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (
                        key.includes('drawnix') ||
                        key.includes('board') ||
                        key.includes('project') ||
                        key.includes('canvas') ||
                        key.includes('workspace')
                    )) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => {
                    localStorage.removeItem(key);
                    console.log(`[CrashRecovery] Cleared: ${key}`);
                });
            }

            // 清除 IndexedDB（如果可用）
            if (typeof window !== 'undefined' && window.indexedDB) {
                const databases = ['drawnix-db', 'actum-db', 'plait-db'];
                for (const dbName of databases) {
                    try {
                        await new Promise<void>((resolve, reject) => {
                            const request = window.indexedDB.deleteDatabase(dbName);
                            request.onsuccess = () => {
                                console.log(`[CrashRecovery] Deleted IndexedDB: ${dbName}`);
                                resolve();
                            };
                            request.onerror = () => {
                                console.warn(`[CrashRecovery] Failed to delete IndexedDB: ${dbName}`);
                                resolve(); // 不阻塞流程
                            };
                        });
                    } catch (e) {
                        console.warn('[CrashRecovery] Error deleting IndexedDB:', e);
                    }
                }
            }

            console.log('[CrashRecovery] Hard reset completed');
        } catch (e) {
            console.error('[CrashRecovery] Error during hard reset:', e);
        } finally {
            setIsClearing(false);
            // 跳转首页
            window.location.href = '/';
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 99999,
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '32px',
                maxWidth: '440px',
                width: '90%',
                textAlign: 'center',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            }}>
                {/* 图标 */}
                <div style={{
                    width: '64px',
                    height: '64px',
                    margin: '0 auto 20px',
                    borderRadius: '50%',
                    backgroundColor: '#fef2f2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#dc2626"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>

                {/* 标题 */}
                <h2 style={{
                    fontSize: '20px',
                    fontWeight: 600,
                    color: '#1f2937',
                    marginBottom: '12px',
                }}>
                    抱歉，画板遇到了一些问题
                </h2>

                {/* 描述 */}
                <p style={{
                    fontSize: '14px',
                    color: '#6b7280',
                    marginBottom: '20px',
                    lineHeight: 1.5,
                }}>
                    应用遇到了意外错误，无法继续运行。请选择以下操作恢复。
                </p>

                {/* 错误信息折叠区域 */}
                {error && (
                    <div style={{
                        marginBottom: '20px',
                        textAlign: 'left',
                    }}>
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                width: '100%',
                                padding: '8px 12px',
                                backgroundColor: '#f3f4f6',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                color: '#6b7280',
                            }}
                        >
                            <span>错误详情</span>
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                style={{
                                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s',
                                }}
                            >
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>

                        {isExpanded && (
                            <div style={{
                                marginTop: '8px',
                                padding: '12px',
                                backgroundColor: '#fef2f2',
                                borderRadius: '6px',
                                fontSize: '12px',
                                color: '#991b1b',
                                fontFamily: 'monospace',
                                wordBreak: 'break-all',
                                maxHeight: '120px',
                                overflow: 'auto',
                            }}>
                                {error.message || String(error)}
                            </div>
                        )}
                    </div>
                )}

                {/* 操作按钮 */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                }}>
                    {/* 主要按钮：返回首页 */}
                    <button
                        onClick={handleSafeReturn}
                        style={{
                            padding: '12px 24px',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 500,
                            transition: 'background-color 0.2s',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                    >
                        返回首页
                    </button>

                    {/* 次要按钮：清除缓存 */}
                    <button
                        onClick={handleHardReset}
                        disabled={isClearing}
                        style={{
                            padding: '12px 24px',
                            backgroundColor: 'white',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            borderRadius: '8px',
                            cursor: isClearing ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: 500,
                            transition: 'all 0.2s',
                            opacity: isClearing ? 0.6 : 1,
                        }}
                        onMouseOver={(e) => {
                            if (!isClearing) {
                                e.currentTarget.style.backgroundColor = '#fef2f2';
                            }
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                        }}
                    >
                        {isClearing ? '正在清除...' : '清除本地缓存并重置'}
                    </button>
                </div>

                {/* 提示 */}
                <p style={{
                    fontSize: '12px',
                    color: '#9ca3af',
                    marginTop: '20px',
                }}>
                    如果问题持续存在，请尝试清除浏览器缓存或联系技术支持。
                </p>
            </div>
        </div>
    );
};
