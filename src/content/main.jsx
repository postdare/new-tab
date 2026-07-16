import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app";

function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

ready(() => {
  // 检查是否已经存在 root 元素，避免重复创建
  let root = document.getElementById("newtab_root");
  if (!root) {
    root = document.createElement("div");
    root.id = "newtab_root";
    document.body.appendChild(root);
  }
  const r = createRoot(root);
  r.render(<App />);
});
