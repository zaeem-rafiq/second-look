import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { App } from "./App";
import "./styles.css";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
const client = url ? new ConvexReactClient(url) : null;

function Root() {
  if (!client) {
    return (
      <main className="setup">
        <h1>Second Look</h1>
        <p>This build has no Convex URL. Set VITE_CONVEX_URL and rebuild.</p>
      </main>
    );
  }
  return (
    <ConvexAuthProvider client={client}>
      <App />
    </ConvexAuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
