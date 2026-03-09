import React, { useEffect } from 'react';

interface AnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const copyWechat = () => {
    const wechatId = (document.getElementById('announcement-wechat-id') as HTMLElement)?.innerText || 'YourWechatID_888';
    const el = document.createElement('textarea');
    el.value = wechatId;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('✓ 微信号已复制，期待与您交流');
  };

  const showToast = (message: string) => {
    const oldToast = document.getElementById('announcement-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = 'announcement-toast';
    toast.className = 'announcement-toast';
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) document.body.removeChild(toast);
      }, 400);
    }, 2500);
  };

  const handleEnter = () => {
    onClose();
  };

  return (
    <div className="announcement-overlay" onClick={onClose}>
      <div className="announcement-modal" onClick={(e) => e.stopPropagation()}>
        <div className="announcement-glow" />

        <div className="announcement-content">
          {/* Header */}
          <div className="announcement-header">
            <div className="announcement-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="announcement-title">Welcome to Omni Canvas</h2>
            <p className="announcement-subtitle">Explore, expand, and refine your ideas.</p>
          </div>

          {/* Steps */}
          <div className="announcement-steps">
            <div className="announcement-steps-line" />
            <div className="announcement-steps-grid">
              <div className="announcement-step">
                <div className="announcement-step-number">01</div>
                <h4 className="announcement-step-title">注册 API 凭证</h4>
                <p className="announcement-step-desc">
                  前往 <a href="https://api.bltcy.ai/register?aff=cW2q64025" target="_blank" rel="noopener noreferrer" className="announcement-link">柏拉图AI平台</a> 完成开发者账号的注册与实名验证。
                </p>
              </div>

              <div className="announcement-step">
                <div className="announcement-step-number">02</div>
                <h4 className="announcement-step-title">生成鉴权密钥</h4>
                <p className="announcement-step-desc">
                  在控制台创建系统令牌，获取以 <code className="announcement-code">sk-...</code> 开头的安全密钥。
                </p>
              </div>

              <div className="announcement-step">
                <div className="announcement-step-number">03</div>
                <h4 className="announcement-step-title">配置终端引擎</h4>
                <p className="announcement-step-desc">
                  点击页面右上角配置图标，将密钥输入至全局设置中以激活系统。
                </p>
              </div>
            </div>
          </div>

          {/* Partner Services */}
          <div className="announcement-partner">
            <div className="announcement-partner-icon">
              <img
                src="/wechat-qrcode.png"
                alt="QR Code"
              />
            </div>
            <div className="announcement-partner-content">
              <div className="announcement-partner-header">
                <span className="announcement-partner-dot" />
                <h4>Partner Services</h4>
              </div>
              <p>
                提供专业的亚马逊高级视觉设计优化 (主图 / A+页面 / 品牌旗舰店)。
                获取最新 Omni 教程与福利，欢迎扫码或复制微信交流。
              </p>
            </div>
            <button className="announcement-copy-btn" onClick={copyWechat}>
              复制微信号
            </button>
            <span id="announcement-wechat-id" style={{ display: 'none' }}>hzy2285647401</span>
          </div>

          {/* CTA Button */}
          <div className="announcement-footer">
            <button className="announcement-enter-btn" onClick={handleEnter}>
              进入 Omni Canvas
            </button>
            <p className="announcement-footer-note">* 终身授权与本站生命周期保持一致</p>
          </div>
        </div>
      </div>
    </div>
  );
};
