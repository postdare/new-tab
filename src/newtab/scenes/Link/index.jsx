import React from "react";
import { observer } from "mobx-react";
import styled from "styled-components";
import LinkPanel from "~/scenes/Link/LinkPanel";

const Warp = styled.section`
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px 28px 80px;
  box-sizing: border-box;

  @media (max-width: 1100px) {
    padding: 20px 20px 64px;
  }
`;

const LinkHome = () => {
  const ref = React.useRef(null);

  return (
    <Warp ref={ref} className="link-workspace">
      <LinkPanel warpRef={ref} />
    </Warp>
  );
};

export default observer(LinkHome);
