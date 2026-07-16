import React from "react";
import { observer } from "mobx-react";
import styled from "styled-components";
import logo from "~/assets/logo.png";
import manifest from "../../../manifest";
import updateRecords from "../../../updateRecords";

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  max-height: min(70vh, 560px);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--borderColor, #eee);
  flex-shrink: 0;

  img {
    width: 40px;
    height: 40px;
    border-radius: 10px;
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name {
    font-size: 15px;
    font-weight: 600;
    color: var(--colorText, #333);
    line-height: 1.2;
  }

  .ver {
    font-size: 12px;
    color: #999;
  }
`;

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
`;

const Release = styled.section`
  & + & {
    margin-top: 16px;
  }

  h3 {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--colorText, #333);
  }

  ul {
    margin: 0;
    padding-left: 18px;
  }

  li {
    font-size: 13px;
    line-height: 1.55;
    color: #666;
    margin-bottom: 2px;
  }
`;

const About = () => {
  return (
    <Wrap>
      <Header>
        <img src={logo} alt="NewTab" />
        <div className="meta">
          <span className="name">NewTab</span>
          <span className="ver">v{manifest.version}</span>
        </div>
      </Header>
      <List className="scroll-container">
        {updateRecords.map((record) => (
          <Release key={record.version}>
            <h3>{record.version}</h3>
            <ul>
              {record.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Release>
        ))}
      </List>
    </Wrap>
  );
};

export default observer(About);
