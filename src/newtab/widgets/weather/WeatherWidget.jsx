import React from "react";
import styled from "styled-components";
import { observer } from "mobx-react";
import { useMemoizedFn } from "ahooks";
import dayjs from "dayjs";
import {
  IconSun,
  IconMoon,
  IconCloud,
  IconCloudFog,
  IconCloudRain,
  IconCloudSnow,
  IconCloudStorm,
  IconExternalLink,
} from "@tabler/icons-react";
import { formatAge } from "~/utils/timeText";
import WidgetCard, { scheme } from "../WidgetCard";
import { widgetSize, WIDGET_METRICS as M } from "../sizes";
import { resolvePlace, loadWeather, weatherText } from "./weatherCore";

/** 「x 分钟前」常驻显示，靠这个低频 tick 让它自己走字 */
const TICK_MS = 60 * 1000;

const Value = styled.div`
  display: flex;
  align-items: baseline;
  font-size: ${(props) =>
    props.$compact
      ? `${Math.round(props.$size.valueFontSize * 0.66)}px`
      : `${props.$size.valueFontSize}px`};
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: ${(props) => (props.$alert ? props.$scheme.alert : "inherit")};
`;

const Unit = styled.span`
  font-size: ${(props) => props.$size.unitFontSize}px;
  font-weight: 500;
  opacity: 0.88;
`;

/* 数值与天气概况并排：中卡多出来的横向空间用来放信息，不是把文案拉宽 */
const Row = styled.div`
  margin-top: ${M.valueOffset}px;
  display: flex;
  align-items: flex-start;
  gap: ${M.columnGap}px;
`;

/* 概况列：图标 + 现在的天气 + 体感，贴着数值右侧 */
const Summary = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 2px;
`;

const SummaryLine = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: ${M.metaFontSize}px;
  line-height: 1.2;
  opacity: 0.9;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const Glyph = styled.span`
  display: flex;
  align-items: center;
  flex: none;
  opacity: 0.9;
`;

const Meta = styled.div`
  margin-top: ${M.metaGap}px;
  font-size: ${M.metaFontSize}px;
  line-height: ${M.metaLineHeight};
  opacity: 0.78;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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

const Spacer = styled.div`
  flex: 1;
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

function weatherUrl(place) {
  if (!place) return "https://www.windy.com";
  const lat = place.latitude.toFixed(4);
  const lon = place.longitude.toFixed(4);
  return `https://www.windy.com/${lat}/${lon}?${lat},${lon},11`;
}

/* 未来几天：中卡以下放不下，只有大卡画 */
const Forecast = styled.div`
  margin-top: ${M.metaGap}px;
  display: flex;
  flex-direction: column;
  gap: ${M.barRowGap}px;
`;

const Day = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: ${M.metaFontSize}px;
  line-height: 1;
  opacity: 0.9;
`;

const DayName = styled.span`
  width: ${M.barLabelWidth}px;
  flex: none;
  opacity: 0.78;
`;

const DayText = styled.span`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const DayRange = styled.span`
  flex: none;
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
`;

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** WMO 天气码 → 图标。夜里放晴换月亮，其余不看昼夜 */
function weatherIcon(code, isDay) {
  if (code === 0 || code === 1) return isDay ? IconSun : IconMoon;
  if (code === 2 || code === 3) return IconCloud;
  if (code === 45 || code === 48) return IconCloudFog;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
    return IconCloudRain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return IconCloudSnow;
  return IconCloudStorm;
}

const dayLabel = (date, index) => {
  if (index === 0) return "今天";
  if (index === 1) return "明天";
  const day = dayjs(date);
  return day.isValid() ? WEEKDAYS[day.day()] : "";
};

const round = (n) => (Number.isFinite(n) ? Math.round(n) : "—");

/**
 * 天气卡。
 * 位置在城市配置里定：填了城市就固定显示，留空先试浏览器定位、
 * 拿不到位置落到西安。取数与缓存在 weatherCore，卡片只管四种状态
 * （加载中 / 正常 / 陈旧 / 出错）怎么摆。
 */
const WeatherWidget = (props) => {
  const { instance, definition, position, stickled, justDraggedRef } = props;
  const city = instance.config?.city || "";
  const [place, setPlace] = React.useState(null);
  const [weather, setWeather] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [, setTick] = React.useState(0);

  // 城市切换或拖拽后紧跟的 click 都可能让上一次请求晚到：晚到的结果不许覆盖新结果
  const seqRef = React.useRef(0);

  const refresh = useMemoizedFn(async (force) => {
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    setLoading(true);
    try {
      const nextPlace = await resolvePlace(city, { force });
      const nextWeather = await loadWeather(nextPlace, { force });
      if (seq !== seqRef.current) return;
      setError(null);
      setPlace(nextPlace);
      setWeather(nextWeather);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError({
        type: err?.type || "network",
        message: err?.message || "请求失败",
      });
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  });

  React.useEffect(() => {
    refresh(false);
  }, [city, refresh]);

  React.useEffect(() => {
    if (stickled) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [stickled]);

  const onRefresh = useMemoizedFn(() => {
    // 拖拽结束后浏览器仍会补一个 click，这里挡掉那次误刷新
    if (justDraggedRef.current) return;
    refresh(true);
  });

  const palette = scheme(definition.scheme);
  const box = widgetSize(instance.size);

  const data = weather?.data || null;
  const stale = !error && !!weather?.error;
  const problem = error || weather?.error || null;
  const auto = !(instance.config?.city || "").trim();

  const tip = problem
    ? `${problem.message}，显示的是上次的数据，点击重试`
    : "点击刷新，拖动可调整位置";

  const condition = data ? weatherText(data.code) : null;
  const Icon = data ? weatherIcon(data.code, data.isDay) : IconCloud;

  const summary =
    condition && instance.size !== "small" ? (
      <Summary>
        <SummaryLine>
          <Glyph>
            <Icon size={13} stroke={1.8} />
          </Glyph>
          {condition}
        </SummaryLine>
        <SummaryLine>体感 {round(data.apparent)}°</SummaryLine>
      </Summary>
    ) : null;

  const detail = data
    ? `高 ${round(data.days?.[0]?.max)}° · 低 ${round(data.days?.[0]?.min)}° · 湿度 ${round(
        data.humidity
      )}% · 风 ${round(data.wind)} km/h`
    : null;

  const renderValue = () => {
    if (loading && !data) return <Skeleton $size={box} />;
    if (!data)
      return (
        <Value $size={box} $scheme={palette} $compact>
          —
        </Value>
      );
    return (
      <Value $size={box} $scheme={palette} $alert={stale}>
        {round(data.temperature)}
        <Unit $size={box}>°C</Unit>
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
          href={weatherUrl(place)}
          target="_blank"
          rel="noreferrer"
          title={place ? `在 Windy 查看 ${place.name} 天气` : "打开天气网站"}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <IconExternalLink size={13} stroke={1.8} />
        </LinkIcon>
      }
    >
      <Row>
        {renderValue()}
        {summary}
      </Row>
      <Spacer />
      {condition && instance.size === "small" ? (
        <Meta>
          {condition} · {round(data.days?.[0]?.min)}~{round(data.days?.[0]?.max)}°
        </Meta>
      ) : null}
      {place && auto ? (
        <Meta>
          {place.name}
          {place.source === "located" ? " · 已定位" : ""}
        </Meta>
      ) : null}
      {detail && instance.size !== "small" ? <Meta>{detail}</Meta> : null}
      {data && instance.size === "large" ? (
        <Forecast>
          {(data.days || []).slice(0, 4).map((day, index) => {
            const DayIcon = weatherIcon(day.code, true);
            return (
              <Day key={day.date}>
                <DayName>{dayLabel(day.date, index)}</DayName>
                <DayText>
                  <Glyph>
                    <DayIcon size={12} stroke={1.8} />
                  </Glyph>
                  {weatherText(day.code)}
                </DayText>
                <DayRange>
                  {round(day.min)}° / {round(day.max)}°
                </DayRange>
              </Day>
            );
          })}
        </Forecast>
      ) : null}
      {!problem ? <Age>{formatAge(weather?.updatedAt)}</Age> : null}
    </WidgetCard>
  );
};

export default WeatherWidget;
