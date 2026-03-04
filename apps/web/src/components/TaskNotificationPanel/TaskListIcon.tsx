import React from 'react';

export type TaskListIconProps = {
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export const TaskListIcon: React.FC<TaskListIconProps> = ({
  size = 18,
  strokeWidth = 2,
  className,
}) => {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6h12" />
      <path d="M9 12h12" />
      <path d="M9 18h12" />
      <path d="M3.5 6l1.2 1.2L7 4.9" />
      <path d="M3.5 12l1.2 1.2L7 10.9" />
      <path d="M3.5 18l1.2 1.2L7 16.9" />
    </svg>
  );
};

export default TaskListIcon;
