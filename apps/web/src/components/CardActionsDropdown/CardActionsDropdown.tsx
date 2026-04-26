import React, { useState, useRef, useEffect } from 'react';
import './CardActionsDropdown.scss';

interface CardActionsDropdownProps {
  onDelete: () => void;
  onDuplicate: () => void;
}

export default function CardActionsDropdown({ onDelete, onDuplicate }: CardActionsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleOptionClick = (action: 'delete' | 'duplicate') => {
    setIsOpen(false);
    if (action === 'delete') {
      onDelete();
    } else if (action === 'duplicate') {
      onDuplicate();
    }
  };

  return (
    <div className="card-actions-dropdown" ref={dropdownRef}>
      <button 
        className="card-actions-dropdown-trigger" 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        aria-label="Actions"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="card-actions-dropdown-menu">
          <button 
            className="card-actions-dropdown-item" 
            onClick={(e) => {
              e.stopPropagation();
              handleOptionClick('duplicate');
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Duplicate
          </button>
          <button 
            className="card-actions-dropdown-item danger" 
            onClick={(e) => {
              e.stopPropagation();
              handleOptionClick('delete');
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

