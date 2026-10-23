import React from "react";
import styled from "styled-components";
import { observer } from "mobx-react";
import { theme, Button, Tooltip, Badge } from "antd";
import { useLocation } from "react-router-dom";
import useStores from "~/hooks/useStores";
import { getBgFitStyles, HOME_ENTER } from "~/utils";
import { IconCirclePlus, IconChevronUp } from "@tabler/icons-react";
import { motion, useAnimationControls } from "framer-motion";
import { useUpdateEffect, useHover, useCreation, useKeyPress, useMemoizedFn } from "ahooks";
import HomeLinkList from "./HomeLinkList";
import HomeBgLayer from "./HomeBgLayer";
import ScreenTrack from "./ScreenTrack";
import ScreenDots from "./ScreenDots";
import HomeSearch from "~/components/HomeSearch";
import Clock from "~/components/Clock";
import WidgetLayer from "~/widgets/WidgetLayer";
import Wordmark from "~/components/Wordmark";
import {
  SCREEN_COUNT,
  LINK_SCREENS_KEY,
  linkGroupsForScreen,
  normalizeScreen,
} from "~/screens";
import _ from "lodash";


const { useToken } = theme;

const FirstScreenImgBg = styled(motion.div)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${(props) => props.backgroundColor};
  
  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: ${(props) => props.bg1Url ? `url(${props.bg1Url})` : 'none'};
    background-repeat: ${(props) => getBgFitStyles(props.bg1ImageFit).repeat};
    background-position: ${(props) => getBgFitStyles(props.bg1ImageFit).position};
    background-size: ${(props) => getBgFitStyles(props.bg1ImageFit).size};
    opacity: ${(props) => props.showBg1 ? 'var(--homeImgOpacity)' : '0'};
    transition: opacity 0.3s ease;
    filter: ${(props) => props.bg1Blur ? 'blur(10px)' : 'none'};
  }
  
  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: ${(props) => props.bg2Url ? `url(${props.bg2Url})` : 'none'};
    background-repeat: ${(props) => getBgFitStyles(props.bg2ImageFit).repeat};
    background-position: ${(props) => getBgFitStyles(props.bg2ImageFit).position};
    background-size: ${(props) => getBgFitStyles(props.bg2ImageFit).size};
    opacity: ${(props) => props.showBg2 ? 'var(--homeImgOpacity)' : '0'};
    transition: opacity 0.16s ease, filter 0.16s ease;
    filter: ${(props) => {
      if (!props.showBg2) return 'none';
      // 第二壁纸默认模糊，只有在激活时才清晰
      return props.isBg2Active ? 'blur(0px)' : 'blur(10px)';
    }};
  }
`;

const HeaderWrap = styled(motion.div)`
  width: 100%;
  height: ${(props) => props.height};
  position: absolute;
  top: 0;
  left: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  pointer-events: none;
`;
const SearchWrap = styled(motion.div)`
  position: absolute;
  z-index: 50;
`;
const ClockWrap = styled(motion.div)`
  position: absolute;
  z-index: ${(props) => props.stickled ? "-1" : "50"};
  left: 50%;
  top: calc(${(props) => (props.isSoBarDown ? "85vh + 100px" : "30vh - 140px")});
  transform: translateX(-50%) ${(props) => (props.isSoBarDown ? "translateY(-100%)" : "")};
  transition: transform 0.3s, top 0.3s, bottom 0.3s, z-index: 0.8s;
  width: 500px;
  display: flex;
  justify-content: center;
  -webkit-user-select: none;
  -moz-user-select: none; 
  -ms-user-select: none; 
  user-select: none; 
`;
const ClockContent = styled(motion.div)``;

const LogoWrap = styled.div`
  width: ${(props) => props.navWidth}px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  opacity: var(--homeLogoOpacity);
  cursor: pointer;
  background: var(--workspaceSidebar);
  transition: opacity 0.2s ease;
  pointer-events: auto;

  &:hover {
    opacity: 1;
  }
`;
const LogoIconWrap = styled(motion.div)`
  position: absolute;
  width: 100%;
  top: 0;
  left: 0;
  > div {
    display: flex;
    justify-content: center;
    align-items: center;
  }
`;

const LogoBackHint = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: ${(p) => p.$color};
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: 1;
  opacity: 0.9;

  svg {
    width: 18px;
    height: 18px;
  }
`;
const NavRight = styled.div`
  display: flex;
  align-items: center;
  margin-right: 20px;
  transform: translateY(12px);
  pointer-events: auto;

  .ant-btn {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    color: var(--colorText);
    background: transparent;
    border: 0;
    transition: transform 0.2s ease, background-color 0.2s ease,
      border-color 0.2s ease;
  }

  .ant-btn:hover {
    color: var(--colorText) !important;
    background: var(--workspaceHover) !important;
    border-color: var(--workspaceBorder) !important;
    transform: translateY(-1px);
  }

  .ant-btn:active {
    transform: translateY(0) scale(0.97);
  }
`;
const clockAnimations = {
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    // 与壁纸入场同步、略微滞后，避免先于壁纸出现
    transition: {
      duration: HOME_ENTER.duration,
      ease: HOME_ENTER.ease,
      delay: HOME_ENTER.contentDelay,
    },
  },
  hidden: {
    opacity: 0,
    y: '100%',
    scale: 1,
    transition: { duration: 0.3, ease: "linear" },
  },
  bg2Show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.16, ease: "backIn" },
  },
  bg2Hidden: {
    opacity: 0,
    scale: 0.5,
    y: 0,
    transition: { duration: 0.16, ease: "easeOut" },
  }
};
const headerAnimations = {
  show: {
    y: 0,
  },
  hidden: {
    y: '-100%',
  }
};

// 获取图片尺寸
const getImageSize = (url) => {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('No URL provided'));
      return;
    }
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    };
    img.onerror = () => {
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });
};

// 根据图片尺寸智能判断展示方式
const getAutoImageFit = async (url) => {
  if (!url) return 'cover';
  try {
    const { width, height } = await getImageSize(url);
    // 如果高度大于宽度（竖图），使用 height100，否则使用 cover
    return height > width ? 'height100' : 'cover';
  } catch (error) {
    console.error('Failed to get image size:', error);
    return 'cover'; // 出错时默认使用 cover
  }
};

const FirstScreen = (props) => {
  const { handleUnlock, unlock, showTopIcon } = props;

  const { home, tools, option, link } = useStores();
  const {
    isSoBarDown,
    bgColor,
    bgType,
    showHomeClock,
    homeLinkMaxNum = 14,
    bgImageFit = "cover",
    bg2ImageFit = "cover",
    showHomeGroupTitle = true,
  } = option.item;

  const effectiveKeys = option.getHomeLinkTimeKeys();
  const effectiveKeysSig = effectiveKeys.join(',');
  
  // 直接使用 bgUrl（HomeStores 会自动处理渐进式加载：先缩略图后大图）
  const bg1DisplayUrl = home.bgUrl || home.bgThumbnailUrl || null;
  
  // 智能判断实际的展示方式（初始值：如果是 auto 则先用 cover，待图片加载后更新）
  const [actualBg1ImageFit, setActualBg1ImageFit] = React.useState(bgImageFit === 'auto' ? 'cover' : bgImageFit);
  const [actualBg2ImageFit, setActualBg2ImageFit] = React.useState(bg2ImageFit === 'auto' ? 'cover' : bg2ImageFit);
  const clockWrapController = useAnimationControls();

  const { token } = useToken();
  const location = useLocation();
  const [pendingLinksCount, setPendingLinksCount] = React.useState(0);

  // 当前所在屏:0 首屏,1 副屏。新标签页首挂就是 0(返回首屏语义由 Home 的解锁状态管)
  const [currentScreen, setCurrentScreen] = React.useState(0);

  // 切屏过渡动画时长 400ms（与 ScreenTrack 的 transition 保持一致）
  const transitionTimerRef = React.useRef(null);
  const isTransitioningRef = React.useRef(false);

  React.useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const goScreen = useMemoizedFn((next) => {
    if (isTransitioningRef.current) return;
    const target = normalizeScreen(next);
    if (target === currentScreen) return;

    isTransitioningRef.current = true;
    setCurrentScreen(target);

    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = setTimeout(() => {
      isTransitioningRef.current = false;
      transitionTimerRef.current = null;
    }, 400);
  });

  // ←/→ 方向键切屏。焦点在输入框/可编辑元素时不抢按键——
  // 搜索框的候选导航、便签编辑都依赖这些键
  useKeyPress(
    (event) => event.key === "ArrowLeft" || event.key === "ArrowRight",
    (event) => {
      if (unlock) return;
      const el = document.activeElement;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      goScreen(currentScreen + (event.key === "ArrowRight" ? 1 : -1));
    },
    { events: ["keydown"] }
  );

  // 触摸横滑切屏(纵向滑动仍交给浏览器与解锁手势,不相抢)
  const touchStartRef = React.useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches?.[0];
    touchStartRef.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || unlock || home.isBg2) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goScreen(currentScreen + (dx < 0 ? 1 : -1));
    }
  };

  // 横向滚轮切屏;纵向滚轮仍走 Home 的解锁手势,互不干涉
  React.useEffect(() => {
    const onWheel = (e) => {
      if (unlock || home.isBg2) return;
      if (
        Math.abs(e.deltaX) > Math.abs(e.deltaY) &&
        Math.abs(e.deltaX) > 20
      ) {
        // 最左屏时左滑无事可做,不拦默认行为(如浏览器后退手势)
        if (currentScreen === 0 && e.deltaX < 0) return;
        e.preventDefault();
        goScreen(currentScreen + (e.deltaX > 0 ? 1 : -1));
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [unlock, currentScreen, goScreen, home.isBg2]);

  const searchPosition = {
    x: "-50%",
    top: isSoBarDown ? "85vh" : "30vh",
    left: "50%",
  };

  const logoIconRef = React.useRef(null);
  const isLogoIconHovering = useHover(logoIconRef);

  const bgImg = useCreation(() => {
    const showBg1 = bg1DisplayUrl && (!home.isBg2 || !home.bg2Url);
    const showBg2 = home.bg2Url && home.isBg2;
    
    return (
      <FirstScreenImgBg
        backgroundColor={bgType === "color" ? bgColor : ''}
        bg1ImageFit={actualBg1ImageFit}
        bg2ImageFit={actualBg2ImageFit}
        bg1Url={bg1DisplayUrl}
        bg2Url={home.bg2Url || null}
        showBg1={showBg1}
        showBg2={showBg2}
        isBg2Active={home.isBg2}
        bg1Blur={false}
        animate={{
          opacity: unlock ? 0 : 1,
        }}
        transition={{ duration: HOME_ENTER.duration, ease: HOME_ENTER.ease }}
      />
    )

  }, [bgType, bgColor, actualBg1ImageFit, actualBg2ImageFit, bg1DisplayUrl, home.bg2Url, home.isBg2, unlock])

  // 毛玻璃卡片用的壁纸 CSS 变量：挂在 HomeLinkList 根节点，
  // 卡片内部通过 var() 消费，壁纸变化（如缩略图→大图）不会重渲染各卡片
  const frostStyle = useCreation(() => {
    const fit = getBgFitStyles(actualBg1ImageFit);
    return {
      "--frost-bg-image": bg1DisplayUrl ? `url(${bg1DisplayUrl})` : "none",
      "--frost-bg-repeat": fit.repeat,
      "--frost-bg-position": fit.position,
      "--frost-bg-size": fit.size,
    };
  }, [bg1DisplayUrl, actualBg1ImageFit]);

  // 智能判断第一壁纸的展示方式
  React.useEffect(() => {
    if (bgImageFit === 'auto' && bg1DisplayUrl) {
      getAutoImageFit(bg1DisplayUrl).then((fit) => {
        setActualBg1ImageFit(fit);
      });
    } else {
      setActualBg1ImageFit(bgImageFit);
    }
  }, [bgImageFit, bg1DisplayUrl]);

  // 智能判断第二壁纸的展示方式
  React.useEffect(() => {
    if (bg2ImageFit === 'auto' && home.bg2Url) {
      getAutoImageFit(home.bg2Url).then((fit) => {
        setActualBg2ImageFit(fit);
      });
    } else {
      setActualBg2ImageFit(bg2ImageFit);
    }
  }, [bg2ImageFit, home.bg2Url]);

  React.useEffect(() => {
    if (!home.bgUrl) {
      home.onLoadBg();
    }
  }, [home]);

  // 是否进入过管理页：决定搜索框重新挂载时用"快速出现"（新标签页首开）
  // 还是"与壁纸同步淡入"（从管理页返回）
  const hasLeftHomeRef = React.useRef(false);

  useUpdateEffect(() => {
    if (unlock) {
      hasLeftHomeRef.current = true;
      clockWrapController.start("hidden");
    } else {
      clockWrapController.start("show");
    }
  }, [unlock]);

  // 按屏拆分分组键:effectiveKeys 全集 × homeLinkScreens 归属 → 每屏各自的键列表。
  // 归属变化(移屏)通过键列表签名感知,homeLinkPositions 形状不变,移屏不丢位置
  const homeScreenKeys = useCreation(
    () =>
      Array.from({ length: SCREEN_COUNT }, (_, s) =>
        linkGroupsForScreen(option.item, effectiveKeys, s)
      ),
    [effectiveKeysSig, option.item[LINK_SCREENS_KEY]]
  );
  const homeScreenKeysSig = homeScreenKeys.map((k) => k.join(",")).join("|");

  const [screenGroups, setScreenGroups] = React.useState(() =>
    Array.from({ length: SCREEN_COUNT }, () => [])
  );

  React.useEffect(() => {
    if (unlock) {
      // 管理页期间保持窗格挂载（stickled 状态下 opacity 为 0 不可见），
      // 卸载再重挂会让返回首页时的透明度过渡失效；返回时会重新拉取数据
      return;
    }
    if (effectiveKeys.length && !home.isBg2) {
      const loadKeys = (keys) =>
        Promise.all(
          keys.map((key) =>
            link.getLinkByParentId(key).then((childRes) => {
              const list = Array.isArray(childRes)
                ? childRes.sort((a, b) => a.sort - b.sort)
                : [];
              return {
                timeKey: key,
                links: _.take(list, homeLinkMaxNum),
              };
            })
          )
        ).catch((err) => {
          console.error('Failed to load home links:', err);
          return [];
        });
      Promise.all(homeScreenKeys.map(loadKeys)).then((groups) => {
        setScreenGroups(groups);
      });
    } else {
      setScreenGroups(homeScreenKeys.map(() => []));
    }
  }, [homeScreenKeysSig, unlock, home.isBg2, homeLinkMaxNum, link])

  React.useEffect(() => {
    if (home.isBg2) {
      clockWrapController.start("bg2Hidden");
    } else {
      clockWrapController.start("bg2Show");
    }
  }, [home.isBg2])

  // 获取待添加网址数量
  React.useEffect(() => {
    const loadPendingLinksCount = () => {
      link.getPendingLinks().then((links) => {
        setPendingLinksCount(links?.length || 0);
      }).catch((err) => {
        console.error("Failed to load pending links count:", err);
        setPendingLinksCount(0);
      });
    };
    loadPendingLinksCount();
    // 定期刷新待添加网址数量
    const interval = setInterval(() => {
      loadPendingLinksCount();
    }, 1000);
    return () => clearInterval(interval);
  }, [link]);

  // 轨道位移:切屏只动这一个 transform,壁纸层在轨道外不动不重载（使用 translate3d 开启硬件加速）
  const trackStyle = {
    transform: `translate3d(-${currentScreen * 100}%, 0, 0)`,
  };

  return (
    <>
      {bgImg}
      <HeaderWrap
        height={`${props.headerHeight}px`}
        initial={unlock ? 'show' : "hidden"}
        animate={unlock ? 'show' : "hidden"}
        variants={headerAnimations}
        transition={{ duration: 0.5, ease: "backIn" }}
      >
        <LogoWrap
          ref={logoIconRef}
          navWidth={props.navWidth}
          onClick={() => {
            handleUnlock();
          }}
          title="返回首屏"
        >
          <LogoIconWrap
            style={{ y: "0" }}
            animate={{
              y:
                showTopIcon || isLogoIconHovering
                  ? `-${props.headerHeight}px`
                  : "0",
            }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <div style={{ height: props.headerHeight }}>
              <Wordmark size="md" />
            </div>
            <div style={{ height: props.headerHeight }}>
              <LogoBackHint $color={token.colorPrimary}>
                <IconChevronUp stroke={1.8} />
                <span>Esc</span>
              </LogoBackHint>
            </div>
          </LogoIconWrap>
        </LogoWrap>
        <NavRight>
          {location.pathname === "/" ? (
            <Tooltip
              placement="bottom"
              title={
                pendingLinksCount > 0
                  ? `新增链接（${pendingLinksCount} 个待添加网址）`
                  : "新增链接"
              }
            >
              <Badge
                count={pendingLinksCount > 0 ? pendingLinksCount : 0}
                offset={[-2, 2]}
              >
                <Button
                  type="text"
                  onClick={() => (tools.tabListDrawer = true)}
                  icon={<IconCirclePlus size={20} stroke={1.5} />}
                />
              </Badge>
            </Tooltip>
          ) : null}
        </NavRight>
      </HeaderWrap>
      <ScreenTrack currentScreen={currentScreen} style={trackStyle} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* 首屏 pane:时钟 + 搜索框 + 首屏的组件与书签分组 */}
        <ScreenTrack.Pane>
          {showHomeClock ? (
            <ClockWrap
              isSoBarDown={isSoBarDown}
              stickled={unlock}
            >
              <ClockContent
                initial={!unlock ? 'show' : "hidden"}
                animate={clockWrapController}
                variants={clockAnimations}
              >
                <Clock isSoBarDown={isSoBarDown} />
              </ClockContent>
            </ClockWrap>
          ) : null}
          <WidgetLayer
            screen={0}
            stickled={unlock || home.isBg2}
            frostStyle={frostStyle}
          />
          {!unlock ? (
            <SearchWrap
              initial={{ ...searchPosition, opacity: 0 }}
              animate={{ ...searchPosition, opacity: 1 }}
              transition={
                hasLeftHomeRef.current
                  ? {
                      duration: HOME_ENTER.duration,
                      ease: HOME_ENTER.ease,
                      delay: HOME_ENTER.contentDelay,
                    }
                  : { duration: 0.16, ease: "easeOut" }
              }
            >
              <HomeSearch stickled={false} />
            </SearchWrap>
          ) : null}
          <HomeLinkList
            key="home-pane-0"
            homeGroups={screenGroups[0]}
            allTimeKeys={effectiveKeys}
            isSoBarDown={isSoBarDown}
            stickled={unlock}
            showGroupTitle={showHomeGroupTitle}
            frostStyle={frostStyle}
          />
          <HomeBgLayer
            screen={0}
            stickled={unlock}
            homeGroups={screenGroups[0]}
            isSoBarDown={isSoBarDown}
            showGroupTitle={showHomeGroupTitle}
          />
        </ScreenTrack.Pane>
        {/* 副屏 pane:只有副屏的组件与书签分组,没有时钟与搜索框 */}
        <ScreenTrack.Pane>
          <WidgetLayer
            screen={1}
            stickled={unlock || home.isBg2}
            frostStyle={frostStyle}
          />
          <HomeLinkList
            key="home-pane-1"
            homeGroups={screenGroups[1]}
            allTimeKeys={effectiveKeys}
            isSoBarDown={isSoBarDown}
            stickled={unlock}
            showGroupTitle={showHomeGroupTitle}
            frostStyle={frostStyle}
          />
          <HomeBgLayer
            screen={1}
            stickled={unlock}
            homeGroups={screenGroups[1]}
            isSoBarDown={isSoBarDown}
            showGroupTitle={showHomeGroupTitle}
          />
        </ScreenTrack.Pane>
      </ScreenTrack>
      <ScreenDots
        count={SCREEN_COUNT}
        current={currentScreen}
        onSelect={goScreen}
        stickled={unlock || home.isBg2}
      />
    </>
  );
};

export default observer(FirstScreen);
