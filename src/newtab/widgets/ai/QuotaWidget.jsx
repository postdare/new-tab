import React from "react";
import styled from "styled-components";
import { observer } from "mobx-react";
import { useMemoizedFn } from "ahooks";
import { IconExternalLink } from "@tabler/icons-react";
import useStores from "~/hooks/useStores";
import { formatAge } from "~/utils/timeText";
import WidgetCard, { scheme } from "../WidgetCard";
import { widgetSize, WIDGET_METRICS as M } from "../sizes";

/** 更新时间与重置倒计时常驻显示，靠这个低频 tick 让它们自己走字 */
const TICK_MS = 60 * 1000;
const EMPTY_STATE = { data: null, updatedAt: null, error: null };

/* 数值行按固定偏移锚在标题下方，底部行锚在卡片底部，中间的空档交给
   Spacer 吸收。整块内容一起贴底的话，没有副行的卡片数值会被顶下去，
   并排时就对不齐——苹果那套齐整靠的是各行锚死，不是卡片一样大。 */
const Value = styled.div`
  display: flex;
  align-items: baseline;
  /* 非数字状态（密钥失效 / —）用整档字号会撑破卡片 */
  font-size: ${(props) =>
    props.$compact
      ? `${Math.round(props.$size.valueFontSize * 0.66)}px`
      : `${props.$size.valueFontSize}px`};
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  /* 示警色随配色方案走：深色底上红字不醒目，亮色底上淡红又太弱 */
  color: ${(props) => (props.$alert ? props.$scheme.alert : "inherit")};
`;

/* 单位比数字小一号并对齐基线，是这类组件里最省力的「设计过」的信号 */
const Unit = styled.span`
  font-size: ${(props) => props.$size.unitFontSize}px;
  font-weight: 500;
  opacity: 0.88;
`;

const Spacer = styled.div`
  flex: 1;
`;

/* 数值与分解进度条并排：中卡多出来的横向空间用来放信息，不是把文案拉宽 */
const Row = styled.div`
  margin-top: ${M.valueOffset}px;
  display: flex;
  align-items: flex-start;
  gap: ${M.columnGap}px;
`;

const Bars = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${M.barGap}px;
  /* 让第一条对齐数值的字面顶部，而不是行盒顶部 */
  padding-top: 2px;
`;

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: ${M.barRowGap}px;
  font-size: ${M.barFontSize}px;
  line-height: 1;
`;

const BarLabel = styled.span`
  width: ${M.barLabelWidth}px;
  flex: none;
  opacity: 0.78;
`;

const BarTrack = styled.div`
  flex: 1;
  height: ${M.barTrackHeight}px;
  border-radius: ${M.barTrackHeight / 2}px;
  background: ${(props) => props.$scheme.barTrack};
  overflow: hidden;
`;

const BarFill = styled.div`
  height: 100%;
  border-radius: inherit;
  width: ${(props) => props.$percent}%;
  /* 没有品牌强调色的卡片退回配色方案的中性色，不去编一个 */
  background: ${(props) =>
    props.$alert
      ? props.$scheme.alert
      : `var(--widget-accent, ${props.$scheme.barFill})`};
`;

const BarValue = styled.span`
  width: ${M.barValueWidth}px;
  flex: none;
  text-align: right;
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
`;

const Meta = styled.div`
  margin-top: ${M.metaGap}px;
  font-size: ${M.metaFontSize}px;
  line-height: ${M.metaLineHeight};
  opacity: 0.78;
  white-space: nowrap;
`;

const Age = styled.div`
  margin-top: ${M.ageGap}px;
  font-size: ${M.ageFontSize}px;
  line-height: 1;
  opacity: 0.55;
`;

const Skeleton = styled.div`
  width: ${(props) => props.$size.valueFontSize * 2.6}px;
  height: ${(props) => props.$size.valueFontSize * 0.72}px;
  border-radius: 5px;
  background: currentColor;
  opacity: 0.2;
`;

const LinkIcon = styled.a`
  display: flex;
  align-items: center;
  color: inherit;
  opacity: 0;
  transition: opacity 0.2s ease;

  &:hover {
    color: inherit;
    opacity: 1 !important;
  }
`;

/** 取数与刷新，只有密钥存在时才真的请求 */
function useProviderQuota(apiKey, load) {
  const [state, setState] = React.useState(EMPTY_STATE);
  const [loading, setLoading] = React.useState(false);

  const refresh = useMemoizedFn(async (force) => {
    if (!apiKey) {
      setState(EMPTY_STATE);
      return;
    }
    setLoading(true);
    try {
      setState(await load(apiKey, { force }));
    } finally {
      setLoading(false);
    }
  });

  React.useEffect(() => {
    refresh(false);
  }, [apiKey, refresh]);

  return { state, loading, refresh };
}

/** 分解进度条要占一列，小卡塞不下：小卡只显示主指标与倒计时 */
const showsBars = (size) => size !== "small";

/**
 * AI 额度卡片。
 * 四种状态（加载中 / 正常 / 陈旧 / 密钥失效）全部在这里判定；
 * provider 只提供一个纯函数 format(data, size?) → { prefix?, value, suffix?, alert, meta, bars? }
 * （个别 provider 的 meta 文案随尺寸变：中卡的进度条里已有的用量，meta 不再重复），
 * 于是卡片的字号体系不会泄漏给 provider。format 在渲染时调用而非缓存，
 * 里面的倒计时才会随 tick 自己走字。
 *
 * 自带取数：某个 provider 的响应到达只重渲染它自己，不牵动别的卡片。
 */
const QuotaWidget = observer((props) => {
  const { instance, definition, position, stickled, justDraggedRef } = props;
  const { provider } = definition;
  const { option, tools } = useStores();
  const apiKey = option.item[provider.optionKey] || "";
  const { state, loading, refresh } = useProviderQuota(apiKey, provider.quota.load);
  const [, setTick] = React.useState(0);

  const box = widgetSize(instance.size);
  const palette = scheme(definition.scheme);

  React.useEffect(() => {
    if (stickled) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [stickled]);

  const onRefresh = useMemoizedFn(() => {
    // 拖拽结束后浏览器仍会补一个 click，这里挡掉那次误刷新
    if (justDraggedRef.current) return;
    if (state.error?.type === "unauthorized") {
      tools.openWidgetsPage();
      return;
    }
    refresh(true);
  });

  const { data, updatedAt, error } = state;
  const unauthorized = error?.type === "unauthorized";
  /* 状态行只放短标签：整句话塞不进小卡。病因不同标签也不同——
     密钥不对是「密钥失效」，工作区没订阅是「未订阅」，见 aiProviderCore 的 statusReason。 */
  const unauthorizedLabel = error?.short || "密钥失效";
  const view = data ? provider.format(data, instance.size) : null;
  const age = unauthorized ? null : formatAge(updatedAt);
  const ageText =
    error && data ? ["更新失败", age].filter(Boolean).join(" · ") : age;

  const bars = showsBars(instance.size) ? view?.bars : null;

  const tip = unauthorized
    ? `${error.message}，点击前往设置`
    : error
      ? `${error.message}，显示的是上次的数据，点击重试`
      : "点击刷新，拖动可调整位置";

  const renderValue = () => {
    if (unauthorized)
      return (
        <Value $size={box} $scheme={palette} $alert $compact>
          {unauthorizedLabel}
        </Value>
      );
    if (loading && !data) return <Skeleton $size={box} />;
    if (!view) return <Value $size={box} $scheme={palette} $compact>—</Value>;
    return (
      <Value $size={box} $scheme={palette} $alert={view.alert}>
        {view.prefix ? <Unit $size={box}>{view.prefix}</Unit> : null}
        {view.value}
        {view.suffix ? <Unit $size={box}>{view.suffix}</Unit> : null}
      </Value>
    );
  };

  return (
    <WidgetCard
      instance={instance}
      definition={definition}
      position={position}
      onClick={onRefresh}
      tip={tip}
      action={
        <LinkIcon
          className="widget-head-action"
          href={provider.consoleUrl}
          target="_blank"
          rel="noreferrer"
          title={`打开 ${definition.title} 控制台`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <IconExternalLink size={13} stroke={1.8} />
        </LinkIcon>
      }
    >
      <Row>
        {renderValue()}
        {bars?.length ? (
          <Bars>
            {bars.map((bar) => (
              <Bar key={bar.label}>
                <BarLabel>{bar.label}</BarLabel>
                <BarTrack $scheme={palette}>
                  <BarFill
                    $percent={Math.min(100, Math.max(0, bar.percent))}
                    $alert={bar.percent >= 90}
                    $scheme={palette}
                  />
                </BarTrack>
                <BarValue>{Math.round(bar.percent)}%</BarValue>
              </Bar>
            ))}
          </Bars>
        ) : null}
      </Row>
      <Spacer />
      {view?.meta?.length
        ? view.meta.map((line) => <Meta key={line}>{line}</Meta>)
        : null}
      {ageText ? <Age>{ageText}</Age> : null}
    </WidgetCard>
  );
});

export default QuotaWidget;
