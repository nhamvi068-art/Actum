import { useState, useEffect } from 'react';
import {
  checkStorageQuota,
  clearThumbnails,
  cleanOldBoardContent,
  formatBytes,
} from '../../services/storage';

export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
}

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiConfig;
  onSave: (config: ApiConfig) => void;
  onClearCache?: () => void;
}

type ValidationStatus = 'idle' | 'validating' | 'success' | 'error';

export function SettingsDialog({ isOpen, onClose, config, onSave, onClearCache }: SettingsDialogProps) {
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [showApiKey, setShowApiKey] = useState(false);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');
  const [validationMessage, setValidationMessage] = useState('');
  const [storageInfo, setStorageInfo] = useState<{ used: number; quota: number; percentage: number } | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    setApiKey(config.apiKey);
    setBaseUrl(config.baseUrl);
    setValidationStatus('idle');
    setValidationMessage('');

    // Load storage quota info
    if (isOpen) {
      checkStorageQuota().then(quota => {
        setStorageInfo(quota);
      });
    }
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleValidate = async () => {
    if (!apiKey.trim() || !baseUrl.trim()) {
      setValidationStatus('error');
      setValidationMessage('Please fill in API Key and Base URL');
      return;
    }

    setValidationStatus('validating');
    setValidationMessage('');

    try {
      // Ensure baseUrl format is correct
      let url = baseUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      // Remove trailing slash
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
        setValidationMessage(`Connection successful! Current balance: ${data.quota ?? 'Unknown'}`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setValidationStatus('error');
        setValidationMessage(`Validation failed: ${errorData.error?.message || response.statusText || 'Unknown error'}`);
      }
    } catch (error) {
      setValidationStatus('error');
      setValidationMessage(`Connection failed: ${error instanceof Error ? error.message : 'Network error'}`);
    }
  };

  const handleSave = () => {
    if (!apiKey.trim() || !baseUrl.trim()) {
      setValidationStatus('error');
      setValidationMessage('Please fill in API Key and Base URL');
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

  const handleClearCache = async () => {
    if (!confirm('Are you sure you want to clear local cache? This will delete all thumbnails and old project data.')) {
      return;
    }

    setIsClearing(true);
    try {
      await clearThumbnails();
      await cleanOldBoardContent(3);

      // Refresh storage info
      const quota = await checkStorageQuota();
      setStorageInfo(quota);

      // Notify parent to refresh data
      if (onClearCache) {
        onClearCache();
      }

      alert('Cache cleared successfully!');
    } catch (error) {
      console.error('Failed to clear cache:', error);
      alert('Failed to clear cache, please try again');
    } finally {
      setIsClearing(false);
    }
  };

  // Calculate storage usage display color
  const getStorageUsageColor = () => {
    if (!storageInfo) return '';
    if (storageInfo.percentage > 90) return 'storage-critical';
    if (storageInfo.percentage > 70) return 'storage-warning';
    return 'storage-normal';
  };

  return (
    <div className="modal-overlay api-config-overlay" onClick={handleOverlayClick}>
      <div className="modal-content api-config-modal">
        <div className="api-config-header">
          <h2 className="modal-title">Settings</h2>
          <button className="btn-close" onClick={onClose} title="Close">
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
                placeholder="Please enter API Key"
                autoComplete="off"
              />
              <button
                type="button"
                className="btn-toggle-visibility"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? 'Hide' : 'Show'}
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
              placeholder="e.g. api.example.com or https://api.example.com"
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

          {/* Storage management section */}
          <div className="storage-section">
            <h3 className="storage-title">Local Storage</h3>
            {storageInfo ? (
              <>
                <div className="storage-bar-container">
                  <div
                    className={`storage-bar ${getStorageUsageColor()}`}
                    style={{ width: `${Math.min(storageInfo.percentage, 100)}%` }}
                  />
                </div>
                <p className="storage-info">
                  Used: {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.quota)}
                  ({storageInfo.percentage.toFixed(1)}%)
                </p>
                {storageInfo.percentage > 80 && (
                  <p className="storage-warning">
                    Storage space is low, recommend clearing cache
                  </p>
                )}
                <button
                  className="btn-clear-cache"
                  onClick={handleClearCache}
                  disabled={isClearing}
                >
                  {isClearing ? 'Clearing...' : 'Clear Cache'}
                </button>
              </>
            ) : (
              <p className="storage-loading">Loading...</p>
            )}
          </div>
        </div>

        <div className="api-config-footer">
          <button
            className="btn-validate"
            onClick={handleValidate}
            disabled={validationStatus === 'validating'}
          >
            {validationStatus === 'validating' ? 'Validating...' : 'Test Connection'}
          </button>
          <div className="footer-actions">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-save" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsDialog;
