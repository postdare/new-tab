import React from "react";
import styled from "styled-components";

/* 双屏横向轨道:两个全宽 pane 并排,切屏只动 translateX(偏移由 FirstScreen
   按 currentScreen 算好传入)。
   裁剪窗与轨道必须是两层:overflow 剪的是元素自己的 padding box,而 transform
   会连同这个盒子一起搬走,裁剪与内容的相对关系不变——两者放同一个元素上,
   超出首屏那一格的副屏 pane 会被永久剪掉,切过去只剩壁纸。
   所以裁剪留在不动的 Viewport 上,translateX 走里层 Track。
   Track 的 transform 天然是一个 stacking context,pane 内部的 z 层级
   (组件层 50、壁纸交互层 20)被关在轨道里,不会压到管理页(Main, z-index: 2)之上。
   壁纸层不在轨道内:两屏共用同一张壁纸,切屏只有内容横向滑动、壁纸不动。 */
const Viewport = styled.div`
  position: absolute;
  inset: 0;
  /* 两个 100% pane 拼出 200vw 内容,必须截断,否则底部出横向滚动条 */
  overflow: hidden;
  touch-action: pan-y;
`;

const Track = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  transition: transform 0.4s cubic-bezier(0.22, 0.61, 0.36, 1);
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
`;

const Pane = styled.div`
  position: relative;
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: pan-y;
`;

const ScreenTrack = (props) => {
  const { currentScreen = 0, style, children, ...rest } = props;
  const trackStyle = {
    transform: `translate3d(-${currentScreen * 100}%, 0, 0)`,
    ...style,
  };
  return (
    <Viewport {...rest} aria-live="polite">
      <Track style={trackStyle}>{children}</Track>
    </Viewport>
  );
};

ScreenTrack.Pane = Pane;

export default ScreenTrack;
