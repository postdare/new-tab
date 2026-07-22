import React from "react";
import { useMemoizedFn } from "ahooks";
import { observer } from "mobx-react";
import useStores from "~/hooks/useStores";
import { Tooltip } from "antd";
import FavIconIcon from "~/scenes/public/FavIconIcon";
import styled from "styled-components";
import { isSpecialProtocol, openUrl } from "~/utils";

const Wrap = styled.div`
  padding: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--fff);
  border-radius: ${(props) => (props.$isRound ? "30px" : "18px")};
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  position: relative;
  .link-a {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
  }
  > img {
    border-radius: ${(props) => (props.$isRound ? "30px" : "0")};
  }
`;

const LinkItemSmallComponent = (props) => {
  const { isSoBarDown, className, title, url } = props;
  const { option } = useStores();
  const { linkOpenSelf } = option.item;
  const isRound = !!option.item?.soStyleIsRound;

  const handleLinkClick = useMemoizedFn((e) => {
    if (!url) {
      return;
    }

    if (e.type === "auxclick" && e.button !== 1) {
      return;
    }

    if (isSpecialProtocol(url)) {
      e.preventDefault();
      e.stopPropagation();

      const isNewTab = e.metaKey || e.ctrlKey || e.button === 1;

      openUrl(url, {
        newTab: isNewTab || !linkOpenSelf,
        linkOpenSelf: linkOpenSelf,
      });
    }
  }, [url, linkOpenSelf]);

  return (
    <Tooltip
      title={title}
      placement={isSoBarDown ? "top" : "bottom"}
      mouseEnterDelay={0.35}
    >
      <Wrap $isRound={isRound} className={className}>
        <FavIconIcon size={28} url={url} />
        <a
          className="link-a"
          href={url}
          target={linkOpenSelf ? "_blank" : "_self"}
          onClick={handleLinkClick}
          onAuxClick={handleLinkClick}
        ></a>
      </Wrap>
    </Tooltip>
  );
};

const LinkItemSmall = React.memo(observer(LinkItemSmallComponent));

export default LinkItemSmall;
