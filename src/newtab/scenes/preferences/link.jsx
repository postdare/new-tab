import React from "react";
import { observer } from "mobx-react";
import { Form, Checkbox, Select, Divider, Button, Modal } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import useStores from "~/hooks/useStores";
import UploadImg from "~/components/UploadImg";
import { db } from "~/db";
import { refreshFaviconForUrl } from "~/utils/favicon";
import _ from "lodash";

const options = [
    {
        label: '4个',
        value: 4,
    }, {
        label: '6个',
        value: 6,
    }, {
        label: '8个',
        value: 8,
    }
];

const homeLinkMaxNumOption = [
    {
        label: '一行',
        value: 7,
    },
    {
        label: '两行',
        value: 14,
    },
    {
        label: '三行',
        value: 21,
    },
    {
        label: '四行',
        value: 28,
    },
    {
        label: '五行',
        value: 35,
    },

];

const PreferencesLink = () => {
    const { option, tools } = useStores();
    const _option = _.cloneDeep(option.item);
    const { linkSpan, copyClose, defaultOpenAdd, defauiltLink, linkOpenSelf, homeLinkMaxNum, rollingBack, showHomeGroupTitle = true } = _option;

    const handleChange = (value) => {
        if (!value || typeof value !== 'object') {
            return;
        }
        for (const key in value) {
            const v = value[key];
            option.setItem(key, v);
        }
    };

    // 批量获取所有抽屉图标
    const handleBatchFetchIcons = React.useCallback(async () => {
        try {
            // 获取所有链接
            const allLinks = await db.link.toArray();
            const allUrls = allLinks
                .filter(link => link.url && link.url.trim())
                .map(link => link.url);

            // 按域名去重，同一个域名只需要获取一次图标
            const domainUrlMap = new Map();
            allUrls.forEach(url => {
                try {
                    const origin = new URL(url).origin;
                    // 如果该域名还没有记录，或者当前URL更短（优先选择更简洁的URL）
                    if (!domainUrlMap.has(origin) || url.length < domainUrlMap.get(origin).length) {
                        domainUrlMap.set(origin, url);
                    }
                } catch {
                    // 无效URL，跳过
                }
            });

            const validUrls = Array.from(domainUrlMap.values());

            if (validUrls.length === 0) {
                tools.messageApi?.open({
                    type: 'info',
                    content: '没有找到需要获取图标的链接',
                    duration: 2,
                });
                return;
            }

            const total = validUrls.length;
            let processed = 0;
            let success = 0;
            let failed = 0;
            const batchSize = 7;
            const delay = 1000; // 1秒延迟

            // 显示开始通知
            const loadingKey = `batch-fetch-icons-${Date.now()}`;
            const originalCount = allUrls.length;
            const deduplicatedCount = validUrls.length;
            const dedupeInfo = originalCount !== deduplicatedCount 
                ? `（已去重：${originalCount} → ${deduplicatedCount}）` 
                : '';
            tools.messageApi?.open({
                key: loadingKey,
                type: 'info',
                content: `开始批量获取图标，共 ${total} 个域名${dedupeInfo}...`,
                duration: 0, // 不自动关闭
            });

            // 分批处理
            for (let i = 0; i < validUrls.length; i += batchSize) {
                const batch = validUrls.slice(i, i + batchSize);
                
                // 并行处理当前批次
                const batchPromises = batch.map(async (url) => {
                    try {
                        await refreshFaviconForUrl(url);
                        success++;
                    } catch (error) {
                        console.error(`[PreferencesLink] Failed to fetch icon for ${url}`, error);
                        failed++;
                    } finally {
                        processed++;
                    }
                });

                await Promise.all(batchPromises);

                // 更新进度通知
                tools.messageApi?.open({
                    key: loadingKey,
                    type: 'info',
                    content: `正在获取图标... ${processed}/${total} (成功: ${success}, 失败: ${failed})`,
                    duration: 0,
                });

                // 如果不是最后一批，等待1秒
                if (i + batchSize < validUrls.length) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // 关闭进度通知，显示完成通知
            tools.messageApi?.destroy(loadingKey);
            tools.messageApi?.open({
                type: 'success',
                content: `批量获取图标完成！共处理 ${total} 个链接，成功 ${success} 个，失败 ${failed} 个`,
                duration: 4,
            });

            // 触发全局刷新事件
            const uniqueOrigins = new Set();
            validUrls.forEach(url => {
                try {
                    const origin = new URL(url).origin;
                    uniqueOrigins.add(origin);
                } catch {
                    // ignore invalid URLs
                }
            });
            
            uniqueOrigins.forEach(origin => {
                window.dispatchEvent(new CustomEvent('faviconRefreshed', {
                    detail: { origin }
                }));
            });
        } catch (error) {
            console.error('[PreferencesLink] Batch fetch icons error', error);
            tools.messageApi?.open({
                type: 'error',
                content: '批量获取图标时发生错误',
                duration: 3,
            });
        }
    }, [tools]);

    const handleBatchFetchClick = React.useCallback(() => {
        Modal.confirm({
            title: '确认批量获取图标？',
            icon: <ExclamationCircleOutlined />,
            content: '此操作将重新获取所有抽屉链接的图标，可能需要较长时间。是否继续？',
            okText: '确认',
            okType: 'primary',
            cancelText: '取消',
            onOk: () => {
                // 立即关闭弹窗，后台执行任务
                handleBatchFetchIcons();
                return Promise.resolve();
            },
        });
    }, [handleBatchFetchIcons]);
    return (
        <Form
            name="basic"
            layout="vertical"
            initialValues={{
                linkSpan,
                copyClose,
                defaultOpenAdd,
                defauiltLink,
                linkOpenSelf,
                homeLinkMaxNum,
                rollingBack,
                showHomeGroupTitle,
            }}
            onValuesChange={handleChange}
        >
            <Form.Item label="每行展示链接数" name='linkSpan' >
                <Select
                    size="large"
                    style={{ width: '100%' }}
                    options={options}
                />
            </Form.Item>
            <Divider />
            <Form.Item label="首屏快捷链接最大行数" name='homeLinkMaxNum'>
                <Select
                    size="large"
                    style={{ width: '100%' }}
                    options={homeLinkMaxNumOption}
                />
            </Form.Item>
            <Form.Item name='showHomeGroupTitle' valuePropName="checked" style={{ marginBottom: 5 }}>
                <Checkbox>在首屏显示分组名称</Checkbox>
            </Form.Item>
            <Form.Item style={{ marginBottom: 8 }}>
                <Button
                    type="default"
                    block
                    onClick={() => {
                        Modal.confirm({
                            title: '重置首屏分组布局？',
                            icon: <ExclamationCircleOutlined />,
                            content: '将清除已保存的分组位置，并按默认瀑布流重新排列。图标不会删除。',
                            okText: '重置',
                            okType: 'primary',
                            cancelText: '取消',
                            onOk: () => {
                                tools.resetHomeLinkLayout();
                                tools.messageApi?.open?.({
                                    type: 'success',
                                    content: '已重置首屏布局',
                                });
                            },
                        });
                    }}
                >
                    重置首屏分组布局
                </Button>
            </Form.Item>
            <Divider />

            <Form.Item name='defaultOpenAdd' valuePropName="checked" style={{ marginBottom: 5 }}>
                <Checkbox>默认打开新增列表</Checkbox>
            </Form.Item>
            {/* <Divider /> */}
            <Form.Item name='copyClose' valuePropName="checked" style={{ marginBottom: 5 }}>
                <Checkbox >新增链接后关闭页面</Checkbox>
            </Form.Item>
            {/* <Divider /> */}
            <Form.Item name='defauiltLink' valuePropName="checked" style={{ marginBottom: 5 }}>
                <Checkbox >默认展示抽屉</Checkbox>
            </Form.Item>
            {/* <Divider /> */}
            <Form.Item name='linkOpenSelf' valuePropName="checked" style={{ marginBottom: 5 }}>
                <Checkbox >链接在新标签页中打开</Checkbox>
            </Form.Item>
            <Form.Item name='rollingBack' valuePropName="checked" style={{ marginBottom: 5 }}>
                <Checkbox >支持滚动返回首屏</Checkbox>
            </Form.Item>
            <Divider />
            <Form.Item>
                <Button 
                    type="default" 
                    block 
                    onClick={handleBatchFetchClick}
                    style={{ marginTop: 8 }}
                >
                    获取全部抽屉图标
                </Button>
            </Form.Item>
        </Form>
    );
};
export default observer(PreferencesLink);
