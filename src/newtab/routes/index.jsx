import * as React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import DelayedMount from "~/components/DelayedMount";
import PageLoading from "~/components/PageLoading";

const Home = React.lazy(() => import("~/view/Home"));
const LinkHome = React.lazy(() => import("~/scenes/Link"));

export default () => {
  return (
    <React.Suspense
      fallback={
        <DelayedMount delay={200}>
          <PageLoading />
        </DelayedMount>
      }
    >
      <HashRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/" element={<Home />}>
            <Route index element={<LinkHome />} />
          </Route>
        </Routes>
      </HashRouter>
    </React.Suspense>
  );
};
