import React from "react";
import ReactDOM from "react-dom/client";
import "entropia-template-ui/style.css";
import "@xyflow/react/dist/style.css";
import { EntroApp } from "./EntroApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EntroApp />
  </React.StrictMode>
);
