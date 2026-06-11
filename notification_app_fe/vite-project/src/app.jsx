import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import Navbar from "./components/Navbar";
import AllNotifications from "./pages/AllNotifications";
import PriorityInbox from "./pages/PriorityInbox";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1a73e8" },
    background: { default: "#f5f7fa" },
  },
  typography: { fontFamily: "Inter, sans-serif" },
});

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<Navigate to="/notifications" />} />
          <Route path="/notifications" element={<AllNotifications />} />
          <Route path="/priority" element={<PriorityInbox />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}