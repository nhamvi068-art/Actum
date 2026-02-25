import { useState, useEffect } from 'react';

export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
}

interface ApiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiConfig;
  onSave: (config: ApiConfig) => void;
}

type ValidationStatus = 'idle' | 'validating' | 'success' | 'error';

export function ApiConfigModal({ isOpen, onClose, config, onSave }: ApiConfigModalProps) {
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [showApiKey, setShowApiKey] = useState(false);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');
  const [validationMessage, setValidationMessage] = useState('');

  useEffect(() => {
    setApiKey(config.apiKey);
    setBaseUrl(config.baseUrl);
    setValidationStatus('idle');
    setValidationMessage('');
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleValidate = async () => {
    if (!apiKey.trim() || !baseUrl.trim()) {
      setValidationStatus('error');
      setValidationMessage('请填写 API Key 和 Base URL');
      return;
    }

    setValidationStatus('validating');
    setValidationMessage('');

    try {
      // 确保 baseUrl 格式正确
      let url = baseUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      // 移除末尾的斜杠
      url = url.replace(/\/$/, '');

      const response = await fetch(`${url}/v1/token/quota`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setValidationStatus('success');
        setValidationMessage(`连接成功！当前余额: ${data.quota ?? '未知'}`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setValidationStatus('error');
        setValidationMessage(`验证失败: ${errorData.error?.message || response.statusText || '未知错误'}`);
      }
    } catch (error) {
      setValidationStatus('error');
      setValidationMessage(`连接失败: ${error instanceof Error ? error.message : '网络错误'}`);
    }
  };

  const handleSave = () => {
    if (!apiKey.trim() || !baseUrl.trim()) {
      setValidationStatus('error');
      setValidationMessage('请填写 API Key 和 Base URL');
      return;
    }
    onSave({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim() });
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay api-config-overlay" onClick={handleOverlayClick}>
      <div className="modal-content api-config-modal">
        <div className="api-config-header">
          <h2 className="modal-title">API 配置</h2>
          <button className="btn-close" onClick={onClose} title="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="api-config-body">
          <div className="form-group">
            <label className="form-label" htmlFor="apiKey">API Key</label>
            <div className="input-wrapper">
              <input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                className="form-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="请输入 API Key"
                autoComplete="off"
              />
              <button
                type="button"
                className="btn-toggle-visibility"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? '隐藏' : '显示'}
              >
                {showApiKey ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="baseUrl">Base URL</label>
            <input
              id="baseUrl"
              type="text"
              className="form-input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="例如: api.example.com 或 https://api.example.com"
            />
          </div>

          {validationMessage && (
            <div className={`validation-message ${validationStatus}`}>
              {validationStatus === 'validating' && (
                <span className="spinner"></span>
              )}
              {validationStatus === 'success' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              )}
              {validationStatus === 'error' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              )}
              <span>{validationMessage}</span>
            </div>
          )}
        </div>

        <div className="api-config-footer">
          <button
            className="btn-validate"
            onClick={handleValidate}
            disabled={validationStatus === 'validating'}
          >
            {validationStatus === 'validating' ? '验证中...' : '验证连接'}
          </button>
          <div className="footer-actions">
            <button className="btn-cancel" onClick={onClose}>取消</button>
            <button className="btn-save" onClick={handleSave}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApiConfigModal;

