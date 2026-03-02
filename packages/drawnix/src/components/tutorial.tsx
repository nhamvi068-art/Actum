import React, { useState, useEffect } from "react";
import { useI18n } from "../i18n";
import "./tutorial.scss";

export const Tutorial: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="drawnix-tutorial">
      <div className="tutorial-overlay">
        <div className="tutorial-content">
          
          <h1 className="brand-title">{t('tutorial.title')}</h1>
          <p className="brand-description">{t('tutorial.description')}</p>
          <p className="brand-tooltip">{t('tutorial.dataDescription')}</p>
          
        </div>
      </div>
    </div>
  );
};