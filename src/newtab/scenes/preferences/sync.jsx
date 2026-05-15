import React from "react";
import { observer } from "mobx-react";
import { Segmented } from "antd";
import useStores from "~/hooks/useStores";
import WebDAV from "./webDAV";
import GitHubGist from "./githubGist";

const syncTypeOptions = [
    { label: 'WebDAV', value: 'webdav' },
    { label: 'GitHub Gist', value: 'github_gist' },
];

const Sync = () => {
    const { option } = useStores();
    const syncType = option.item.syncType || 'webdav';

    const handleTypeChange = (type) => {
        option.setItem('syncType', type);
    };

    return (
        <>
            <Segmented
                options={syncTypeOptions}
                value={syncType}
                onChange={handleTypeChange}
                block
                style={{ marginBottom: 16 }}
            />
            {syncType === 'github_gist' ? <GitHubGist /> : <WebDAV />}
        </>
    );
};

export default observer(Sync);
