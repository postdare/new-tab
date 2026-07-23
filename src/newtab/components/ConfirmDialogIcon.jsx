import React from "react";
import styled from "styled-components";
import { IconAlertTriangle } from "@tabler/icons-react";

const IconFrame = styled.span`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  margin: ${(props) => (props.$embedded ? 0 : "2px 12px 0 0")};
  color: var(--workspaceMuted, currentColor);
  line-height: 1;
`;

/**
 * 应用级确认图标。所有普通确认弹窗复用中性、线性图标；
 * 危险语义由按钮和文案表达，不再使用 Ant Design 默认橙色图标。
 */
const ConfirmDialogIcon = ({
  icon: Icon = IconAlertTriangle,
  size = 22,
  stroke = 1.6,
  embedded = false,
  ...props
}) => (
  <IconFrame
    {...props}
    $embedded={embedded}
    $size={size}
    aria-hidden="true"
  >
    <Icon size={size} stroke={stroke} />
  </IconFrame>
);

export default ConfirmDialogIcon;
