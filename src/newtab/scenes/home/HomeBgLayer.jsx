import React from "react";
import { observer } from "mobx-react";
import useStores from "~/hooks/useStores";
import styled from "styled-components";
import {
  IconSettings,
  IconInfoCircle,
  IconDownload,
  IconRefresh,
} from "@tabler/icons-react";
import { useLongPress } from "ahooks";

/** 首屏壁纸交互层：右键菜单 + 长按切换第二壁纸（原便签层职责中的非便签部分） */
const Wrap = styled.div`
  position: absolute;
  inset: 0;
  z-index: ${(props) => props.$zIndex};
  pointer-events: auto;
`;

const Surface = styled.div`
  width: 100%;
  height: 100%;
`;

const HomeBgLayerComponent = (props) => {
  const { stickled } = props;
  const { home, option, tools } = useStores();
  const parentRef = React.useRef(null);

  const onContextMenu = React.useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      const list = [
        {
          label: "首选项",
          icon: <IconSettings />,
          key: "preferences",
          onClick: () => {
            tools.preferencesOpen = true;
          },
        },
        {
          label: "关于",
          icon: <IconInfoCircle />,
          key: "about",
          onClick: () => {
            tools.openPublicModal("About", {}, 440, "关于");
          },
        },
      ];
      if (option.item.bgType === "bing") {
        list.push({ type: "divider" });
        list.push({
          label: "Bing 壁纸下载",
          icon: <IconDownload />,
          key: "downloadBing",
          onClick: () => {
            home.downloadBingWallpaper && home.downloadBingWallpaper();
          },
        });
        list.push({
          label: "随机换一张 Bing 壁纸",
          icon: <IconRefresh />,
          key: "randomBing",
          onClick: () => {
            home.randomBingBg && home.randomBingBg();
          },
        });
      }
      tools.setRightClickEvent(e, list);
    },
    [tools, option, home]
  );

  useLongPress(
    (e) => {
      if (!e.target.classList.contains("sn-bg-wrap")) {
        return;
      }
      if (!stickled) {
        home.showBg2();
      }
    },
    parentRef,
    {
      moveThreshold: { x: 30, y: 30 },
      onLongPressEnd: () => {
        home.showBg1();
      },
    }
  );

  return (
    <Wrap $zIndex={stickled ? -1 : 20}>
      <Surface
        className="sn-bg-wrap"
        data-type="bg-root"
        ref={parentRef}
        onContextMenu={onContextMenu}
      />
    </Wrap>
  );
};

const HomeBgLayer = React.memo(observer(HomeBgLayerComponent));

export default HomeBgLayer;
