import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { App } from "./App";
import "./styles.css";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;

function Root() {
  if (!url) {
    return (
      <main className="setup">
        <h1>Second Look</h1>
        <p>This build has no Convex URL. Set VITE_CONVEX_URL and rebuild.</p>
      </main>
    );
  }
  const client = new ConvexReactClient(url);
  return (
    <ConvexProvider client={client}>
      <App />
    </ConvexProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
