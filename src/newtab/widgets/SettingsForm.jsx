import React from "react";
import styled from "styled-components";
import { Button, ConfigProvider, Input, InputNumber, Select, Space, Switch, Typography } from "antd";
import useStores from "~/hooks/useStores";

const Field = styled.div`
  & + & {
    margin-top: 14px;
  }
`;

/* 标签行:label 在左,「打开控制台」这类帮助链接在右 —— 它是「去哪拿密钥」
   的帮助入口,不和保存/清除这些改动数据的按钮混在一排 */
const LabelRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
`;

const Label = styled.div`
  font-size: 12px;
  color: var(--colorText);
`;

const Hint = styled.div`
  font-size: 11px;
  color: var(--colorTextSecondary);
  margin-top: 6px;
  line-height: 1.6;
`;

/**
 * 一个字段。带 verify 的（密钥类）走「测试并保存」，验证不通过不写入——
 * 首屏卡片在密钥填错时什么都显示不出来，所以必须在这里就给出明确结果。
 * 其余字段即时保存（文本框失焦或回车时）。
 */
const SettingField = (props) => {
  const { field, value, onSave, onClear } = props;
  const { tools } = useStores();
  const [draft, setDraft] = React.useState(value ?? "");
  const [loading, setLoading] = React.useState(false);
  const [tested, setTested] = React.useState(null);

  React.useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const commit = async (next) => {
    await onSave(field.key, next);
    await field.afterSave?.();
  };

  const onVerify = async () => {
    const next = String(draft || "").trim();
    setLoading(true);
    setTested(null);
    try {
      const data = await field.verify(next);
      await commit(next);
      setTested(field.describe ? field.describe(data) : "验证通过");
      tools.success?.(`${field.label} 验证成功`);
    } catch (err) {
      setTested(null);
      tools.error?.(err?.message || `${field.label} 连接失败`);
    } finally {
      setLoading(false);
    }
  };

  const onClearClick = async () => {
    setDraft("");
    setTested(null);
    await onClear(field.key);
    await field.afterSave?.();
  };

  const control = () => {
    switch (field.type) {
      case "switch":
        return (
          <Switch checked={!!value} onChange={(checked) => commit(checked)} />
        );
      case "select":
        return (
          <Select
            style={{ width: "100%" }}
            value={value}
            options={field.options}
            placeholder={field.placeholder}
            onChange={(next) => commit(next)}
          />
        );
      case "number":
        return (
          <InputNumber
            style={{ width: "100%" }}
            value={value}
            min={field.min}
            max={field.max}
            placeholder={field.placeholder}
            onChange={(next) => commit(next)}
          />
        );
      case "password":
        return (
          <Input.Password
            value={draft}
            placeholder={field.placeholder}
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value)}
          />
        );
      default:
        return (
          <Input
            value={draft}
            placeholder={field.placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== value && commit(draft)}
            onPressEnter={() => draft !== value && commit(draft)}
          />
        );
    }
  };

  return (
    <Field>
      <LabelRow>
        <Label>{field.label}</Label>
        {field.link ? (
          <Typography.Link href={field.link.url} target="_blank">
            {field.link.text}
          </Typography.Link>
        ) : null}
      </LabelRow>
      {control()}
      {field.hint ? <Hint>{field.hint}</Hint> : null}
      {field.verify ? (
        <div style={{ marginTop: 8 }}>
          <Space>
            <Button type="primary" size="small" loading={loading} onClick={onVerify}>
              测试并保存
            </Button>
            {value ? (
              <Button size="small" type="text" onClick={onClearClick}>
                {field.secret ? "清除密钥" : "清除"}
              </Button>
            ) : null}
          </Space>
        </div>
      ) : null}
      {tested ? <Hint>{tested}</Hint> : null}
    </Field>
  );
};

/**
 * 类型级设置与实例级配置共用的表单渲染器：组件用 schema 声明字段，
 * 首选项页不需要认识任何一种具体组件。schema 表达不了的控件，
 * 组件可以改为提供自己的 Settings / ConfigForm。
 */
const SettingsForm = (props) => {
  const { schema, values, onSave, onClear } = props;
  return (
    /* 表单周边的正文是 11–13px 的小字排版,antd 控件默认 14px,
       统一压到 13px,免得一张卡里两套尺度 */
    <ConfigProvider theme={{ token: { fontSize: 13 } }}>
      {schema.map((field) => (
        <SettingField
          key={field.key}
          field={field}
          value={values[field.key]}
          onSave={onSave}
          onClear={onClear}
        />
      ))}
    </ConfigProvider>
  );
};

export default SettingsForm;
