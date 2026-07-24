import React from "react";
import { observer } from "mobx-react";
import styled from "styled-components";
import { App as AntApp, Form, Button, Input, Modal, Divider, Select, Tag } from "antd";
import useStores from "~/hooks/useStores";
import ConfirmDialogIcon from "~/components/ConfirmDialogIcon";
import _ from "lodash";

const Space = styled.div`
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
`;

const GistIdText = styled.div`
    font-size: 11px;
    color: var(--colorTextSecondary);
    margin-top: 6px;
    word-break: break-all;
`;

const GitHubGist = () => {
    const { option, data, tools } = useStores();
    const { modal } = AntApp.useApp();
    const _option = _.cloneDeep(option.item);
    const [loading, setLoading] = React.useState(false);
    const [open, setOpen] = React.useState(false);
    const [form] = Form.useForm();

    const { githubToken = '', githubGistId = '', webdavTime } = _option;

    const handleChange = React.useCallback((value) => {
        if (!value || typeof value !== 'object') return;
        for (const key in value) {
            option.setItem(key, value[key]);
        }
    }, [option]);

    const saveConfig = async (token, gistId) => {
        await Promise.all([
            option.setItem('githubToken', token.trim()),
            option.setItem('githubGistId', gistId),
            option.setItem('syncType', 'github_gist'),
        ]);
    };

    const onFinish = async (values) => {
        setLoading(true);
        try {
            const token = values.githubToken.trim();
            const { status, gistId } = await data.testGithubGist(
                token,
                values.githubGistId?.trim() || ''
            );

            if (status === 1) {
                modal.confirm({
                    title: "监测到远端有数据，即将删除本地所有数据",
                    icon: <ConfirmDialogIcon />,
                    content: (
                        <div>
                            <p>点击确认将删除当前所有数据并拉取远端数据，建议先导出本地数据</p>
                            <Button size="small" onClick={() => tools.onExport?.()}>导出本地数据</Button>
                        </div>
                    ),
                    okText: "确认",
                    okType: "danger",
                    cancelText: "取消",
                    onOk: async () => {
                        await saveConfig(token, gistId);
                        await option.setItem('webdavVersion', 1);
                        setTimeout(() => window.location.reload(), 1000);
                    },
                    onCancel() {
                        setLoading(false);
                    },
                });
            } else {
                await saveConfig(token, gistId);
                await data.seedGithubGist(token, gistId);
                // 自动创建的 gistId 回填到表单
                if (gistId && !values.githubGistId) {
                    form.setFieldValue('githubGistId', gistId);
                }
                tools.success?.("GitHub Gist 设置成功");
                setOpen(false);
                setTimeout(() => window.location.reload(), 1000);
            }
        } catch (err) {
            console.error('GitHub Gist test error:', err);
            tools.error?.(err.message || "GitHub Gist 连接失败");
            setLoading(false);
        }
    };

    return (
        <>
            <Form
                layout="vertical"
                initialValues={{ webdavTime }}
                onValuesChange={handleChange}
            >
                <Form.Item label={(<Space>GitHub Gist 配置 <Tag color="green">开发者友好</Tag></Space>)}>
                    <Space>
                        <Button type="primary" block onClick={() => setOpen(true)}>
                            设置
                        </Button>
                        {githubToken ? (
                            <Button onClick={data.deleteServeData}>清空</Button>
                        ) : null}
                    </Space>
                    {githubGistId ? (
                        <GistIdText>Gist ID: {githubGistId}</GistIdText>
                    ) : null}
                </Form.Item>
                <Divider />
                <Form.Item label="同步间隔时间" name="webdavTime">
                    <Select
                        size="large"
                        style={{ width: '100%' }}
                        options={[
                            { value: 1, label: '1秒' },
                            { value: 3, label: '3秒' },
                            { value: 5, label: '5秒' },
                            { value: 10, label: '10秒' },
                            { value: 60, label: '60秒' },
                        ]}
                    />
                </Form.Item>
            </Form>

            <Modal
                title="设置 GitHub Gist"
                centered
                open={open}
                onCancel={() => { setOpen(false); setLoading(false); }}
                footer={null}
                width={320}
            >
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{ githubToken, githubGistId }}
                    onFinish={onFinish}
                >
                    <Form.Item
                        label="GitHub Token"
                        name="githubToken"
                        rules={[{ required: true, message: '必填' }]}
                    >
                        <Input.Password placeholder="ghp_xxxxxxxxxxxx" />
                    </Form.Item>
                    <Form.Item
                        label="Gist ID（可选，留空自动创建）"
                        name="githubGistId"
                    >
                        <Input placeholder="留空将自动创建私密 Gist" />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" block loading={loading}>
                            测试并保存
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default observer(GitHubGist);
