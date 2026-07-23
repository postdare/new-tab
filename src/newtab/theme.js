import { theme } from "antd";

const APP_COLORS = {
  light: {
    primary: "#27272a",
    primaryHover: "#3f3f46",
    primaryActive: "#18181b",
    defaultColor: "#3f3f46",
    defaultBorderColor: "rgba(39, 39, 42, 0.18)",
    defaultHoverBg: "rgba(24, 24, 27, 0.04)",
    defaultHoverColor: "#18181b",
    defaultHoverBorderColor: "rgba(39, 39, 42, 0.3)",
    confirmIconColor: "#71717a",
  },
  dark: {
    primary: "#737373",
    primaryHover: "#8a8a8a",
    primaryActive: "#5f5f5f",
    defaultColor: "#e4e4e7",
    defaultBorderColor: "rgba(228, 228, 231, 0.18)",
    defaultHoverBg: "rgba(255, 255, 255, 0.08)",
    defaultHoverColor: "#fafafa",
    defaultHoverBorderColor: "rgba(228, 228, 231, 0.3)",
    confirmIconColor: "#a1a1aa",
  },
};

const getAppColors = (isDark) => APP_COLORS[isDark ? "dark" : "light"];

export const getAppPrimaryColor = (isDark) => getAppColors(isDark).primary;

/** 全局 Ant Design 主题：所有按钮和交互控件共用同一套中性色。 */
export const getAppTheme = (isDark) => {
  const colors = getAppColors(isDark);

  return {
    cssVar: true,
    algorithm: isDark ? theme.darkAlgorithm : undefined,
    token: {
      colorPrimary: colors.primary,
      colorPrimaryHover: colors.primaryHover,
      colorPrimaryActive: colors.primaryActive,
    },
    components: {
      Button: {
        primaryColor: "#fafafa",
        primaryShadow: "none",
        defaultBg: "transparent",
        defaultColor: colors.defaultColor,
        defaultBorderColor: colors.defaultBorderColor,
        defaultHoverBg: colors.defaultHoverBg,
        defaultHoverColor: colors.defaultHoverColor,
        defaultHoverBorderColor: colors.defaultHoverBorderColor,
        fontWeight: 500,
      },
      Modal: {
        colorInfo: colors.confirmIconColor,
        colorWarning: colors.confirmIconColor,
      },
      Popconfirm: {
        colorWarning: colors.confirmIconColor,
      },
    },
  };
};
