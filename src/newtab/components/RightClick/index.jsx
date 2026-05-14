import React from "react";
import { observer } from "mobx-react";
import { Dropdown, Menu } from "antd";
import { useClickAway } from "ahooks";
import styled from "styled-components";
import useStores from "~/hooks/useStores";

const MenuWrap = styled.div`
  position: fixed;
  z-index: 999;
  top: 0;
  left: 0;
  transition: all 0.3s;
  box-shadow: 0 3px 5px -2px rgba(0, 0, 0, 0.16),
    0 1px 14px -5px rgba(0, 0, 0, 0.16);
  border-radius: 8px;
  > .ant-menu {
    border-radius: 8px;
    min-width: 160px;
  }
  > .ant-menu-vertical {
    > li:not(.ant-menu-item-divider) {
      height: 34px;
      line-height: 34px;
      margin-bottom: 4px !important;
      display: flex;
      align-items: center;
      > svg {
        width: 18px;
        height: 18px;
      }
    }
  }
`;

const RightClick = (props) => {
  const { tools } = useStores();
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState(null);

  const onClick = (e) => {
    tools.setRightClickEvent(null);
  };

  useClickAway(
    () => {
      onClick();
    },
    ref,
    ["click", "contextmenu", "scroll"]
  );

  // 根据视口边界调整菜单位置，避免被裁剪
  React.useLayoutEffect(() => {
    if (tools.rightClickOpen && ref.current) {
      const { width, height } = ref.current.getBoundingClientRect();
      const { mouseX, mouseY } = tools.rightClickEvent;
      const pad = 8;
      let left = mouseX;
      let top = mouseY;
      if (left + width > window.innerWidth) {
        left = window.innerWidth - width - pad;
      }
      if (top + height > window.innerHeight) {
        top = window.innerHeight - height - pad;
      }
      setPos({ top: Math.max(pad, top), left: Math.max(pad, left) });
    } else {
      setPos(null);
    }
  }, [tools.rightClickOpen, tools.rightClickEvent, tools.rightClickMenu]);

  if (!tools.rightClickOpen || !tools.rightClickMenu) {
    return null;
  }

  return (
    <MenuWrap
      ref={ref}
      style={{
        top: (pos ? pos.top : tools.rightClickEvent.mouseY) + "px",
        left: (pos ? pos.left : tools.rightClickEvent.mouseX) + "px",
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <Menu onClick={onClick} mode="vertical" items={tools.rightClickMenu} />
    </MenuWrap>
  );
};
export default observer(RightClick);
