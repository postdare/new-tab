import React from "react";
import styled from "styled-components";

/**
 * 字体字标 NewTab
 * size: sm | md | lg
 */
const Mark = styled.span`
  display: inline-flex;
  align-items: baseline;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
    "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-weight: 600;
  font-size: ${(p) => p.$size};
  line-height: 1;
  letter-spacing: -0.045em;
  color: ${(p) => p.$color || "var(--colorText, #1a1a1a)"};
  user-select: none;
  white-space: nowrap;

  .wm-new {
    font-weight: 500;
    opacity: 0.42;
    letter-spacing: -0.02em;
  }

  .wm-tab {
    font-weight: 700;
    letter-spacing: -0.05em;
  }
`;

const SIZE_MAP = {
  sm: "15px",
  md: "18px",
  lg: "28px",
  xl: "40px",
};

const Wordmark = ({ size = "md", color, className, style }) => {
  return (
    <Mark
      className={className}
      style={style}
      $size={SIZE_MAP[size] || size}
      $color={color}
      aria-label="NewTab"
    >
      <span className="wm-new">New</span>
      <span className="wm-tab">Tab</span>
    </Mark>
  );
};

export default Wordmark;
