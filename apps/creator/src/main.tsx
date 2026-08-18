import React from "react";
import ReactDOM from "react-dom/client";
import "entropia-template-ui/style.css";
import "@xyflow/react/dist/style.css";
import { applyTheme, applyBackground } from "entropia-template-ui";
import { EntroApp } from "./EntroApp";
import "./styles.css";

applyTheme("dark");
applyBackground("dark");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EntroApp />
  </React.StrictMode>
);
